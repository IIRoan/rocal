//! Probes every request validator against its DTO's OpenAPI schema, so the generated TypeScript types say what the API accepts and nothing it accepts overflows the DTO.

use std::collections::BTreeMap;
use std::path::Path;
use std::sync::LazyLock;

use serde_json::{Value, json};
use solace_api_types::{
    account, calendars, categories, e2ee, events, mail, mail_settings, notifications, profiles,
    push_devices, recent_contacts, recurring, settings, subscriptions,
};
use utoipa::{PartialSchema, ToSchema};

use super::extract::RequestSchema;

/// Request DTOs outside the OpenAPI document: a path parameter and the Stalwart webhook's payloads.
const UNDOCUMENTED: [&str; 3] = ["AvatarIdParams", "IngestData", "Payload"];

/// A valid object for DTOs inside a union, which refuses a partial object as a whole.
fn sample(component: &str) -> Option<Value> {
    let event = json!({
        "externalId": "e",
        "start": "2026-01-01T09:00:00.000Z",
        "end": "2026-01-01T10:00:00.000Z",
        "allDay": false,
        "timezone": "UTC",
        "encryptedContent": "x",
    });
    match component {
        "RecurrenceRule" => Some(json!({"frequency": "daily", "interval": 1})),
        "EncryptedIcsImportRequest" => Some(json!({"calendarId": "c", "encryptedEvents": [event]})),
        "EncryptedIcsEvent" => Some(event),
        "LegacyIcsImportRequest" => {
            Some(json!({"calendarId": "c", "icsContent": "BEGIN:VCALENDAR"}))
        }
        "ParticipantInput" => Some(json!({"email": "a@example.com"})),
        _ => None,
    }
}

static DOCUMENT: LazyLock<BTreeMap<String, Value>> = LazyLock::new(|| {
    let document = serde_json::to_value(crate::openapi()).unwrap();
    document["components"]["schemas"]
        .as_object()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .collect()
});

type Wrap<'a> = Box<dyn Fn(Value) -> Value + 'a>;

struct Probe<'a> {
    dto: String,
    components: BTreeMap<String, Value>,
    validator: &'a super::zod::Schema,
    /// Query strings carry text only, and their OpenAPI shape is the route's parameter list.
    query: bool,
    /// A union body fails at the root as a whole.
    root_union: bool,
    problems: Vec<String>,
}

fn is_nullable(schema: &Value) -> bool {
    let null_type = |value: &Value| value["type"] == "null";
    schema["nullable"] == true
        || schema["type"]
            .as_array()
            .is_some_and(|types| types.iter().any(|t| t == "null"))
        || ["oneOf", "anyOf"].iter().any(|key| {
            schema[*key]
                .as_array()
                .is_some_and(|options| options.iter().any(null_type))
        })
}

fn has_type(schema: &Value, name: &str) -> bool {
    schema["type"] == name
        || schema["type"]
            .as_array()
            .is_some_and(|types| types.iter().any(|t| t == name))
}

/// The inclusive range an integer schema's Rust type holds.
fn integer_range(schema: &Value) -> Option<(f64, f64)> {
    if !has_type(schema, "integer") {
        return None;
    }
    let (min, max) = match schema["format"].as_str() {
        Some("int32") => (f64::from(i32::MIN), f64::from(i32::MAX)),
        Some("uint32") => (0.0, f64::from(u32::MAX)),
        Some("uint64") => (0.0, u64::MAX as f64),
        Some("uint8") => (0.0, f64::from(u8::MAX)),
        Some("uint16") => (0.0, f64::from(u16::MAX)),
        _ => (i64::MIN as f64, i64::MAX as f64),
    };
    let min = schema["minimum"]
        .as_f64()
        .map_or(min, |floor| floor.max(min));
    Some((min, max))
}

impl Probe<'_> {
    fn resolve<'s>(&'s self, schema: &'s Value) -> (&'s Value, Option<&'s str>) {
        match schema["$ref"].as_str() {
            Some(reference) => {
                let name = reference.trim_start_matches("#/components/schemas/");
                match self.components.get(name) {
                    Some(target) => (target, Some(name)),
                    None => (schema, None),
                }
            }
            None => (schema, None),
        }
    }

    /// The non-null alternatives of a property, resolved, with their component names.
    fn alternatives(&self, schema: &Value) -> Vec<(Value, Option<String>)> {
        let resolved = |option: &Value| {
            let (schema, name) = self.resolve(option);
            (schema.clone(), name.map(str::to_owned))
        };
        let (target, name) = resolved(schema);
        let options = ["oneOf", "anyOf"]
            .iter()
            .find_map(|key| target[*key].as_array().cloned());
        match options {
            Some(options) => options
                .iter()
                .filter(|option| option["type"] != "null")
                .flat_map(|option| self.alternatives(option))
                .collect(),
            None => vec![(target, name)],
        }
    }

    /// Whether the validator refuses `body` at `path` or at an ancestor, as a union does; the root counts only for a union body.
    fn rejects(&self, body: &Value, path: &[String]) -> bool {
        let Err(issues) = self.validator.parse(Some(body)) else {
            return false;
        };
        issues.iter().any(|issue| {
            if issue.path.is_empty() {
                self.root_union
            } else {
                issue.path.starts_with(path) || path.starts_with(&issue.path)
            }
        })
    }

    /// The base object for a component: a valid sample inside a union, else an empty object.
    fn base(&mut self, component: Option<&str>, sampled: bool, path: &[String]) -> Option<Value> {
        if !sampled {
            return Some(json!({}));
        }
        let found = component.and_then(sample);
        if found.is_none() {
            let component = component.unwrap_or("an inline object");
            self.report(
                path,
                &format!("add a sample for {component}, which sits in a union"),
            );
        }
        found
    }

    fn report(&mut self, path: &[String], problem: &str) {
        self.problems
            .push(format!("{}.{}: {problem}", self.dto, path.join(".")));
    }

    fn object(
        &mut self,
        schema: &Value,
        base: &Value,
        wrap: &Wrap<'_>,
        path: &[String],
        sampled: bool,
    ) {
        let required: Vec<&str> = schema["required"]
            .as_array()
            .map(|names| names.iter().filter_map(Value::as_str).collect())
            .unwrap_or_default();
        let Some(properties) = schema["properties"].as_object() else {
            return;
        };
        for (key, property) in properties {
            let path: Vec<String> = path.iter().cloned().chain([key.clone()]).collect();
            let with = |value: Option<Value>| {
                let mut object = base.as_object().cloned().unwrap_or_default();
                match value {
                    Some(value) => object.insert(key.clone(), value),
                    None => object.remove(key),
                };
                wrap(Value::Object(object))
            };
            if !self.query {
                let missing_ok = !self.rejects(&with(None), &path);
                match (required.contains(&key.as_str()), missing_ok) {
                    (true, true) => self.report(
                        &path,
                        "the validator accepts it missing, OpenAPI requires it",
                    ),
                    (false, false) => self.report(
                        &path,
                        "the validator requires it, OpenAPI marks it optional",
                    ),
                    _ => {}
                }
                let null_ok = !self.rejects(&with(Some(Value::Null)), &path);
                match (is_nullable(property), null_ok) {
                    (true, false) => {
                        self.report(&path, "OpenAPI says nullable, the validator rejects null")
                    }
                    (false, true) => self.report(
                        &path,
                        "the validator accepts null, OpenAPI says not nullable",
                    ),
                    _ => {}
                }
            }
            self.value(property, &with, &path, sampled);
        }
    }

    /// Integer bounds, then the objects and arrays inside a property.
    fn value(
        &mut self,
        property: &Value,
        with: &dyn Fn(Option<Value>) -> Value,
        path: &[String],
        sampled: bool,
    ) {
        let alternatives = self.alternatives(property);
        let sampled = sampled || alternatives.len() > 1;
        for (schema, name) in alternatives {
            if let Some((min, max)) = integer_range(&schema) {
                for number in [max + 1.0, min - 1.0, 1.5] {
                    let probe = if self.query {
                        Value::String(json!(number).to_string())
                    } else {
                        json!(number)
                    };
                    if !self.rejects(&with(Some(probe)), path) {
                        self.report(path, &format!("the validator accepts {number}, which the DTO's integer cannot hold"));
                    }
                }
            }
            if has_type(&schema, "array") {
                let item_path: Vec<String> = path.iter().cloned().chain(["0".to_owned()]).collect();
                let wrap: Wrap<'_> = Box::new(|item| with(Some(Value::Array(vec![item]))));
                let items = schema["items"].clone();
                self.nested(&items, &wrap, &item_path, sampled);
            } else if schema["properties"].is_object() {
                let wrap: Wrap<'_> = Box::new(|object| with(Some(object)));
                if let Some(base) = self.base(name.as_deref(), sampled, path) {
                    self.object(&schema, &base, &wrap, path, sampled);
                }
            }
        }
    }

    /// Array items: integers are bounded, objects are walked.
    fn nested(&mut self, items: &Value, wrap: &Wrap<'_>, path: &[String], sampled: bool) {
        let (items, name) = self.resolve(items);
        let (items, name) = (items.clone(), name.map(str::to_owned));
        if items["properties"].is_object() {
            if let Some(base) = self.base(name.as_deref(), sampled, path) {
                self.object(&items, &base, wrap, path, sampled);
            }
        } else {
            let with = |value: Option<Value>| wrap(value.unwrap_or(Value::Null));
            self.value(&items, &with, path, sampled);
        }
    }
}

fn check<T: RequestSchema + ToSchema>() -> (String, Vec<String>) {
    let dto = T::name().into_owned();
    let mut components = DOCUMENT.clone();
    let mut dependencies = Vec::new();
    T::schemas(&mut dependencies);
    for (name, schema) in dependencies {
        components
            .entry(name)
            .or_insert_with(|| serde_json::to_value(schema).unwrap());
    }
    let own = serde_json::to_value(<T as PartialSchema>::schema()).unwrap();
    let mut probe = Probe {
        query: dto.ends_with("Query"),
        dto: dto.clone(),
        components,
        validator: <T as RequestSchema>::schema(),
        root_union: false,
        problems: Vec::new(),
    };
    let identity: Wrap<'_> = Box::new(|body| body);
    let alternatives = probe.alternatives(&own);
    probe.root_union = alternatives.len() > 1;
    for (schema, name) in alternatives {
        if !schema["properties"].is_object() {
            probe.report(&[], "no object properties to probe");
        } else if let Some(base) = probe.base(name.as_deref(), probe.root_union, &[]) {
            probe.object(&schema, &base, &identity, &[], probe.root_union);
        }
    }
    (dto, probe.problems)
}

fn checked() -> Vec<(String, Vec<String>)> {
    vec![
        check::<profiles::AvatarSizeQuery>(),
        check::<events::BulkEventRequest>(),
        check::<account::ClaimInviteRequest>(),
        check::<calendars::CreateCalendarRequest>(),
        check::<categories::CreateCategoryRequest>(),
        check::<events::CreateEventRequest>(),
        check::<account::CreateInviteRequest>(),
        check::<calendars::CreateShareLinkRequest>(),
        check::<subscriptions::CreateSubscriptionRequest>(),
        check::<events::DeclineInvitationRequest>(),
        check::<calendars::DeleteCalendarQuery>(),
        check::<recurring::DeleteRecurringQuery>(),
        check::<subscriptions::DeleteSubscriptionQuery>(),
        check::<recurring::EditRecurringRequest>(),
        check::<account::EmailAvailabilityQuery>(),
        check::<profiles::EmailAvatarQuery>(),
        check::<events::EventListQuery>(),
        check::<events::EventSearchCorpusQuery>(),
        check::<events::EventSearchQuery>(),
        check::<subscriptions::ImportIcsRequest>(),
        check::<events::ImportInvitationRequest>(),
        check::<events::InvitationByExternalIdQuery>(),
        check::<account::InviteTokenQuery>(),
        check::<mail::MailBootstrapRequest>(),
        check::<mail::MailSyncQuery>(),
        check::<mail::MailVaultBackupRequest>(),
        check::<e2ee::PasswordEnvelopeRequest>(),
        check::<recurring::PreviewRecurrenceRequest>(),
        check::<profiles::ProfileLookupRequest>(),
        check::<mail_settings::PutMailSettingsRequest>(),
        check::<recent_contacts::PutRecentContactsRequest>(),
        check::<e2ee::RegisterDeviceRequest>(),
        check::<push_devices::RegisterPushDeviceRequest>(),
        check::<events::RsvpRequest>(),
        check::<events::SealEncryptionRequest>(),
        check::<push_devices::UnregisterPushDeviceRequest>(),
        check::<calendars::UpdateCalendarRequest>(),
        check::<categories::UpdateCategoryRequest>(),
        check::<notifications::UpdateEventNotificationsRequest>(),
        check::<events::UpdateEventRequest>(),
        check::<settings::UpdateSettingsRequest>(),
        check::<subscriptions::UpdateSubscriptionRequest>(),
        check::<profiles::UploadAvatarRequest>(),
        check::<recurring::ValidateRecurrenceRequest>(),
    ]
}

#[test]
fn request_validators_match_their_openapi_schemas() {
    let problems: Vec<String> = checked()
        .into_iter()
        .flat_map(|(_, problems)| problems)
        .collect();
    assert!(problems.is_empty(), "\n{}", problems.join("\n"));
}

fn request_schema_names(dir: &Path, names: &mut Vec<String>) {
    for entry in std::fs::read_dir(dir).unwrap().flatten() {
        let path = entry.path();
        if path.is_dir() {
            request_schema_names(&path, names);
        } else if path.extension().is_some_and(|ext| ext == "rs") {
            let source = std::fs::read_to_string(&path).unwrap();
            for (_, rest) in source
                .match_indices("request_schema!(")
                .map(|(at, _)| source.split_at(at + "request_schema!(".len()))
            {
                let name: String = rest
                    .chars()
                    .take_while(|c| c.is_alphanumeric() || *c == '_')
                    .collect();
                if !name.is_empty() && name != "dto" {
                    names.push(name);
                }
            }
        }
    }
}

#[test]
fn every_request_validator_is_probed() {
    let checked: Vec<String> = checked().into_iter().map(|(name, _)| name).collect();
    let mut names = Vec::new();
    request_schema_names(
        &Path::new(env!("CARGO_MANIFEST_DIR")).join("src"),
        &mut names,
    );
    let missing: Vec<&String> = names
        .iter()
        .filter(|name| !checked.contains(name) && !UNDOCUMENTED.contains(&name.as_str()))
        .collect();
    assert!(missing.is_empty(), "add these to checked(): {missing:?}");
}
