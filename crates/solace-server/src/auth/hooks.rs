//! Better Auth's session cookies and Solace's after-hooks: the step-up cookie clear and the legacy host-scoped cookie clears.

use axum::http::{HeaderMap, HeaderValue, header};
use axum::response::{IntoResponse, Response};

use super::api::ApiError;
use super::cookies::{self, SESSION_LIFETIME_SECONDS};
use crate::state::AppState;

const LEGACY_SUFFIXES: [&str; 4] = [
    "session_token",
    "session_data",
    "dont_remember",
    "account_data",
];

/// An endpoint's response and the cookies it sets, appended in order.
pub struct Reply {
    response: Response,
    cookies: Vec<String>,
}

impl Reply {
    pub fn new(response: Response, cookies: Vec<String>) -> Self {
        Self { response, cookies }
    }
}

impl IntoResponse for Reply {
    fn into_response(self) -> Response {
        let mut response = self.response;
        append(&mut response, self.cookies);
        response
    }
}

/// better-call keeps the cookies set before an error, so session renewals go out with error replies too.
pub fn with_cookies(
    outcome: Result<impl IntoResponse, ApiError>,
    cookies: Vec<String>,
) -> Response {
    let response = outcome.map_or_else(IntoResponse::into_response, IntoResponse::into_response);
    Reply::new(response, cookies).into_response()
}

fn append(response: &mut Response, cookies: impl IntoIterator<Item = String>) {
    for cookie in cookies {
        if let Ok(value) = HeaderValue::from_str(&cookie) {
            response.headers_mut().append(header::SET_COOKIE, value);
        }
    }
}

/// `setSessionCookie`: the signed token for two weeks, or for the browser session with a `dont_remember` marker.
pub fn session_cookies(state: &AppState, token: &str, dont_remember: bool) -> Vec<String> {
    let settings = &state.cookies;
    let max_age = (!dont_remember).then_some(SESSION_LIFETIME_SECONDS);
    let mut set = vec![settings.signed(&settings.session_token(), token, max_age)];
    if dont_remember {
        set.push(settings.signed(&settings.name("dont_remember"), "true", None));
    }
    set
}

/// Whether the request carries a genuine `dont_remember` marker, which keeps re-issued cookies session-only.
pub fn dont_remember(state: &AppState, request: &HeaderMap) -> bool {
    let request_cookies = cookies::parse_cookies(request);
    cookies::cookie(&request_cookies, &state.cookies.name("dont_remember"))
        .and_then(|signed| state.cookies.verify_signed(signed))
        .is_some()
}

/// `deleteSessionCookie`: the token, the cookie cache and its chunks the request still carries, and `dont_remember`.
pub fn expired_session_cookies(state: &AppState, request: &HeaderMap) -> Vec<String> {
    let settings = &state.cookies;
    let data = settings.name("session_data");
    let mut set = vec![
        settings.expired(&settings.session_token()),
        settings.expired(&data),
    ];
    for (name, _) in cookies::parse_cookies(request) {
        if name.starts_with(&format!("{data}.")) {
            set.push(settings.expired(&name));
        }
    }
    set.push(settings.expired(&settings.name("dont_remember")));
    set
}

/// After sign-in, sign-up, sign-out and password changes, success or not: clear the step-up cookie, and for browsers the legacy cookies.
pub fn after_sign_in_or_out(
    state: &AppState,
    request: &HeaderMap,
    mut response: Response,
) -> Response {
    append(&mut response, [state.cookies.step_up_cleared()]);
    // An Expo jar keyed by name would lose the session it just received if the legacy clears arrived after it.
    let is_expo = request
        .get("expo-origin")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| !v.trim().is_empty());
    if !is_expo {
        append(&mut response, legacy_clears(state, request));
    }
    response
}

/// Before the switch to `Domain=<eTLD+1>`, cookies were scoped to the API host; only a matching Domain clears them.
fn legacy_clears(state: &AppState, request: &HeaderMap) -> Vec<String> {
    if !state.config.is_production {
        return Vec::new();
    }
    let Some(host) = url::Url::parse(&state.config.backend_url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_owned))
        .filter(|host| host != "localhost")
    else {
        return Vec::new();
    };
    let labels: Vec<&str> = host.split('.').collect();
    if labels.len() < 2 || labels[labels.len() - 2..].join(".") == host {
        return Vec::new();
    }
    let mut names: Vec<String> = LEGACY_SUFFIXES
        .iter()
        .map(|suffix| state.cookies.name(suffix))
        .collect();
    for (name, _) in cookies::parse_cookies(request) {
        let unprefixed = name.strip_prefix("__Secure-").unwrap_or(&name);
        let base = state.cookies.base();
        if (unprefixed == base
            || unprefixed
                .strip_prefix(base)
                .is_some_and(|rest| rest.starts_with('.')))
            && !names.contains(&name)
        {
            names.push(name);
        }
    }
    let same_site = state.config.cookie_same_site.lowercase();
    names
        .iter()
        .flat_map(|name| {
            let base =
                format!("{name}=; Path=/; Max-Age=0; SameSite={same_site}; HttpOnly; Secure");
            [format!("{base}; Domain={host}"), base]
        })
        .collect()
}
