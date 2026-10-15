//! Event participants (`lib/event-participants.ts`, `EventParticipantService`): the organizer from the owner, deduped invitees, and their rows.

use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

use regex_lite::Regex;
use solace_api_types::events::{EventParticipant, ParticipantInput};

use super::queries;
use crate::addresses::is_reserved_system_email;
use crate::auth::cookies::encode_uri_component;
use crate::db::entities::{event_participant, user};
use crate::http::zod::js_trim;
use crate::instant;
use crate::integrations::ics::export::compare_base;
use crate::integrations::ics::{normalize_email, trimmed_text};

const UPLOADED_AVATAR_PATH_PREFIX: &str = "/api/profiles/avatars/";
const MAX_PUBLIC_IMAGE_URL_LENGTH: usize = 2048;

static BLOCKED_IMAGE_HOSTS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    [
        r"(?i)^localhost$",
        r"^127\.",
        r"^0\.",
        r"^10\.",
        r"^192\.168\.",
        r"^172\.(1[6-9]|2\d|3[0-1])\.",
        r"^169\.254\.",
        r"^::1$",
        r"^\[::1\]$",
        r"(?i)\.localhost$",
        r"(?i)\.local$",
        r"(?i)\.internal$",
        r"(?i)^metadata\.google\.internal$",
    ]
    .iter()
    .filter_map(|pattern| Regex::new(pattern).ok())
    .collect()
});

/// The values a participant row or input is resolved to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Resolved {
    pub email: String,
    pub display_name: String,
    pub user_id: Option<String>,
    pub role: &'static str,
    pub status: String,
}

/// An input after `resolveParticipantInputs`: deduped by address, the owner as organizer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Input {
    pub email: String,
    pub display_name: Option<String>,
    pub role: &'static str,
    pub status: String,
}

pub struct Owner {
    pub email: String,
    pub name: String,
}

pub fn normalize_role(role: Option<&str>) -> &'static str {
    if role == Some("organizer") {
        "organizer"
    } else {
        "attendee"
    }
}

pub fn normalize_status(status: Option<&str>, role: &str) -> String {
    match status {
        Some(status @ ("pending" | "accepted" | "declined" | "tentative")) => status.to_owned(),
        _ if role == "organizer" => "accepted".into(),
        _ => "pending".into(),
    }
}

/// `mergeParticipantInput`: a repeated address keeps the strongest role and the latest status.
fn merge(existing: Option<Input>, next: Input) -> Input {
    let Some(existing) = existing else {
        return next;
    };
    let role = if existing.role == "organizer" || next.role == "organizer" {
        "organizer"
    } else {
        "attendee"
    };
    let status = if role == "organizer" {
        "accepted".into()
    } else {
        next.status.clone()
    };
    Input {
        display_name: trimmed_text(next.display_name.as_deref())
            .or_else(|| trimmed_text(existing.display_name.as_deref())),
        email: next.email,
        role,
        status,
    }
}

/// `resolveParticipantInputs`: the owner first as accepted organizer, then each address once.
pub fn resolve_inputs(owner: Option<&Owner>, participants: &[ParticipantInput]) -> Vec<Input> {
    let owner_email = owner.map(|owner| normalize_email(&owner.email));
    let mut order: Vec<String> = Vec::new();
    let mut deduped: HashMap<String, Input> = HashMap::new();
    if let (Some(owner), Some(email)) = (owner, owner_email.as_ref().filter(|e| !e.is_empty())) {
        order.push(email.clone());
        deduped.insert(
            email.clone(),
            Input {
                email: email.clone(),
                display_name: Some(
                    trimmed_text(Some(&owner.name)).unwrap_or_else(|| email.clone()),
                ),
                role: "organizer",
                status: "accepted".into(),
            },
        );
    }
    for participant in participants {
        let email = normalize_email(&participant.email);
        if email.is_empty() || is_reserved_system_email(&email, None) {
            continue;
        }
        let role = if owner_email
            .as_deref()
            .is_some_and(|owner| !owner.is_empty() && owner == email)
        {
            "organizer"
        } else {
            normalize_role(participant.role.as_deref())
        };
        let next = Input {
            email: email.clone(),
            display_name: trimmed_text(participant.display_name.as_deref()),
            role,
            status: normalize_status(participant.status.as_deref(), role),
        };
        if !deduped.contains_key(&email) {
            order.push(email.clone());
        }
        let merged = merge(deduped.remove(&email), next);
        deduped.insert(email, merged);
    }
    order
        .into_iter()
        .filter_map(|email| deduped.remove(&email))
        .collect()
}

/// `sanitizePublicImageUrl`: only public HTTPS URLs without credentials survive.
fn is_public_image_url(value: Option<&str>) -> bool {
    let Some(trimmed) = value.map(js_trim).filter(|v| !v.is_empty()) else {
        return false;
    };
    if crate::http::zod::js_length(trimmed) > MAX_PUBLIC_IMAGE_URL_LENGTH {
        return false;
    }
    let Ok(url) = url::Url::parse(trimmed) else {
        return false;
    };
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
        return false;
    }
    let Some(host) = url.host_str().map(str::trim).filter(|h| !h.is_empty()) else {
        return false;
    };
    if BLOCKED_IMAGE_HOSTS
        .iter()
        .any(|pattern| pattern.is_match(host))
    {
        return false;
    }
    let ipv6 = host
        .trim_start_matches('[')
        .trim_end_matches(']')
        .to_lowercase();
    !(ipv6.contains(':')
        && (ipv6.starts_with("fc")
            || ipv6.starts_with("fd")
            || ipv6.starts_with("fe80")
            || ipv6 == "::1"))
}

/// The participant's picture as a Solace path, never a remote URL.
fn participant_image(image: Option<&str>, email: &str) -> Option<String> {
    if image.is_some_and(|image| image.starts_with(UPLOADED_AVATAR_PATH_PREFIX)) {
        return image.map(str::to_owned);
    }
    let email = normalize_email(email);
    (is_public_image_url(image) && !email.is_empty()).then(|| {
        format!(
            "/api/profiles/avatar?email={}",
            encode_uri_component(&email)
        )
    })
}

/// `mapEventParticipant`.
pub fn dto(row: &event_participant::Model, user: Option<&user::Model>) -> EventParticipant {
    let email = Some(normalize_email(&row.email))
        .filter(|email| !email.is_empty())
        .unwrap_or_else(|| {
            user.map(|user| normalize_email(&user.email))
                .unwrap_or_default()
        });
    let role = normalize_role(Some(&row.role));
    let display_name = row
        .display_name
        .clone()
        .or_else(|| user.map(|user| js_trim(&user.name).to_owned()))
        .unwrap_or_else(|| email.clone());
    EventParticipant {
        id: row.id.clone().into(),
        event_id: row.event_id.clone().into(),
        user_id: row.user_id.clone().map(Into::into),
        image: participant_image(user.and_then(|user| user.image.as_deref()), &email),
        display_name,
        role: role.into(),
        status: normalize_status(Some(&row.status), role),
        email,
        created_at: instant::iso(row.created_at),
        updated_at: instant::iso(row.updated_at),
    }
}

fn label(participant: &EventParticipant) -> &str {
    [
        &participant.display_name,
        &participant.email,
        &participant.id.0,
    ]
    .into_iter()
    .map(|value| js_trim(value))
    .find(|value| !value.is_empty())
    .unwrap_or_default()
}

/// `sortEventParticipants`: organizers first, then by name as the browser collates it.
pub fn sort(mut participants: Vec<EventParticipant>) -> Vec<EventParticipant> {
    let rank = |p: &EventParticipant| u8::from(p.role != "organizer");
    participants.sort_by(|left, right| {
        rank(left)
            .cmp(&rank(right))
            .then_with(|| compare_base(label(left), label(right)))
    });
    participants
}

/// `mapAndSortParticipants`: reserved system addresses never show.
pub fn map_and_sort(
    rows: &[(event_participant::Model, Option<user::Model>)],
) -> Vec<EventParticipant> {
    sort(
        rows.iter()
            .map(|(row, user)| dto(row, user.as_ref()))
            .filter(|participant| !is_reserved_system_email(&participant.email, None))
            .collect(),
    )
}

/// The outcome of `syncParticipants`: the rows now on the event, and who still needs an invitation.
pub struct Synced {
    pub participants: Vec<EventParticipant>,
    pub resolved: Vec<Resolved>,
    pub new_invitees: Vec<Resolved>,
    pub owner: Option<Owner>,
}

/// `EventParticipantService.syncParticipants` without the mail: rows are created, updated and removed to match; without an owner no organizer row is added.
pub async fn sync<C: sea_orm::ConnectionTrait>(
    db: &C,
    event_id: &str,
    participants: &[ParticipantInput],
    owner_user_id: Option<&str>,
) -> Result<Synced, sea_orm::DbErr> {
    let owner = match owner_user_id {
        Some(id) => queries::user(db, id).await?,
        None => None,
    };
    let owner = owner.and_then(|owner| {
        let email = normalize_email(&owner.email);
        (!js_trim(&owner.email).is_empty()).then(|| Owner {
            name: trimmed_text(Some(&owner.name))
                .unwrap_or_else(|| js_trim(&owner.email).to_owned()),
            email,
        })
    });
    let inputs: Vec<Input> = resolve_inputs(owner.as_ref(), participants)
        .into_iter()
        .filter(|input| !is_reserved_system_email(&input.email, None))
        .collect();
    let resolved = resolve(db, inputs).await?;
    let existing = queries::participants_with_users(db, &[event_id.to_owned()]).await?;
    let key = |(row, user): &(event_participant::Model, Option<user::Model>)| {
        Some(normalize_email(&row.email))
            .filter(|email| !email.is_empty())
            .unwrap_or_else(|| {
                user.as_ref()
                    .map(|u| normalize_email(&u.email))
                    .unwrap_or_default()
            })
    };
    let reserved: Vec<String> = existing
        .iter()
        .filter(|entry| {
            let email = key(entry);
            !email.is_empty() && is_reserved_system_email(&email, None)
        })
        .map(|(row, _)| row.id.clone())
        .collect();
    if !reserved.is_empty() {
        queries::delete_participants(db, reserved.clone()).await?;
    }
    let mut existing_by_email: HashMap<String, event_participant::Model> = HashMap::new();
    for entry in existing
        .iter()
        .filter(|(row, _)| !reserved.contains(&row.id))
    {
        let email = key(entry);
        if !email.is_empty() {
            existing_by_email.insert(email, entry.0.clone());
        }
    }
    let next: HashSet<&str> = resolved.iter().map(|r| r.email.as_str()).collect();
    let removed: Vec<String> = existing_by_email
        .keys()
        .filter(|email| !next.contains(email.as_str()) || is_reserved_system_email(email, None))
        .cloned()
        .collect();
    if !removed.is_empty() {
        queries::delete_participants_by_email(db, event_id, removed).await?;
    }
    for participant in &resolved {
        let unchanged = existing_by_email
            .get(&participant.email)
            .is_some_and(|row| {
                row.user_id == participant.user_id
                    && row.display_name.as_deref() == Some(participant.display_name.as_str())
                    && row.role == participant.role
                    && row.status == participant.status
            });
        if !unchanged {
            queries::upsert_participant(db, event_id, participant).await?;
        }
    }
    let new_invitees = resolved
        .iter()
        .filter(|p| p.role != "organizer" && !existing_by_email.contains_key(&p.email))
        .filter(|p| !is_reserved_system_email(&p.email, None))
        .cloned()
        .collect();
    let rows = queries::participants_with_users(db, &[event_id.to_owned()]).await?;
    Ok(Synced {
        participants: rows
            .iter()
            .map(|(row, user)| dto(row, user.as_ref()))
            .filter(|p| !is_reserved_system_email(&p.email, None))
            .collect(),
        resolved,
        new_invitees,
        owner,
    })
}

/// Matches each address to a Solace user, by account first and then by mailbox directory.
async fn resolve<C: sea_orm::ConnectionTrait>(
    db: &C,
    inputs: Vec<Input>,
) -> Result<Vec<Resolved>, sea_orm::DbErr> {
    if inputs.is_empty() {
        return Ok(Vec::new());
    }
    let emails: Vec<String> = inputs.iter().map(|input| input.email.clone()).collect();
    let users: HashMap<String, user::Model> = queries::users_with_emails(db, emails.clone())
        .await?
        .into_iter()
        .map(|user| (normalize_email(&user.email), user))
        .collect();
    let directory: HashMap<String, Option<String>> = queries::directory_entries(db, emails)
        .await?
        .into_iter()
        .map(|entry| (normalize_email(&entry.email), entry.user_id))
        .collect();
    Ok(inputs
        .into_iter()
        .map(|input| {
            let user = users.get(&input.email);
            let role = if input.role == "organizer" {
                "organizer"
            } else {
                "attendee"
            };
            Resolved {
                display_name: trimmed_text(input.display_name.as_deref())
                    .or_else(|| user.and_then(|user| trimmed_text(Some(&user.name))))
                    .unwrap_or_else(|| input.email.clone()),
                user_id: user
                    .map(|user| user.id.clone())
                    .or_else(|| directory.get(&input.email).cloned().flatten()),
                status: if role == "organizer" {
                    "accepted".into()
                } else {
                    normalize_status(Some(&input.status), role)
                },
                role,
                email: input.email,
            }
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(email: &str, role: Option<&str>, status: Option<&str>) -> ParticipantInput {
        ParticipantInput {
            email: email.into(),
            display_name: None,
            role: role.map(Into::into),
            status: status.map(Into::into),
        }
    }

    #[test]
    fn emails_lose_mailto_case_and_spaces() {
        assert_eq!(
            normalize_email("  MAILTO:Ann@Example.COM "),
            "ann@example.com"
        );
        assert_eq!(normalize_email(""), "");
    }

    #[test]
    fn the_owner_leads_as_organizer_and_addresses_merge() {
        let owner = Owner {
            email: "Owner@Solace.test".into(),
            name: "  ".into(),
        };
        let resolved = resolve_inputs(
            Some(&owner),
            &[
                input("ann@example.com", None, Some("tentative")),
                input("OWNER@solace.test", Some("attendee"), Some("declined")),
                input("ann@example.com", Some("organizer"), None),
            ],
        );
        assert_eq!(resolved.len(), 2);
        assert_eq!(
            (
                resolved[0].email.as_str(),
                resolved[0].role,
                resolved[0].status.as_str()
            ),
            ("owner@solace.test", "organizer", "accepted")
        );
        assert_eq!(
            resolved[0].display_name.as_deref(),
            Some("owner@solace.test")
        );
        assert_eq!(
            (resolved[1].role, resolved[1].status.as_str()),
            ("organizer", "accepted")
        );
    }

    #[test]
    fn remote_pictures_become_solace_paths() {
        assert_eq!(
            participant_image(Some("https://images.example/a.png"), "Ann@Example.com").as_deref(),
            Some("/api/profiles/avatar?email=ann%40example.com")
        );
        assert_eq!(
            participant_image(Some("/api/profiles/avatars/abc"), "ann@example.com").as_deref(),
            Some("/api/profiles/avatars/abc")
        );
        for blocked in [
            "http://images.example/a.png",
            "https://127.0.0.1/a.png",
            "https://u:p@x.example/a",
            "https://printer.local/a",
        ] {
            assert_eq!(
                participant_image(Some(blocked), "ann@example.com"),
                None,
                "{blocked}"
            );
        }
    }

    #[test]
    fn organizers_sort_first_then_names_ignore_case_and_accents() {
        let participant = |name: &str, role: &str| EventParticipant {
            id: name.to_owned().into(),
            event_id: "e".to_owned().into(),
            user_id: None,
            email: format!("{name}@example.com"),
            display_name: name.into(),
            image: None,
            role: role.into(),
            status: "pending".into(),
            created_at: instant::iso(instant::now()),
            updated_at: instant::iso(instant::now()),
        };
        let sorted = sort(vec![
            participant("émile", "attendee"),
            participant("Zoe", "organizer"),
            participant("bob", "attendee"),
            participant("Ann", "attendee"),
        ]);
        let names: Vec<&str> = sorted.iter().map(|p| p.display_name.as_str()).collect();
        assert_eq!(names, ["Zoe", "Ann", "bob", "émile"]);
    }
}
