//! `/api/events/trash`: deleted events kept as JSON copies of their rows for 30 days, restored under the same ids and ciphertext.

use std::collections::{HashMap, HashSet};

use sea_orm::{
    ColumnTrait, ConnectionTrait, DbErr, EntityTrait, FromQueryResult, IdenStatic, Iterable,
    QueryFilter, QueryOrder, QuerySelect, Statement, TransactionTrait, Value as SqlValue,
};
use serde_json::Value;
use solace_api_types::SuccessMessage;
use solace_api_types::events::{Event, ParticipantInput, TrashedEvent, TrashedEventList};

use super::{participants, queries, view};
use crate::auth::guard::RouteUser;
use crate::calendars::queries as calendars;
use crate::db::cuid;
use crate::db::entities::{
    calendar, calendar_event, event_category, event_notification, recurrence_exception,
};
use crate::entity_metadata::is_mail_invitation_staging_calendar;
use crate::error::AppError;
use crate::instant;
use crate::state::AppState;

/// The worker purges entries older than this (`apps/notifications/src/retention.rs`).
pub const RETENTION_DAYS: i64 = 30;

const NOT_FOUND: &str = "Trashed event not found";

/// The list returns at most this many entries, so a full trash cannot make one response unbounded.
const LIST_LIMIT: i64 = 500;

/// One entry per root: the root and its children, their exceptions and reminders, and participants as email, role and status only. `$2` is `[{eventId, trashId, ids}]`, `ids` the locked family.
const TRASH_ROOTS: &str = r#"
INSERT INTO event_trash (id, user_id, event_id, calendar_id, rows)
SELECT r."trashId", e.user_id, e.id, e.calendar_id, jsonb_build_object(
    'events', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM calendar_event x WHERE x.id = ANY(r."ids")), '[]'::jsonb),
    'exceptions', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM recurrence_exception x WHERE x.parent_event_id = ANY(r."ids") OR x.modified_event_id = ANY(r."ids")), '[]'::jsonb),
    'reminders', coalesce((SELECT jsonb_agg(to_jsonb(n)) FROM event_notification n WHERE n.event_id = ANY(r."ids")), '[]'::jsonb),
    'participants', coalesce((SELECT jsonb_agg(jsonb_build_object('eventId', p.event_id, 'email', coalesce(nullif(p.email, ''), u.email), 'role', p.role, 'status', p.status))
        FROM event_participant p LEFT JOIN "user" u ON u.id = p.user_id WHERE p.event_id = ANY(r."ids")), '[]'::jsonb)
)
FROM jsonb_to_recordset($2::jsonb) AS r("eventId" text, "trashId" text, "ids" text[])
JOIN calendar_event e ON e.id = r."eventId" AND e.user_id = $1
RETURNING id"#;

/// Moves the owner's events, each with its children, into the trash and deletes them; a selected child of a selected series goes with its series. Returns the new entries' ids.
pub async fn trash_events<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    root_ids: &[String],
) -> Result<Vec<String>, DbErr> {
    // A racing delete or update waits here, so a second delete finds the rows gone and trashes nothing.
    let selected: Vec<(String, Option<String>)> = calendar_event::Entity::find()
        .select_only()
        .column(calendar_event::Column::Id)
        .column(calendar_event::Column::ParentEventId)
        .filter(calendar_event::Column::UserId.eq(user_id))
        .filter(calendar_event::Column::Id.is_in(root_ids.to_vec()))
        .order_by_asc(calendar_event::Column::Id)
        .lock_exclusive()
        .into_tuple()
        .all(db)
        .await?;
    let chosen: HashSet<&str> = root_ids.iter().map(String::as_str).collect();
    let roots: Vec<String> = selected
        .into_iter()
        .filter(|(_, parent)| {
            !parent
                .as_deref()
                .is_some_and(|parent| chosen.contains(parent))
        })
        .map(|(id, _)| id)
        .collect();
    // A new child locks its series first (`recurring::service::edit`), so with the roots held this family is complete.
    let children: Vec<(String, Option<String>)> = calendar_event::Entity::find()
        .select_only()
        .column(calendar_event::Column::Id)
        .column(calendar_event::Column::ParentEventId)
        .filter(calendar_event::Column::UserId.eq(user_id))
        .filter(calendar_event::Column::ParentEventId.is_in(roots.clone()))
        .order_by_asc(calendar_event::Column::Id)
        .lock_exclusive()
        .into_tuple()
        .all(db)
        .await?;
    let mut families: HashMap<&str, Vec<String>> = roots
        .iter()
        .map(|root| (root.as_str(), vec![root.clone()]))
        .collect();
    for (child, parent) in children {
        if let Some(family) = parent.and_then(|parent| families.get_mut(parent.as_str())) {
            family.push(child);
        }
    }
    let entries: Vec<Value> = families
        .iter()
        .map(|(root, ids)| serde_json::json!({"eventId": root, "trashId": cuid(), "ids": ids}))
        .collect();
    let trashed = db
        .query_all_raw(Statement::from_sql_and_values(
            db.get_database_backend(),
            TRASH_ROOTS,
            [user_id.into(), Value::Array(entries).into()],
        ))
        .await?
        .iter()
        .map(|row| row.try_get::<String>("", "id"))
        .collect::<Result<Vec<_>, _>>()?;
    // Exactly the rows saved above are deleted.
    let ids: Vec<String> = families.into_values().flatten().collect();
    queries::delete_reminders(db, ids.clone()).await?;
    queries::delete_notification_logs(db, Some(user_id), ids.clone()).await?;
    queries::delete(db, user_id, ids).await?;
    Ok(trashed)
}

/// An entry with its root event's columns, read back by Postgres from the stored copy.
#[derive(FromQueryResult)]
struct Entry {
    id: String,
    event_id: String,
    calendar_id: String,
    trashed_at: time::PrimitiveDateTime,
    title: String,
    encrypted_content: Option<String>,
    encryption_state: String,
    encryption_key_version: i32,
    start: time::PrimitiveDateTime,
    end: time::PrimitiveDateTime,
    all_day: bool,
    timezone: String,
    recurrence: Option<String>,
}

/// The caller's newest trash entries, newest first.
pub async fn list(state: &AppState, user: &RouteUser) -> Result<TrashedEventList, AppError> {
    let db = &state.db;
    let entries = Entry::find_by_statement(Statement::from_sql_and_values(
        db.get_database_backend(),
        r#"SELECT t.id, t.event_id, t.calendar_id, t.trashed_at, e.title, e.encrypted_content, e.encryption_state,
               e.encryption_key_version, e.start, e."end", e.all_day, e.timezone, e.recurrence
           FROM event_trash t
           CROSS JOIN LATERAL jsonb_populate_record(NULL::calendar_event,
               (SELECT row FROM jsonb_array_elements(t.rows -> 'events') AS row WHERE row ->> 'id' = t.event_id LIMIT 1)) AS e
           WHERE t.user_id = $1
           ORDER BY t.trashed_at DESC, t.id
           LIMIT $2"#,
        [user.id.as_str().into(), LIST_LIMIT.into()],
    ))
    .all(db)
    .await?;
    let writable: HashSet<String> = calendars::owned_by(db, &user.id)
        .await?
        .into_iter()
        .filter(super::service::is_writable)
        .map(|calendar| calendar.id)
        .collect();
    let retention = instant::seconds(RETENTION_DAYS * 86_400);
    let events = entries
        .into_iter()
        .map(|entry| TrashedEvent {
            calendar_missing: !writable.contains(&entry.calendar_id),
            id: entry.id.into(),
            event_id: entry.event_id.into(),
            calendar_id: entry.calendar_id.into(),
            title: entry.title,
            encrypted_content: entry.encrypted_content,
            encryption_state: entry.encryption_state,
            encryption_key_version: entry.encryption_key_version,
            start: instant::iso(entry.start),
            end: instant::iso(entry.end),
            all_day: entry.all_day,
            timezone: entry.timezone,
            recurrence: entry.recurrence,
            trashed_at: instant::iso(entry.trashed_at),
            purge_at: instant::iso(entry.trashed_at + retention),
        })
        .collect();
    Ok(TrashedEventList { events })
}

#[derive(FromQueryResult)]
struct Locked {
    event_id: String,
    calendar_id: String,
    rows: Value,
}

/// The original calendar while it is the owner's and writable, the hidden Invitations one included, as the list reports it; else the default one, else the first writable one.
async fn restore_target<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    original: &str,
) -> Result<calendar::Model, AppError> {
    let owned: Vec<calendar::Model> = calendars::owned_by(db, user_id)
        .await?
        .into_iter()
        .filter(super::service::is_writable)
        .collect();
    let visible = || {
        owned.iter().filter(|calendar| {
            !is_mail_invitation_staging_calendar(
                &calendar.kind,
                calendar.is_sync_only,
                calendar.is_visible,
                &calendar.name,
            )
        })
    };
    owned
        .iter()
        .find(|calendar| calendar.id == original)
        .or_else(|| visible().find(|calendar| calendar.is_default))
        .or_else(|| visible().next())
        .cloned()
        .ok_or_else(|| AppError::Conflict("No calendar to restore into".into()))
}

fn array<'a>(rows: &'a Value, key: &str) -> &'a [Value] {
    rows.get(key)
        .and_then(Value::as_array)
        .map_or(&[], Vec::as_slice)
}

fn text<'a>(row: &'a Value, key: &str) -> Option<&'a str> {
    row.get(key).and_then(Value::as_str)
}

/// Reinserts rows saved with `to_jsonb`: columns come only from the entity, so keys the table lost are ignored and columns it gained take their defaults. `tail` is fixed SQL.
async fn reinsert<E: EntityTrait, C: ConnectionTrait>(
    db: &C,
    rows: Vec<Value>,
    tail: &str,
    values: Vec<SqlValue>,
) -> Result<u64, DbErr> {
    let present: HashSet<String> = rows
        .iter()
        .filter_map(Value::as_object)
        .flat_map(|row| row.keys().cloned())
        .collect();
    let columns: Vec<String> = E::Column::iter()
        .map(|column| column.as_str().to_owned())
        .filter(|column| present.contains(column))
        .map(|column| format!("\"{column}\""))
        .collect();
    if rows.is_empty() || columns.is_empty() {
        return Ok(0);
    }
    let table = E::default().table_name().to_owned();
    let list = columns.join(", ");
    let mut params = vec![SqlValue::from(Value::Array(rows))];
    params.extend(values);
    Ok(db
        .execute_raw(Statement::from_sql_and_values(
            db.get_database_backend(),
            format!(
                r#"INSERT INTO "{table}" ({list}) SELECT {list} FROM jsonb_populate_recordset(NULL::"{table}", $1::jsonb) {tail}"#
            ),
            params,
        ))
        .await?
        .rows_affected())
}

/// Restores an entry under its original ids and ciphertext, into its calendar or the default one; future unsent reminders and participants come back, no mail is sent.
pub async fn restore(state: &AppState, user: &RouteUser, id: &str) -> Result<Event, AppError> {
    let transaction = state.db.begin().await?;
    let entry = Locked::find_by_statement(Statement::from_sql_and_values(
        transaction.get_database_backend(),
        "SELECT event_id, calendar_id, rows FROM event_trash WHERE id = $1 AND user_id = $2 FOR UPDATE",
        [id.into(), user.id.as_str().into()],
    ))
    .one(&transaction)
    .await?
    .ok_or_else(|| AppError::NotFound(NOT_FOUND.into()))?;
    let target = restore_target(&transaction, &user.id, &entry.calendar_id).await?;
    let mut events = array(&entry.rows, "events").to_vec();
    let categories: HashSet<String> = events
        .iter()
        .filter_map(|event| text(event, "category_id").map(str::to_owned))
        .collect();
    let kept: HashSet<String> = event_category::Entity::find()
        .select_only()
        .column(event_category::Column::Id)
        .filter(event_category::Column::UserId.eq(&user.id))
        .filter(event_category::Column::Id.is_in(categories))
        .into_tuple::<String>()
        .all(&transaction)
        .await?
        .into_iter()
        .collect();
    let now = Value::String(instant::iso(instant::now()).0);
    for event in &mut events {
        let keep_category = text(event, "category_id").is_some_and(|id| kept.contains(id));
        if let Some(row) = event.as_object_mut() {
            row.insert("calendar_id".into(), Value::String(target.id.clone()));
            row.insert("updated_at".into(), now.clone());
            if !keep_category {
                row.insert("category_id".into(), Value::Null);
            }
        }
    }
    let event_ids: Vec<String> = events
        .iter()
        .filter_map(|event| text(event, "id").map(str::to_owned))
        .collect();
    let owner: SqlValue = user.id.as_str().into();
    // A row that came back another way meanwhile is a unique violation, which answers 409.
    reinsert::<calendar_event::Entity, _>(&transaction, events, "", Vec::new()).await?;
    // An exception relinks a restored occurrence over the series' current one; one whose series or occurrence is gone stays out.
    reinsert::<recurrence_exception::Entity, _>(
        &transaction,
        array(&entry.rows, "exceptions").to_vec(),
        "WHERE parent_event_id IN (SELECT id FROM calendar_event WHERE user_id = $2) \
         AND (modified_event_id IS NULL OR modified_event_id IN (SELECT id FROM calendar_event WHERE user_id = $2)) \
         ON CONFLICT (parent_event_id, exception_date) DO UPDATE SET type = EXCLUDED.type, \
         modified_event_id = EXCLUDED.modified_event_id, updated_at = now() AT TIME ZONE 'UTC'",
        vec![owner],
    )
    .await?;
    reinsert::<event_notification::Entity, _>(
        &transaction,
        array(&entry.rows, "reminders").to_vec(),
        "WHERE NOT is_sent AND notification_time > (now() AT TIME ZONE 'UTC')",
        Vec::new(),
    )
    .await?;
    let mut people: HashMap<&str, Vec<ParticipantInput>> = HashMap::new();
    for participant in array(&entry.rows, "participants") {
        let (Some(event_id), Some(email)) =
            (text(participant, "eventId"), text(participant, "email"))
        else {
            continue;
        };
        people.entry(event_id).or_default().push(ParticipantInput {
            email: email.to_owned(),
            display_name: None,
            role: text(participant, "role").map(str::to_owned),
            status: text(participant, "status").map(str::to_owned),
        });
    }
    for event_id in &event_ids {
        if let Some(inputs) = people.get(event_id.as_str()) {
            participants::sync(&transaction, event_id, inputs, None).await?;
        }
    }
    transaction
        .execute_raw(Statement::from_sql_and_values(
            transaction.get_database_backend(),
            "DELETE FROM event_trash WHERE id = $1",
            [id.into()],
        ))
        .await?;
    let root = queries::find(&transaction, &user.id, &entry.event_id)
        .await?
        .ok_or_else(|| AppError::internal("restored event missing"))?;
    let event = view::one(&transaction, &root).await?;
    transaction.commit().await?;
    Ok(event)
}

/// Deletes one entry for good.
pub async fn purge(
    state: &AppState,
    user: &RouteUser,
    id: &str,
) -> Result<SuccessMessage, AppError> {
    let deleted = state
        .db
        .execute_raw(Statement::from_sql_and_values(
            state.db.get_database_backend(),
            "DELETE FROM event_trash WHERE id = $1 AND user_id = $2",
            [id.into(), user.id.as_str().into()],
        ))
        .await?
        .rows_affected();
    if deleted == 0 {
        return Err(AppError::NotFound(NOT_FOUND.into()));
    }
    Ok(SuccessMessage {
        success: true,
        message: "Event deleted permanently".into(),
    })
}

/// Deletes every entry of the caller's trash.
pub async fn empty(state: &AppState, user: &RouteUser) -> Result<SuccessMessage, AppError> {
    state
        .db
        .execute_raw(Statement::from_sql_and_values(
            state.db.get_database_backend(),
            "DELETE FROM event_trash WHERE user_id = $1",
            [user.id.as_str().into()],
        ))
        .await?;
    Ok(SuccessMessage {
        success: true,
        message: "Trash emptied".into(),
    })
}
