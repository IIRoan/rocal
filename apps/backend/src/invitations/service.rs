//! `MailCalendarIngestionService` and `lib/mail-invitation-calendar.ts`: mailed ICS becomes the attendee's copy, staged until answered.

use std::collections::HashMap;

use sea_orm::{ConnectionTrait, Set};
use serde::Deserialize;
use serde_json::{Map, Value};
use solace_api_types::events::{
    ImportInvitationRequest, InvitationDeclined, InvitationEncryptionEntry, InvitationImportSummary,
};

use super::queries;
use super::rsvp_reply::{self, Reply, RsvpStatus};
use crate::calendars::queries as calendars;
use crate::db::entities::{calendar, calendar_event, event_participant};
use crate::entity_metadata::is_mail_invitation_staging_calendar;
use crate::error::AppError;
use crate::events::{participants, queries as events};
use crate::http::zod::js_trim;
use crate::instant;
use crate::integrations::ics::parse::{self, ParsedEvent};
use crate::integrations::ics::{ParticipantRole, RecurrenceRule, array_index, resolve_timezone};
use crate::state::AppState;
use crate::subscriptions::service::{
    self as subscriptions, link_series, participant_inputs, rows_by_uid, stored_participants,
};

const MAX_ICS_CONTENT_BYTES: usize = 1_048_576;
const MAX_ICS_EVENTS_PER_FILE: usize = 100;
const CALENDAR_MIME_TYPES: [&str; 5] = [
    "text/calendar",
    "text/x-vcalendar",
    "application/ics",
    "application/ical",
    "application/x-ical",
];

/// `resolveAcceptedInvitationTargetCalendar`: the requested, then the default, then the first writable calendar.
pub async fn resolve_accepted_invitation_target_calendar<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    calendar_id: Option<&str>,
) -> Result<Option<calendar::Model>, sea_orm::DbErr> {
    if let Some(id) = calendar_id.filter(|id| !id.is_empty())
        && let Some(requested) = queries::writable_calendar(db, user_id, id).await?
    {
        return Ok(Some(requested));
    }
    let default_id = events::settings(db, user_id)
        .await?
        .and_then(|settings| settings.default_calendar_id)
        .filter(|id| !id.is_empty());
    if let Some(id) = default_id
        && let Some(default) = queries::writable_calendar(db, user_id, &id).await?
    {
        return Ok(Some(default));
    }
    queries::first_writable_calendar(db, user_id).await
}

/// `resolveInvitationStagingCalendar`: the hidden Invitations calendar, created on first use.
pub async fn resolve_invitation_staging_calendar<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<calendar::Model, sea_orm::DbErr> {
    if let Some(existing) = queries::staging_calendar(db, user_id).await? {
        return Ok(existing);
    }
    let staging = calendars::new_calendar(
        user_id,
        crate::entity_metadata::MAIL_INVITATION_STAGING_CALENDAR_NAME,
        "#78716c",
        false,
        false,
    );
    calendars::insert(db, staging).await
}

/// A JMAP `Email` as mail sync fetches it: the body structure and the decoded text parts.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailEmail {
    pub id: String,
    #[serde(default)]
    pub body_structure: Option<BodyPart>,
    /// Kept as an object so part ids iterate in the order JavaScript gives them.
    #[serde(default)]
    pub body_values: Map<String, Value>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BodyPart {
    #[serde(default)]
    pub part_id: Option<String>,
    #[serde(default)]
    pub r#type: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub sub_parts: Vec<BodyPart>,
}

struct Source {
    id: String,
    ics: String,
}

#[derive(Default)]
struct Ingest {
    status: Option<RsvpStatus>,
    calendar_id: Option<String>,
    encryption: HashMap<String, InvitationEncryptionEntry>,
}

impl Ingest {
    /// A moved occurrence (`UID::RECURRENCE::...`) the client did not seal on its own takes its series' sealed content.
    fn seal_for(&self, external_id: &str) -> Option<&InvitationEncryptionEntry> {
        self.encryption.get(external_id).or_else(|| {
            external_id
                .split_once("::RECURRENCE::")
                .and_then(|(series, _)| self.encryption.get(series))
        })
    }
}

fn summary(messages_scanned: usize, parts: usize) -> InvitationImportSummary {
    InvitationImportSummary {
        messages_scanned: messages_scanned as i64,
        ics_parts_found: parts as i64,
        events_created: 0,
        events_updated: 0,
        events_deleted: 0,
        errors: Vec::new(),
    }
}

/// `ingestIcsContent` for a decrypted invitation the client posts; a status accepts it, otherwise it is staged.
pub async fn import_ics(
    state: &AppState,
    user_id: &str,
    request: ImportInvitationRequest,
) -> Result<InvitationImportSummary, AppError> {
    let status = match request.status.as_deref() {
        Some("accepted") => Some(RsvpStatus::Accepted),
        Some("tentative") => Some(RsvpStatus::Tentative),
        _ => None,
    };
    let source = Source {
        id: "Decrypted mail invitation".into(),
        ics: request.ics_content,
    };
    let options = Ingest {
        status,
        calendar_id: request.calendar_id.map(|id| id.0),
        encryption: index_encryption(request.encryption.unwrap_or_default()),
    };
    ingest(state, user_id, 1, vec![source], options).await
}

/// `ingestFromEmails`: background mail sync stages every ICS part it finds and sends no scheduling mail.
pub async fn ingest_from_emails(
    state: &AppState,
    user_id: &str,
    emails: &[MailEmail],
) -> Result<InvitationImportSummary, AppError> {
    let sources = emails
        .iter()
        .flat_map(|email| {
            ics_payloads(email).into_iter().map(|ics| Source {
                id: format!("Message {}", email.id),
                ics,
            })
        })
        .collect();
    ingest(state, user_id, emails.len(), sources, Ingest::default()).await
}

/// `indexInvitationImportEncryption`: entries by trimmed UID, without blank ones.
fn index_encryption(
    entries: Vec<InvitationEncryptionEntry>,
) -> HashMap<String, InvitationEncryptionEntry> {
    entries
        .into_iter()
        .filter_map(|entry| {
            let external_id = js_trim(&entry.external_id).to_owned();
            let content = js_trim(&entry.encrypted_content).to_owned();
            (!external_id.is_empty() && !content.is_empty()).then(|| {
                let entry = InvitationEncryptionEntry {
                    external_id: external_id.clone(),
                    encrypted_content: content,
                    ..entry
                };
                (external_id, entry)
            })
        })
        .collect()
}

fn is_calendar_part(part: &BodyPart) -> bool {
    let media = part
        .r#type
        .as_deref()
        .and_then(|value| value.split(';').next())
        .map(|value| js_trim(value).to_lowercase())
        .unwrap_or_default();
    let name = part
        .name
        .as_deref()
        .map(|value| js_trim(value).to_lowercase())
        .unwrap_or_default();
    CALENDAR_MIME_TYPES.contains(&media.as_str())
        || name.ends_with(".ics")
        || name.ends_with(".ical")
}

fn collect_calendar_parts(part: Option<&BodyPart>, ids: &mut Vec<String>) {
    let Some(part) = part else {
        return;
    };
    if let Some(id) = part.part_id.as_ref().filter(|id| !id.is_empty())
        && is_calendar_part(part)
        && !ids.contains(id)
    {
        ids.push(id.clone());
    }
    for sub in &part.sub_parts {
        collect_calendar_parts(Some(sub), ids);
    }
}

/// `extractIcsPayloads`: calendar parts first, then any other decoded part that holds a VCALENDAR.
fn ics_payloads(email: &MailEmail) -> Vec<String> {
    let value_of = |id: &str| {
        email
            .body_values
            .get(id)
            .and_then(|value| value.get("value"))
            .and_then(Value::as_str)
            .map(js_trim)
            .filter(|value| {
                !value.is_empty() && value.to_ascii_uppercase().contains("BEGIN:VCALENDAR")
            })
            .map(str::to_owned)
    };
    let mut ids = Vec::new();
    collect_calendar_parts(email.body_structure.as_ref(), &mut ids);
    let mut payloads: Vec<(String, String)> = ids
        .iter()
        .filter_map(|id| value_of(id).map(|value| (id.clone(), value)))
        .collect();
    let mut keys: Vec<&String> = email.body_values.keys().collect();
    keys.sort_by_key(|key| array_index(key).map_or((1, 0), |index| (0, index)));
    for key in keys {
        if let Some(value) = value_of(key) {
            match payloads.iter_mut().find(|(id, _)| id == key) {
                Some(slot) => slot.1 = value,
                None => payloads.push((key.clone(), value)),
            }
        }
    }
    payloads.into_iter().map(|(_, value)| value).collect()
}

async fn user_timezone(state: &AppState, user_id: &str) -> Result<String, AppError> {
    let settings = events::settings(&state.db, user_id).await?;
    Ok(resolve_timezone(
        settings.as_ref().map(|s| s.timezone.as_str()),
    ))
}

async fn user_email(state: &AppState, user_id: &str) -> Result<Option<String>, AppError> {
    Ok(events::user(&state.db, user_id)
        .await?
        .map(|user| js_trim(&user.email).to_lowercase())
        .filter(|email| !email.is_empty()))
}

/// `ingestPayloadSources`: parse errors and per-file failures land in the summary, not in the response status.
async fn ingest(
    state: &AppState,
    user_id: &str,
    messages_scanned: usize,
    sources: Vec<Source>,
    options: Ingest,
) -> Result<InvitationImportSummary, AppError> {
    let mut summary = summary(messages_scanned, sources.len());
    if sources.is_empty() {
        return Ok(summary);
    }
    let timezone = user_timezone(state, user_id).await?;
    let target = match options.status {
        Some(_) => {
            resolve_accepted_invitation_target_calendar(
                &state.db,
                user_id,
                options.calendar_id.as_deref(),
            )
            .await?
        }
        None => Some(resolve_invitation_staging_calendar(&state.db, user_id).await?),
    };
    let Some(target) = target else {
        summary
            .errors
            .push("No writable calendar is available for ICS mail imports.".into());
        return Ok(summary);
    };
    // Only the hidden staging calendar holds server-readable copies; other calendars take client-sealed ones.
    let needs_seal = !is_mail_invitation_staging_calendar(
        &target.kind,
        target.is_sync_only,
        target.is_visible,
        &target.name,
    );
    let account_id = queries::stalwart_account_id(&state.db, user_id).await?;
    let place = Target {
        calendar: &target,
        account_id: account_id.as_deref(),
    };
    for source in &sources {
        if source.ics.len() > MAX_ICS_CONTENT_BYTES {
            summary.errors.push(format!(
                "{}: ICS content exceeds the 1 MB size limit and was skipped.",
                source.id
            ));
            continue;
        }
        let parsed = parse::parse(&source.ics, &timezone);
        summary.errors.extend(
            parsed
                .errors
                .iter()
                .map(|error| format!("{}: {error}", source.id)),
        );
        if parsed.events.is_empty() {
            summary
                .errors
                .push(format!("{}: no valid ICS events found.", source.id));
            continue;
        }
        if parsed.events.len() > MAX_ICS_EVENTS_PER_FILE {
            summary.errors.push(format!(
                "{}: ICS file contains {} events which exceeds the limit of {MAX_ICS_EVENTS_PER_FILE}; skipped.",
                source.id,
                parsed.events.len()
            ));
            continue;
        }
        if needs_seal
            && parsed.method != "CANCEL"
            && parsed
                .events
                .iter()
                .any(|event| options.seal_for(&event.uid).is_none())
        {
            summary.errors.push(format!(
                "{}: This calendar requires encrypted event details; automatic server-side mail import is unavailable.",
                source.id
            ));
            continue;
        }
        let outcome = if parsed.method == "CANCEL" {
            cancel(state, user_id, &parsed.events).await.map(|n| (0, n))
        } else {
            upsert(state, user_id, &place, &parsed.events, &options).await
        };
        match outcome {
            Ok((created, updated)) => {
                summary.events_created += created as i64;
                summary.events_updated += updated as i64;
            }
            Err(error) => {
                summary
                    .errors
                    .push(format!("{}: {}", source.id, import_error_message(&error)))
            }
        }
    }
    if summary.events_created > 0 || summary.events_updated > 0 {
        tracing::info!(
            calendar_id = %target.id,
            events_created = summary.events_created,
            events_updated = summary.events_updated,
            events_deleted = summary.events_deleted,
            "Imported calendar changes from mail"
        );
    }
    Ok(summary)
}

/// Validation messages are user-safe; anything else would leak database internals.
fn import_error_message(error: &AppError) -> String {
    match error {
        AppError::Validation { message, .. } => message.clone(),
        _ => "Unknown ICS import error".into(),
    }
}

async fn cancel(state: &AppState, user_id: &str, parsed: &[ParsedEvent]) -> Result<u64, AppError> {
    let mut updated = 0;
    for event in parsed {
        updated += queries::cancel(&state.db, user_id, &event.uid, instant::now()).await?;
    }
    Ok(updated)
}

struct Target<'a> {
    calendar: &'a calendar::Model,
    account_id: Option<&'a str>,
}

/// The ciphertext a client sealed for one UID.
struct Sealed {
    encrypted_content: String,
    blind_index_tokens: Option<String>,
    encryption_key_version: i32,
}

/// `buildInvitationLocalEventData`: scheduling fields, plus the parsed plaintext for staging or the client's ciphertext.
struct LocalData {
    start: time::PrimitiveDateTime,
    end: time::PrimitiveDateTime,
    all_day: bool,
    recurrence: Option<String>,
    timezone: String,
    synced_at: time::PrimitiveDateTime,
    /// Absent when the stored copy is already encrypted.
    content: Option<(String, Option<String>, Option<String>)>,
    sealed: Option<Sealed>,
}

fn local_data(
    parsed: &ParsedEvent,
    encryption: Option<&InvitationEncryptionEntry>,
    existing_state: Option<&str>,
) -> LocalData {
    let mut data = LocalData {
        start: parsed.start,
        end: parsed.end,
        all_day: parsed.all_day,
        recurrence: parsed.recurrence.as_ref().map(RecurrenceRule::to_json),
        timezone: resolve_timezone(parsed.timezone.as_deref()),
        synced_at: instant::now(),
        content: Some((
            parsed.title.clone(),
            parsed.description.clone(),
            parsed.location.clone(),
        )),
        sealed: None,
    };
    if existing_state == Some("encrypted") {
        data.content = None;
        return data;
    }
    let Some(entry) = encryption.filter(|e| !js_trim(&e.encrypted_content).is_empty()) else {
        return data;
    };
    data.content = Some((String::new(), None, None));
    data.sealed = Some(Sealed {
        encrypted_content: entry.encrypted_content.clone(),
        blind_index_tokens: entry
            .blind_index_tokens
            .as_ref()
            .map(|tokens| serde_json::to_string(tokens).unwrap_or_default()),
        encryption_key_version: entry.encryption_key_version.unwrap_or(1),
    });
    data
}

impl LocalData {
    fn apply_schedule(&self, row: &mut calendar_event::ActiveModel) {
        row.start = Set(self.start);
        row.end = Set(self.end);
        row.all_day = Set(self.all_day);
        row.recurrence = Set(self.recurrence.clone());
        row.timezone = Set(self.timezone.clone());
        row.is_cancelled = Set(false);
        row.synced_at = Set(Some(self.synced_at));
    }

    /// `extractEncryptionOnlyFields`.
    fn apply_content(&self, row: &mut calendar_event::ActiveModel) {
        if let Some((title, description, location)) = &self.content {
            row.title = Set(title.clone());
            row.description = Set(description.clone());
            row.location = Set(location.clone());
        }
        if let Some(sealed) = &self.sealed {
            row.encrypted_content = Set(Some(sealed.encrypted_content.clone()));
            if let Some(tokens) = &sealed.blind_index_tokens {
                row.blind_index_tokens = Set(Some(tokens.clone()));
            }
            row.encryption_state = Set("encrypted".into());
            row.encryption_key_version = Set(sealed.encryption_key_version);
        }
    }

    /// A new plaintext or sealed copy of the invitation.
    fn new_row(
        &self,
        parsed: &ParsedEvent,
        user_id: &str,
        calendar_id: &str,
    ) -> calendar_event::ActiveModel {
        let mut row = calendar_event::ActiveModel {
            title: Set(parsed.title.clone()),
            external_id: Set(Some(parsed.uid.clone())),
            is_synced: Set(false),
            user_id: Set(user_id.to_owned()),
            calendar_id: Set(calendar_id.to_owned()),
            ..Default::default()
        };
        self.apply_schedule(&mut row);
        self.apply_content(&mut row);
        row
    }
}

/// `isUserDeclinedOnEvent`: the user's own attendee row says declined.
fn user_declined(user_id: &str, rows: &[event_participant::Model]) -> bool {
    rows.iter()
        .find(|row| row.user_id.as_deref() == Some(user_id) && row.role != "organizer")
        .is_some_and(|row| row.status == "declined")
}

async fn apply_attendee_status(
    state: &AppState,
    user_id: &str,
    event_id: &str,
    status: RsvpStatus,
) -> Result<(), AppError> {
    let Some(email) = user_email(state, user_id).await? else {
        return Ok(());
    };
    queries::set_status_by_email(&state.db, event_id, &email, status.as_str(), instant::now())
        .await?;
    Ok(())
}

/// `upsertEvents`: new UIDs become copies, changed ones are rewritten and moved to the target, and declined copies stay put unless answered again.
async fn upsert(
    state: &AppState,
    user_id: &str,
    target: &Target<'_>,
    parsed_events: &[ParsedEvent],
    options: &Ingest,
) -> Result<(u64, u64), AppError> {
    let uids = parsed_events
        .iter()
        .map(|event| event.uid.clone())
        .collect();
    let existing = queries::copies(&state.db, user_id, uids).await?;
    let rows =
        events::participants_by_event(&state.db, existing.iter().map(|e| e.id.clone()).collect())
            .await?;
    let by_uid: HashMap<&str, &calendar_event::Model> = existing
        .iter()
        .filter_map(|event| event.external_id.as_deref().map(|uid| (uid, event)))
        .collect();
    let (mut created, mut updated) = (0, 0);
    for parsed in parsed_events {
        let encryption = options.seal_for(&parsed.uid);
        let inputs = participant_inputs(parsed.participants.as_deref());
        let Some(existing) = by_uid.get(parsed.uid.as_str()).copied() else {
            let data = local_data(parsed, encryption, None);
            let row = events::insert(
                &state.db,
                data.new_row(parsed, user_id, &target.calendar.id),
            )
            .await?;
            participants::sync(&state.db, &row.id, &inputs, None).await?;
            if let Some(status) = options.status {
                apply_attendee_status(state, user_id, &row.id, status).await?;
            }
            created += 1;
            continue;
        };
        let stored = rows.get(&existing.id).map_or(&[][..], Vec::as_slice);
        if user_declined(user_id, stored) && options.status.is_none() {
            continue;
        }
        let participants_changed = parse::participants_differ(
            &stored_participants(stored),
            parsed.participants.as_deref(),
        );
        let data = local_data(parsed, encryption, Some(&existing.encryption_state));
        let apply_encryption = encryption.is_some() && existing.encryption_state != "encrypted";
        let event_changed = parse::is_modified(&subscriptions::stored(existing), parsed);
        let should_update = event_changed
            || existing.calendar_id != target.calendar.id
            || options.status.is_some()
            || apply_encryption;
        if should_update {
            let remote_id = existing.stalwart_event_id.clone();
            let mut row: calendar_event::ActiveModel = existing.clone().into();
            if event_changed {
                data.apply_schedule(&mut row);
                data.apply_content(&mut row);
            } else if apply_encryption {
                data.apply_content(&mut row);
            }
            row.calendar_id = Set(target.calendar.id.clone());
            row.stalwart_account_id = Set(target.account_id.map(str::to_owned));
            row.stalwart_calendar_id = Set(target.calendar.stalwart_calendar_id.clone());
            row.stalwart_synced_at = Set(remote_id.as_ref().map(|_| instant::now()));
            row.stalwart_event_id = Set(remote_id);
            row.stalwart_uid = Set(Some(parsed.uid.clone()));
            events::update(&state.db, row).await?;
            updated += 1;
        }
        if participants_changed {
            participants::sync(&state.db, &existing.id, &inputs, None).await?;
            if !should_update {
                updated += 1;
            }
        }
        if let Some(status) = options.status {
            apply_attendee_status(state, user_id, &existing.id, status).await?;
        }
    }
    let uids = parsed_events
        .iter()
        .flat_map(|event| [event.uid.clone(), event.source_uid.clone()])
        .collect();
    let copies = queries::copies(&state.db, user_id, uids).await?;
    link_series(&state.db, &rows_by_uid(copies), parsed_events).await?;
    Ok((created, updated))
}

/// `declineIcsInvitation`: replies to the organizer and keeps a hidden declined copy, so mail never stages it again.
pub async fn decline_ics(
    state: &AppState,
    user_id: &str,
    ics_content: &str,
) -> Result<InvitationDeclined, AppError> {
    let declined = InvitationDeclined { declined: true };
    if ics_content.len() > MAX_ICS_CONTENT_BYTES {
        return Err(AppError::internal(
            "ICS content exceeds the 1 MB size limit.",
        ));
    }
    let timezone = user_timezone(state, user_id).await?;
    let parsed = parse::parse(ics_content, &timezone);
    let Some(event) = parsed.events.first() else {
        return Ok(declined);
    };
    let email = user_email(state, user_id).await?;
    if let Some(email) = email.as_deref() {
        let organizer = event
            .participants
            .as_deref()
            .unwrap_or_default()
            .iter()
            .find(|p| p.role == Some(ParticipantRole::Organizer))
            .filter(|p| !p.email.is_empty());
        if let Some(organizer) = organizer {
            rsvp_reply::send(
                state,
                &Reply {
                    organizer_email: &organizer.email,
                    attendee_email: email,
                    attendee_display_name: None,
                    title: &event.title,
                    uid: &event.uid,
                    start: event.start,
                    end: event.end,
                    all_day: event.all_day,
                    timezone: event.timezone.as_deref(),
                    status: RsvpStatus::Declined,
                },
            )
            .await;
        }
    }
    record_declined_tombstone(state, user_id, event).await?;
    Ok(declined)
}

/// `recordDeclinedInvitationTombstone`: the copy moves to (or is created in) the staging calendar with the user declined.
async fn record_declined_tombstone(
    state: &AppState,
    user_id: &str,
    parsed: &ParsedEvent,
) -> Result<(), AppError> {
    let staging = resolve_invitation_staging_calendar(&state.db, user_id).await?;
    let email = user_email(state, user_id).await?;
    let mut inputs = participant_inputs(parsed.participants.as_deref());
    for input in &mut inputs {
        if email.as_deref() == Some(js_trim(&input.email).to_lowercase().as_str()) {
            input.status = Some("declined".into());
        }
    }
    // A tombstone only blocks re-importing the invitation, so the declined event's text is not kept.
    let event_id = match events::by_external_id(&state.db, user_id, &parsed.uid).await? {
        Some(existing) => {
            let id = existing.id.clone();
            let mut row: calendar_event::ActiveModel = existing.into();
            row.calendar_id = Set(staging.id);
            row.stalwart_event_id = Set(None);
            row.stalwart_synced_at = Set(None);
            row.title = Set(String::new());
            row.description = Set(None);
            row.location = Set(None);
            events::update(&state.db, row).await?;
            id
        }
        None => {
            let mut data = local_data(parsed, None, None);
            data.content = Some((String::new(), None, None));
            events::insert(&state.db, data.new_row(parsed, user_id, &staging.id))
                .await?
                .id
        }
    };
    participants::sync(&state.db, &event_id, &inputs, None).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn email(body: Value) -> MailEmail {
        serde_json::from_value(body).unwrap()
    }

    #[test]
    fn calendar_parts_come_first_then_any_part_holding_a_vcalendar() {
        let message = email(json!({
            "id": "m1",
            "bodyStructure": {"partId": "0", "type": "multipart/mixed", "subParts": [
                {"partId": "text", "type": "text/plain"},
                {"partId": "cal", "type": "Text/Calendar; method=REQUEST"},
                {"partId": "file", "type": "application/octet-stream", "name": "Invite.ICS"},
            ]},
            "bodyValues": {
                "text": {"value": "  begin:vcalendar inline  "},
                "file": {"value": "BEGIN:VCALENDAR file"},
                "cal": {"value": "BEGIN:VCALENDAR cal"},
                "2": {"value": "BEGIN:VCALENDAR two"},
                "1": {"value": "no calendar here"},
            },
        }));
        assert_eq!(
            ics_payloads(&message),
            [
                "BEGIN:VCALENDAR cal",
                "BEGIN:VCALENDAR file",
                "BEGIN:VCALENDAR two",
                "begin:vcalendar inline",
            ]
        );
        assert!(ics_payloads(&email(json!({"id": "m2"}))).is_empty());
    }

    #[test]
    fn encryption_entries_are_indexed_by_trimmed_uid() {
        let entry = |uid: &str, content: &str| InvitationEncryptionEntry {
            external_id: uid.into(),
            encrypted_content: content.into(),
            blind_index_tokens: None,
            encryption_key_version: Some(2),
        };
        let index = index_encryption(vec![entry(" a ", " x "), entry("b", "  "), entry(" ", "y")]);
        assert_eq!(index.len(), 1);
        assert_eq!(index["a"].encrypted_content, "x");
        assert_eq!(index["a"].encryption_key_version, Some(2));
    }
}
