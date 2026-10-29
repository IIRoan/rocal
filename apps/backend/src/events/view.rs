//! Event rows as the API returns them: the row with its calendar, category, participants and, for series, exceptions.

use std::collections::HashMap;

use solace_api_types::events::{
    Event, EventCalendar, EventCategory, EventParticipant, RecurrenceException,
};

use super::{participants, queries};
use crate::db::entities::{
    calendar, calendar_event, event_category, event_participant, recurrence_exception, user,
};
use crate::error::AppError;
use crate::instant;

/// The relations of a batch of events, loaded once per batch.
#[derive(Default)]
pub struct Relations {
    pub calendars: HashMap<String, calendar::Model>,
    pub categories: HashMap<String, event_category::Model>,
    pub participants: HashMap<String, Vec<(event_participant::Model, Option<user::Model>)>>,
    pub exceptions: HashMap<String, Vec<recurrence_exception::Model>>,
}

impl Relations {
    /// `EVENT_WITH_RELATIONS_INCLUDE`, plus `recurrenceExceptions` when `with_exceptions`.
    pub async fn load<C: sea_orm::ConnectionTrait>(
        db: &C,
        events: &[&calendar_event::Model],
        with_exceptions: bool,
    ) -> Result<Self, sea_orm::DbErr> {
        if events.is_empty() {
            return Ok(Self::default());
        }
        let mut calendar_ids: Vec<String> = events.iter().map(|e| e.calendar_id.clone()).collect();
        calendar_ids.sort();
        calendar_ids.dedup();
        let mut category_ids: Vec<String> = events
            .iter()
            .filter_map(|e| e.category_id.clone())
            .collect();
        category_ids.sort();
        category_ids.dedup();
        let event_ids: Vec<String> = events.iter().map(|e| e.id.clone()).collect();
        // Independent reads run concurrently on the pool; a transaction serializes them on its connection.
        let (participant_rows, exception_rows, calendars, categories) = tokio::try_join!(
            queries::participants_with_users(db, &event_ids),
            async {
                if with_exceptions {
                    queries::exceptions(db, event_ids.clone()).await
                } else {
                    Ok(Vec::new())
                }
            },
            queries::calendars_by_id(db, calendar_ids),
            async {
                if category_ids.is_empty() {
                    Ok(HashMap::new())
                } else {
                    queries::categories_by_id(db, category_ids).await
                }
            },
        )?;
        let mut participants: HashMap<String, Vec<_>> = HashMap::new();
        for entry in participant_rows {
            participants
                .entry(entry.0.event_id.clone())
                .or_default()
                .push(entry);
        }
        let mut exceptions: HashMap<String, Vec<_>> = HashMap::new();
        for exception in exception_rows {
            exceptions
                .entry(exception.parent_event_id.clone())
                .or_default()
                .push(exception);
        }
        Ok(Self {
            calendars,
            categories,
            participants,
            exceptions,
        })
    }

    pub fn participants_of(
        &self,
        event_id: &str,
    ) -> &[(event_participant::Model, Option<user::Model>)] {
        self.participants.get(event_id).map_or(&[], Vec::as_slice)
    }

    /// `mapAndSortParticipants` over the event's loaded participants.
    pub fn sorted_participants(&self, event_id: &str) -> Vec<EventParticipant> {
        participants::map_and_sort(self.participants_of(event_id))
    }
}

pub fn calendar_dto(model: &calendar::Model) -> EventCalendar {
    EventCalendar {
        id: model.id.clone().into(),
        name: model.name.clone(),
        encrypted_name: model.encrypted_name.clone(),
        blind_index_tokens: model.blind_index_tokens.clone(),
        encryption_state: model.encryption_state.clone(),
        encryption_key_version: model.encryption_key_version,
        color: model.color.clone(),
        kind: model.kind.clone(),
        is_public: model.is_public,
        is_visible: model.is_visible,
        is_default: model.is_default,
        is_sync_only: model.is_sync_only,
        stalwart_account_id: model.stalwart_account_id.clone(),
        stalwart_calendar_id: model.stalwart_calendar_id.clone(),
        stalwart_synced_at: model.stalwart_synced_at.map(instant::iso),
        user_id: model.user_id.clone().into(),
        created_at: instant::iso(model.created_at),
        updated_at: instant::iso(model.updated_at),
    }
}

pub fn category_dto(model: &event_category::Model) -> EventCategory {
    EventCategory {
        id: model.id.clone().into(),
        name: model.name.clone(),
        encrypted_name: model.encrypted_name.clone(),
        blind_index_tokens: model.blind_index_tokens.clone(),
        encryption_state: model.encryption_state.clone(),
        encryption_key_version: model.encryption_key_version,
        color: model.color.clone(),
        is_active: model.is_active,
        user_id: model.user_id.clone().into(),
        created_at: instant::iso(model.created_at),
        updated_at: instant::iso(model.updated_at),
    }
}

pub fn exception_dto(model: &recurrence_exception::Model) -> RecurrenceException {
    RecurrenceException {
        id: model.id.clone().into(),
        parent_event_id: model.parent_event_id.clone().into(),
        exception_date: instant::iso(model.exception_date),
        modified_event_id: model.modified_event_id.clone().map(Into::into),
        kind: model.r#type.clone(),
        created_at: instant::iso(model.created_at),
        updated_at: instant::iso(model.updated_at),
    }
}

/// The row with its calendar and category; participants, instance flag and exceptions are the caller's.
pub fn event_dto(model: &calendar_event::Model, relations: &Relations) -> Result<Event, AppError> {
    let calendar = relations
        .calendars
        .get(&model.calendar_id)
        .ok_or_else(|| AppError::internal("event without its calendar"))?;
    let category = model
        .category_id
        .as_ref()
        .and_then(|id| relations.categories.get(id));
    Ok(Event {
        id: model.id.clone().into(),
        title: model.title.clone(),
        description: model.description.clone(),
        encrypted_content: model.encrypted_content.clone(),
        blind_index_tokens: model.blind_index_tokens.clone(),
        encryption_state: model.encryption_state.clone(),
        encryption_key_version: model.encryption_key_version,
        start: instant::iso(model.start),
        end: instant::iso(model.end),
        all_day: model.all_day,
        location: model.location.clone(),
        color: model.color.clone(),
        timezone: model.timezone.clone(),
        is_private: model.is_private,
        reminder: model.reminder,
        recurrence: model.recurrence.clone(),
        parent_event_id: model.parent_event_id.clone().map(Into::into),
        is_cancelled: model.is_cancelled,
        is_synced: model.is_synced,
        external_id: model.external_id.clone(),
        subscription_id: model.subscription_id.clone().map(Into::into),
        synced_at: model.synced_at.map(instant::iso),
        stalwart_account_id: model.stalwart_account_id.clone(),
        stalwart_calendar_id: model.stalwart_calendar_id.clone(),
        stalwart_event_id: model.stalwart_event_id.clone(),
        stalwart_uid: model.stalwart_uid.clone(),
        stalwart_synced_at: model.stalwart_synced_at.map(instant::iso),
        user_id: model.user_id.clone().into(),
        calendar_id: model.calendar_id.clone().into(),
        category_id: model.category_id.clone().map(Into::into),
        created_at: instant::iso(model.created_at),
        updated_at: instant::iso(model.updated_at),
        category: category.map(category_dto),
        calendar: calendar_dto(calendar),
        participants: None,
        is_recurring_instance: None,
        recurrence_exceptions: None,
        warnings: None,
    })
}

/// `{ ...event, participants: mapAndSortParticipants(event) }`, the shape most reads answer.
pub fn with_participants(
    model: &calendar_event::Model,
    relations: &Relations,
) -> Result<Event, AppError> {
    let mut event = event_dto(model, relations)?;
    event.participants = Some(relations.sorted_participants(&model.id));
    Ok(event)
}

/// Loads the relations of one event and maps it with its sorted participants.
pub async fn one<C: sea_orm::ConnectionTrait>(
    db: &C,
    model: &calendar_event::Model,
) -> Result<Event, AppError> {
    let relations = Relations::load(db, &[model], false).await?;
    with_participants(model, &relations)
}
