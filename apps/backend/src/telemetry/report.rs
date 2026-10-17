//! Errex reporting: the `scrubErrorEvent`/`scrubBreadcrumb` rules applied in `before_send`, so nothing unsanitized leaves the server.

use std::collections::BTreeMap;
use std::sync::Arc;

use sentry::protocol::{
    Breadcrumb, Context, Event, Exception, Frame, Mechanism, Request, Stacktrace,
};
use serde_json::{Map, Value};

use super::redaction::{OMITTED, redact_pii, sanitize_context, sanitize_request_url};

const PROJECT_PATH_MARKERS: [&str; 6] = [
    "node_modules/",
    "apps/",
    "packages/",
    "src/",
    "dist/",
    "build/",
];
const HTTP_BREADCRUMB_CATEGORIES: [&str; 3] = ["fetch", "xhr", "http"];

/// Starts the Errex client when `SENTRY_DSN` is set; the guard must live as long as the process.
pub fn init(dsn: Option<&str>, environment: &str) -> Option<sentry::ClientInitGuard> {
    let mut options = sentry::ClientOptions::default();
    options.dsn = Some(dsn?.parse().ok()?);
    options.environment = Some(environment.to_owned().into());
    options.send_default_pii = false;
    options.before_send = Some(Arc::new(|event| Some(scrub_event(event))));
    options.before_breadcrumb = Some(Arc::new(scrub_breadcrumb));
    Some(sentry::init(options))
}

/// Reports a server error with only the request id attached.
pub fn capture(error: &(dyn std::error::Error + 'static), request_id: &str) {
    sentry::with_scope(
        |scope| {
            if !request_id.is_empty() {
                scope.set_tag("requestId", request_id);
            }
        },
        || sentry::capture_error(error),
    );
}

pub fn scrub_event(mut event: Event<'static>) -> Event<'static> {
    event.user = None;
    event.message = event.message.as_deref().map(redact_pii);
    if let Some(entry) = event.logentry.as_mut() {
        entry.message = redact_pii(&entry.message);
        entry.params.clear();
    }
    for exception in event.exception.values.iter_mut() {
        scrub_exception(exception);
    }
    event.stacktrace = event.stacktrace.take().map(scrub_stacktrace);
    event.request = event.request.take().map(scrub_request);
    event.transaction = event.transaction.as_deref().map(sanitize_request_url);
    event.extra = sanitize_map(&event.extra);
    event.tags = event
        .tags
        .iter()
        .map(|(key, value)| {
            let single = BTreeMap::from([(key.clone(), Value::String(value.clone()))]);
            let sanitized = sanitize_map(&single);
            let text = sanitized
                .get(key)
                .and_then(Value::as_str)
                .unwrap_or(OMITTED);
            (key.clone(), text.to_owned())
        })
        .collect();
    for context in event.contexts.values_mut() {
        if let Context::Other(map) = context {
            *map = sanitize_map(map);
        }
    }
    event.breadcrumbs.values = std::mem::take(&mut event.breadcrumbs.values)
        .into_iter()
        .filter_map(scrub_breadcrumb)
        .collect();
    event
}

/// Console breadcrumbs echo arbitrary log arguments, so they are dropped.
pub fn scrub_breadcrumb(mut breadcrumb: Breadcrumb) -> Option<Breadcrumb> {
    let category = breadcrumb.category.clone().unwrap_or_default();
    if category == "console" || category.starts_with("console.") {
        return None;
    }
    breadcrumb.message = if category.starts_with("ui.") {
        None
    } else {
        breadcrumb.message.as_deref().map(redact_pii)
    };
    let data = std::mem::take(&mut breadcrumb.data);
    breadcrumb.data = if category == "navigation" {
        ["from", "to"]
            .into_iter()
            .filter_map(|key| {
                data.get(key)
                    .and_then(Value::as_str)
                    .map(|url| (key.to_owned(), Value::String(sanitize_request_url(url))))
            })
            .collect()
    } else if HTTP_BREADCRUMB_CATEGORIES.contains(&category.as_str()) {
        let mut rest = data;
        let url = rest.remove("url");
        let mut sanitized = sanitize_map(&rest);
        if let Some(url) = url.as_ref().and_then(Value::as_str) {
            sanitized.insert("url".into(), Value::String(sanitize_request_url(url)));
        }
        sanitized
    } else {
        sanitize_map(&data)
    };
    Some(breadcrumb)
}

/// Sentry keeps its maps sorted; the shared rules work on JSON objects.
fn sanitize_map(map: &BTreeMap<String, Value>) -> BTreeMap<String, Value> {
    let object: Map<String, Value> = map.clone().into_iter().collect();
    sanitize_context(&object).into_iter().collect()
}

fn scrub_exception(exception: &mut Exception) {
    exception.value = exception.value.as_deref().map(redact_pii);
    exception.stacktrace = exception.stacktrace.take().map(scrub_stacktrace);
    exception.raw_stacktrace = None;
    exception.module = None;
    exception.mechanism = exception.mechanism.take().map(|mechanism| Mechanism {
        ty: mechanism.ty,
        handled: mechanism.handled,
        ..Default::default()
    });
}

/// Source lines and local variables can hold user content, so frames keep only locations.
fn scrub_stacktrace(stacktrace: Stacktrace) -> Stacktrace {
    Stacktrace {
        frames: stacktrace
            .frames
            .into_iter()
            .map(|frame| Frame {
                filename: frame.filename.as_deref().map(sanitize_frame_path),
                abs_path: frame.abs_path.as_deref().map(sanitize_frame_path),
                function: frame.function.as_deref().map(redact_pii),
                lineno: frame.lineno,
                colno: frame.colno,
                in_app: frame.in_app,
                ..Default::default()
            })
            .collect(),
        ..Default::default()
    }
}

/// Absolute paths can carry usernames, so only the project-relative part is kept.
fn sanitize_frame_path(path: &str) -> String {
    let without_query = path.split(['?', '#']).next().unwrap_or_default();
    let normalized = without_query.replace('\\', "/");
    for marker in PROJECT_PATH_MARKERS {
        if let Some(index) = normalized.rfind(marker) {
            return redact_pii(&normalized[index..]);
        }
    }
    redact_pii(normalized.rsplit('/').next().unwrap_or_default())
}

/// Headers, cookies, body, query string and env (client IP) are never needed.
fn scrub_request(request: Request) -> Request {
    Request {
        method: request.method,
        url: request
            .url
            .and_then(|url| sanitize_request_url(url.as_str()).parse().ok()),
        ..Default::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn error_reports_and_breadcrumbs_are_scrubbed_before_sending() {
        let event = Event {
            user: Some(sentry::User {
                email: Some("roan@example.com".into()),
                ..Default::default()
            }),
            message: Some("failed for roan@example.com".into()),
            transaction: Some("/api/mail/keys/roan%40example.com?x=1".into()),
            request: Some(Request {
                method: Some("GET".into()),
                url: "https://api.solace.onl/api/events?q=dentist".parse().ok(),
                cookies: Some("better-auth.session_token=secret".into()),
                headers: [("authorization".to_owned(), "Bearer abc".to_owned())].into(),
                ..Default::default()
            }),
            exception: vec![Exception {
                ty: "AppError".into(),
                value: Some("no mailbox for roan@example.com".into()),
                stacktrace: Some(Stacktrace {
                    frames: vec![Frame {
                        abs_path: Some("/home/roan/rocal/crates/solace-server/src/mail.rs".into()),
                        context_line: Some("let secret = \"x\";".into()),
                        vars: [("secret".to_owned(), json!("x"))].into(),
                        lineno: Some(12),
                        ..Default::default()
                    }],
                    ..Default::default()
                }),
                ..Default::default()
            }]
            .into(),
            breadcrumbs: vec![
                Breadcrumb {
                    category: Some("console".into()),
                    message: Some("roan@example.com".into()),
                    ..Default::default()
                },
                Breadcrumb {
                    category: Some("http".into()),
                    data: [
                        ("url".to_owned(), json!("https://x.test/a?token=1")),
                        ("token".to_owned(), json!("t")),
                    ]
                    .into(),
                    ..Default::default()
                },
            ]
            .into(),
            ..Default::default()
        };
        let scrubbed = scrub_event(event);
        assert!(scrubbed.user.is_none());
        assert_eq!(scrubbed.message.as_deref(), Some("failed for [email]"));
        assert_eq!(
            scrubbed.transaction.as_deref(),
            Some("/api/mail/keys/[email]?[redacted]")
        );
        let request = scrubbed.request.expect("request");
        assert_eq!(request.method.as_deref(), Some("GET"));
        assert_eq!(
            request.url.map(|u| u.to_string()).as_deref(),
            Some("https://api.solace.onl/api/events?[redacted]")
        );
        assert!(request.cookies.is_none() && request.headers.is_empty());
        let exception = &scrubbed.exception.values[0];
        assert_eq!(exception.value.as_deref(), Some("no mailbox for [email]"));
        let frame = &exception.stacktrace.as_ref().expect("stack").frames[0];
        assert_eq!(frame.abs_path.as_deref(), Some("src/mail.rs"));
        assert!(frame.context_line.is_none() && frame.vars.is_empty());
        assert_eq!(frame.lineno, Some(12));
        assert_eq!(
            scrubbed.breadcrumbs.values.len(),
            1,
            "console breadcrumbs are dropped"
        );
        let http = &scrubbed.breadcrumbs.values[0].data;
        assert_eq!(http.get("url"), Some(&json!("https://x.test/a?[redacted]")));
        assert_eq!(http.get("token"), Some(&json!(OMITTED)));
    }

    #[test]
    fn report_extras_are_sanitized() {
        let event = Event {
            extra: [
                ("email".to_owned(), json!("roan@example.com")),
                ("body".to_owned(), json!("secret")),
                ("requestId".to_owned(), json!("r1")),
            ]
            .into(),
            tags: [("email".to_owned(), "roan@example.com".to_owned())].into(),
            ..Default::default()
        };
        let scrubbed = scrub_event(event);
        assert_eq!(scrubbed.extra.get("body"), Some(&json!(OMITTED)));
        assert_eq!(scrubbed.extra.get("requestId"), Some(&json!("r1")));
        let email = scrubbed
            .extra
            .get("email")
            .and_then(Value::as_str)
            .unwrap_or_default();
        assert!(email.len() == 12 && !email.contains('@'));
        assert!(!scrubbed.tags["email"].contains('@'));
    }
}
