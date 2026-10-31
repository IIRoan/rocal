use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use solace_api_types::riftbound::{RiftboundPublicEvent, RiftboundStore};

use std::{
    collections::{BTreeSet, HashSet},
    sync::{Arc, LazyLock},
    time::Duration,
};
use tokio::task::JoinSet;
use unicode_normalization::UnicodeNormalization;

use crate::{
    auth::guard::RouteUser,
    error::AppError,
    http::{
        rate_limit::{self, Limit},
        zod::js_trim,
    },
    state::AppState,
};

use super::{
    cache::TtlCache,
    upstream::{SEARCH, organizer, query, tournament, unavailable},
};

/// The clients accept this many events per sync; later ones arrive as earlier ones pass.
const MAX_EVENTS: usize = 200;
const MAX_ROSTER: usize = 2000;
const EVENT_TEXT: usize = 1000;
/// Store names and addresses live in sealed settings, which have a size cap.
const STORE_TEXT: usize = 200;
const CACHE_TTL: Duration = Duration::from_secs(600);
const CACHE_BYTES: usize = 8 << 20;

static STORE_EVENTS: LazyLock<TtlCache<Arc<Vec<RiftboundPublicEvent>>>> =
    LazyLock::new(|| TtlCache::new(CACHE_TTL, CACHE_BYTES));
static ROSTERS: LazyLock<TtlCache<Arc<Vec<String>>>> =
    LazyLock::new(|| TtlCache::new(CACHE_TTL, CACHE_BYTES));

/// Upstream text as the clients accept it: no control characters, trimmed, at most `max` UTF-16 units.
fn clean(value: Option<&Value>, max: usize) -> String {
    let text: String = value
        .and_then(Value::as_str)
        .unwrap_or_default()
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    let mut units = 0;
    let truncated: String = js_trim(&text)
        .chars()
        .take_while(|c| {
            units += c.len_utf16();
            units <= max
        })
        .collect();
    js_trim(&truncated).to_owned()
}

fn enforce(user: &RouteUser) -> Result<(), AppError> {
    rate_limit::enforce("riftbound", &user.id, Limit::per_minute(12))
}

fn store_model(value: &Value) -> Option<RiftboundStore> {
    let name = clean(value.get("name"), STORE_TEXT);
    (!name.is_empty()).then(|| RiftboundStore {
        id: value
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .into(),
        name,
        address: clean(
            value.pointer("/physicalAddress/formattedAddress"),
            STORE_TEXT,
        ),
    })
}

pub async fn resolve_store(
    state: &AppState,
    user: &RouteUser,
    id: &str,
) -> Result<RiftboundStore, AppError> {
    if id.is_empty() || !id.bytes().all(|b| b.is_ascii_digit()) {
        return Err(AppError::validation("Use a valid Riftbound event link."));
    }
    enforce(user)?;
    let event = tournament(state, id)
        .await?
        .ok_or_else(|| AppError::NotFound("Riftbound event not found.".into()))?;
    let organizer_id = event
        .get("organizerId")
        .and_then(Value::as_str)
        .unwrap_or_default();
    organizer(state, organizer_id)
        .await?
        .as_ref()
        .and_then(store_model)
        .ok_or_else(|| AppError::NotFound("Riftbound store not found.".into()))
}

fn search_start(now: time::PrimitiveDateTime) -> solace_api_types::Timestamp {
    crate::instant::iso(now - time::Duration::days(30))
}

fn identity_hash(name: &str, tag: &str) -> String {
    let identity = format!(
        "{}#{}",
        js_trim(&name.nfkc().collect::<String>()).to_lowercase(),
        js_trim(&tag.nfkc().collect::<String>()).to_lowercase()
    );
    hex::encode(Sha256::digest(identity.as_bytes()))
}

/// A search result's tournament, or `None` when Riot sent a record the clients cannot use.
fn event_model(value: &Value, store_id: &str) -> Option<RiftboundPublicEvent> {
    let id = value.get("id")?.as_str()?;
    if id.is_empty() || id.len() > 30 || !id.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let instant = value
        .get("startsAt")?
        .as_str()?
        .parse::<jiff::Timestamp>()
        .ok()?;
    let start = crate::instant::iso(crate::instant::from_unix_millis(instant.as_millisecond())?);
    let title = clean(value.get("name"), EVENT_TEXT);
    (!title.is_empty()).then(|| RiftboundPublicEvent {
        id: id.into(),
        store_id: store_id.into(),
        title,
        start,
        location: clean(
            value.pointer("/tournamentLocation/formattedAddress"),
            EVENT_TEXT,
        ),
        registered_riot_id_hashes: Vec::new(),
    })
}

/// Hashes of the registered players' Riot IDs, or `None` when the roster is missing or too large.
fn registered_hashes(tournament: &Value) -> Option<Vec<String>> {
    let roster = tournament.get("tournamentRegistrants")?.as_array()?;
    if roster.len() > MAX_ROSTER {
        return None;
    }
    Some(
        roster
            .iter()
            .filter(|row| row.get("status").and_then(Value::as_str) == Some("REGISTERED"))
            .filter_map(|row| {
                let player = row.get("player")?;
                Some(identity_hash(
                    player.get("displayName")?.as_str()?,
                    player.get("tagLine")?.as_str()?,
                ))
            })
            .collect(),
    )
}

fn coordinates(store: &Value) -> Option<(f64, f64)> {
    let latitude = store
        .pointer("/physicalAddress/latitude")?
        .as_f64()
        .filter(|n| (-90.0..=90.0).contains(n))?;
    let longitude = store
        .pointer("/physicalAddress/longitude")?
        .as_f64()
        .filter(|n| (-180.0..=180.0).contains(n))?;
    Some((latitude, longitude))
}

pub async fn events(
    state: &AppState,
    user: &RouteUser,
    ids: &[String],
    include_registrations: bool,
) -> Result<Vec<RiftboundPublicEvent>, AppError> {
    if ids.iter().any(|id| uuid::Uuid::parse_str(id).is_err()) {
        return Err(AppError::validation("Use resolved Riftbound store IDs."));
    }
    rate_limit::enforce("riftbound-events", &user.id, Limit::per_minute(3))?;
    tokio::time::timeout(
        Duration::from_secs(60),
        load_events(state, ids, include_registrations),
    )
    .await
    .map_err(|_| unavailable("timeout"))?
}

/// One store's events from 30 days ago on, earliest first; a store Riot no longer lists has none.
async fn store_events(
    state: &AppState,
    store_id: &str,
) -> Result<Arc<Vec<RiftboundPublicEvent>>, AppError> {
    if let Some(events) = STORE_EVENTS.get(store_id) {
        return Ok(events);
    }
    let mut events = Vec::new();
    if let Some((latitude, longitude)) = organizer(state, store_id)
        .await?
        .as_ref()
        .and_then(coordinates)
    {
        let start = search_start(crate::instant::now());
        let mut cursor = Value::Null;
        // Ten pages of 100 bound one store's crawl; Riot returns them earliest first.
        for _ in 0..10 {
            let data = query(state, SEARCH, json!({"sport":"rb","first":100,"after":cursor,"filter":{"rb":{"coords":{"latitude":latitude,"longitude":longitude},"distanceMeters":1000,"startDate":start}}})).await?;
            let edges = data
                .pointer("/competeTournamentSearch/edges")
                .and_then(Value::as_array)
                .ok_or_else(|| unavailable("search"))?;
            events.extend(
                edges
                    .iter()
                    .filter(|edge| {
                        edge.pointer("/node/organizer/id").and_then(Value::as_str) == Some(store_id)
                    })
                    .filter_map(|edge| event_model(edge.pointer("/node/tournament")?, store_id)),
            );
            let page = data.pointer("/competeTournamentSearch/pageInfo");
            match (
                page.and_then(|p| p.get("hasNextPage"))
                    .and_then(Value::as_bool),
                page.and_then(|p| p.get("endCursor"))
                    .and_then(Value::as_str),
            ) {
                (Some(true), Some(next)) if cursor.as_str() != Some(next) => {
                    cursor = Value::String(next.into());
                }
                _ => break,
            }
        }
    }
    let weight = events
        .iter()
        .map(|e| e.title.len() + e.location.len() + 128)
        .sum::<usize>()
        + 128;
    let events = Arc::new(events);
    STORE_EVENTS.insert(store_id.to_owned(), weight, events.clone());
    Ok(events)
}

/// The event with its registered players' hashes, or `None` when its roster cannot be read.
async fn with_roster(
    state: AppState,
    mut event: RiftboundPublicEvent,
) -> Result<Option<RiftboundPublicEvent>, AppError> {
    let hashes = match ROSTERS.get(&event.id) {
        Some(hashes) => hashes,
        None => {
            let Some(hashes) = tournament(&state, &event.id)
                .await?
                .filter(|t| {
                    t.get("organizerId").and_then(Value::as_str) == Some(event.store_id.as_str())
                })
                .as_ref()
                .and_then(registered_hashes)
            else {
                return Ok(None);
            };
            let hashes = Arc::new(hashes);
            ROSTERS.insert(event.id.clone(), hashes.len() * 96 + 64, hashes.clone());
            hashes
        }
    };
    event.registered_riot_id_hashes = hashes.to_vec();
    Ok(Some(event))
}

/// Upcoming events first, then the most recent past ones, so the cap never hides what is next.
fn prioritize(mut events: Vec<RiftboundPublicEvent>, now: &str) -> Vec<RiftboundPublicEvent> {
    let mut seen = HashSet::new();
    events.retain(|event| seen.insert(event.id.clone()));
    events.sort_by(|a, b| {
        let (a_next, b_next) = (a.start.0.as_str() >= now, b.start.0.as_str() >= now);
        b_next
            .cmp(&a_next)
            .then_with(|| {
                if a_next {
                    a.start.0.cmp(&b.start.0)
                } else {
                    b.start.0.cmp(&a.start.0)
                }
            })
            .then_with(|| a.id.cmp(&b.id))
    });
    events.truncate(MAX_EVENTS);
    events
}

async fn load_events(
    state: &AppState,
    ids: &[String],
    include_registrations: bool,
) -> Result<Vec<RiftboundPublicEvent>, AppError> {
    // A failing store or roster is skipped; only a sync left with nothing fails.
    let mut failed = false;
    let mut events = Vec::new();
    for store_id in ids.iter().collect::<BTreeSet<_>>() {
        match store_events(state, store_id).await {
            Ok(found) => events.extend(found.iter().cloned()),
            Err(_) => failed = true,
        }
    }
    let mut output = prioritize(events, &crate::instant::iso(crate::instant::now()).0);
    if include_registrations {
        let mut pending = std::mem::take(&mut output).into_iter();
        let mut tasks = JoinSet::new();
        for event in pending.by_ref().take(4) {
            tasks.spawn(with_roster(state.clone(), event));
        }
        while let Some(result) = tasks.join_next().await {
            match result {
                Ok(Ok(found)) => output.extend(found),
                _ => failed = true,
            }
            if let Some(event) = pending.next() {
                tasks.spawn(with_roster(state.clone(), event));
            }
        }
    }
    if failed && output.is_empty() {
        return Err(unavailable("partial"));
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovery_includes_recent_registrations_not_only_upcoming_events() {
        let now = time::macros::datetime!(2026-10-31 12:00:00);
        assert_eq!(search_start(now).0, "2026-10-01T12:00:00.000Z");
        assert!(search_start(now).0.as_str() < "2026-10-30T18:00:00.000Z");
    }

    #[test]
    fn identity_normalization_matches_javascript_unicode_and_whitespace() {
        assert_eq!(
            identity_hash("\u{feff}ΟΣ", "ＥＵ"),
            "effc6743672534bc0208eac8efda65d33512fce23bf74eada3c5b91301e3ed3a"
        );
    }

    #[test]
    fn roster_hashes_only_registered_players_and_drops_names() {
        let event = json!({"tournamentRegistrants":[
            {"status":"REGISTERED","player":{"displayName":"Fixture User","tagLine":"EU"}},
            {"status":"WAITLISTED","player":{"displayName":"Other","tagLine":"EU"}},
            {"status":"REGISTERED","player":null},
            {"status":"REGISTERED","player":{"displayName":"No Tag"}}
        ]});
        let hashes = registered_hashes(&event).unwrap();
        assert_eq!(hashes, vec![identity_hash("fixture user", "eu")]);
        assert!(
            !serde_json::to_string(&hashes)
                .unwrap()
                .contains("Fixture User")
        );
        assert_ne!(
            identity_hash("FixtureUser", "EU"),
            identity_hash("Fixture User", "EU")
        );
    }

    #[test]
    fn the_cap_keeps_upcoming_events_before_older_past_ones() {
        let event = |id: usize, start: &str| RiftboundPublicEvent {
            id: id.to_string(),
            store_id: "store".into(),
            title: "Fixture".into(),
            start: solace_api_types::Timestamp(start.into()),
            location: String::new(),
            registered_riot_id_hashes: Vec::new(),
        };
        let mut events: Vec<_> = (0..MAX_EVENTS)
            .map(|id| event(id, "2026-10-10T18:00:00.000Z"))
            .collect();
        events.push(event(900, "2026-10-29T18:00:00.000Z"));
        events.push(event(901, "2026-11-05T18:00:00.000Z"));
        events.push(event(902, "2026-11-01T18:00:00.000Z"));
        events.push(event(902, "2026-11-01T18:00:00.000Z"));
        let kept = prioritize(events, "2026-10-31T12:00:00.000Z");
        let ids: Vec<_> = kept.iter().take(3).map(|e| e.id.as_str()).collect();
        assert_eq!(ids, ["902", "901", "900"]);
        assert_eq!(kept.len(), MAX_EVENTS);
    }

    #[test]
    fn missing_or_oversized_rosters_drop_the_event_instead_of_matching_nobody() {
        assert_eq!(registered_hashes(&json!({"id":"123"})), None);
        let roster = vec![json!({"status":"REGISTERED"}); MAX_ROSTER + 1];
        assert_eq!(
            registered_hashes(&json!({"tournamentRegistrants":roster})),
            None
        );
    }

    #[test]
    fn unusable_records_are_skipped_and_text_is_cleaned_to_what_clients_accept() {
        let event = json!({"id":"123","name":"  Fixture\nNight ","startsAt":"2026-10-30T18:00:00Z","tournamentLocation":{"formattedAddress":"Street 1\nCity"}});
        let model = event_model(&event, "store").unwrap();
        assert_eq!(
            (model.title.as_str(), model.location.as_str()),
            ("Fixture Night", "Street 1 City")
        );
        assert_eq!(model.start.0, "2026-10-30T18:00:00.000Z");
        assert!(model.registered_riot_id_hashes.is_empty());
        assert!(
            event_model(
                &json!({"id":"123","name":" \n ","startsAt":"2026-10-30T18:00:00Z"}),
                "store"
            )
            .is_none()
        );
        assert!(
            event_model(
                &json!({"id":"x1","name":"Fixture","startsAt":"2026-10-30T18:00:00Z"}),
                "store"
            )
            .is_none()
        );
        assert!(
            event_model(
                &json!({"id":"123","name":"Fixture","startsAt":"soon"}),
                "store"
            )
            .is_none()
        );
        let long = "😀".repeat(EVENT_TEXT);
        assert_eq!(
            clean(Some(&json!(long)), EVENT_TEXT).encode_utf16().count(),
            EVENT_TEXT
        );
    }
}
