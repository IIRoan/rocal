//! Better Auth's `GET /api/auth/error`: its HTML page outside production, a redirect to the app with the code in production.

use axum::extract::{RawQuery, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};

use crate::auth::cookies::encode_uri_component;
use crate::state::AppState;

const TEMPLATE: &str = include_str!("error_page.html");

pub async fn error_page(State(state): State<AppState>, RawQuery(query): RawQuery) -> Response {
    let params: Vec<(String, String)> =
        url::form_urlencoded::parse(query.unwrap_or_default().as_bytes())
            .into_owned()
            .collect();
    let first = |name: &str| {
        params
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.clone())
            .filter(|value| !value.is_empty())
    };
    let code = first("error")
        .filter(|code| {
            code.chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '\'' | '_' | '-'))
        })
        .unwrap_or_else(|| "UNKNOWN".into());
    let description = first("error_description");
    if state.config.is_production {
        let mut redirect = url::form_urlencoded::Serializer::new(String::new());
        redirect.append_pair("error", &code);
        if let Some(description) = &description {
            redirect.append_pair("error_description", description);
        }
        let location = format!("/?{}", redirect.finish());
        return (StatusCode::FOUND, [(header::LOCATION, location)]).into_response();
    }
    let code_uri = encode_uri_component(&code);
    let paragraph = description.as_deref().map(sanitize).unwrap_or_else(|| {
        format!(
            "We encountered an unexpected error. Please try again or return to the home page. If you're a developer, you can find <a href='https://better-auth.com/docs/reference/errors/{code_uri}' target='_blank' rel=\"noopener noreferrer\" style='color: var(--foreground); text-decoration: underline;'>more information about the error</a>."
        )
    });
    let page = TEMPLATE
        .replace("{{CODE_HTML}}", &sanitize(&code))
        .replace("{{CODE_URI}}", &code_uri)
        .replace(
            "{{QUESTION_URI}}",
            &encode_uri_component(&format!("What does the error code {code} mean?")),
        )
        .replace("{{DESCRIPTION}}", &paragraph);
    ([(header::CONTENT_TYPE, "text/html")], page).into_response()
}

/// Better Auth's `sanitize`: escapes markup, keeping entities that are already escaped.
fn sanitize(input: &str) -> String {
    let escaped = input
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;");
    let mut out = String::with_capacity(escaped.len());
    let mut rest = escaped.as_str();
    while let Some(index) = rest.find('&') {
        out.push_str(&rest[..index]);
        let tail = &rest[index..];
        if is_entity(tail) {
            out.push('&');
        } else {
            out.push_str("&amp;");
        }
        rest = &tail[1..];
    }
    out.push_str(rest);
    out
}

fn is_entity(text: &str) -> bool {
    ["&amp;", "&lt;", "&gt;", "&quot;", "&#39;"]
        .iter()
        .any(|entity| text.starts_with(entity))
        || numeric_entity(text)
}

fn numeric_entity(text: &str) -> bool {
    let Some(body) = text.strip_prefix("&#") else {
        return false;
    };
    let (digits, hex) = match body.strip_prefix('x') {
        Some(hex_digits) => (hex_digits, true),
        None => (body, false),
    };
    let length = digits
        .chars()
        .take_while(|c| {
            if hex {
                c.is_ascii_hexdigit()
            } else {
                c.is_ascii_digit()
            }
        })
        .count();
    length > 0 && digits[length..].starts_with(';')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_escapes_like_better_auth() {
        assert_eq!(sanitize("<b>x\"y'</b>"), "&lt;b&gt;x&quot;y&#39;&lt;/b&gt;");
        assert_eq!(
            sanitize("a & b &amp; &#65; &#x41; &bogus;"),
            "a &amp; b &amp; &#65; &#x41; &amp;bogus;"
        );
    }
}
