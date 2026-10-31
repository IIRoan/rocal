use crate::{error::AppError, state::AppState};
use axum::http::StatusCode;
use serde_json::{Value, json};
use std::time::Duration;

const TOURNAMENT: (&str, &str) = (
    "GetCompeteTournamentForRiftboundPlayer",
    "912eeffcfcdf67370405d9bab56be8bff864760111cd533108d12214f79cce04",
);
pub(super) const SEARCH: (&str, &str) = (
    "CompeteTournamentSearch",
    "868030f676276bec926c740aada7129713d4097f6e2dd7c3a0451c4fb43852eb",
);
const ORGANIZER: (&str, &str) = (
    "OrganizerSummary",
    "3c1b5c84a25e8c304922e4130a99a196e6eac6c90d740690ba1afd0f040010cf",
);

pub(super) fn unavailable(reason: &'static str) -> AppError {
    tracing::warn!(reason, "Riftbound upstream unavailable");
    AppError::Upstream {
        status: StatusCode::BAD_GATEWAY,
        message: "Riftbound is unavailable right now. Try again later.".into(),
    }
}

fn not_found(error: &Value) -> bool {
    error
        .pointer("/extensions/classification")
        .and_then(Value::as_str)
        == Some("NOT_FOUND")
}

pub(super) async fn query(
    state: &AppState,
    operation: (&str, &str),
    variables: Value,
) -> Result<Value, AppError> {
    // Fixed public query IDs, GET only, no user URLs, Riot cookies, or arbitrary GraphQL documents.
    let mut response = state
        .http_no_redirect
        .get("https://playriftbound.com/api/gql")
        .query(&[
            ("operationName", operation.0.to_owned()),
            ("variables", variables.to_string()),
            (
                "extensions",
                json!({"persistedQuery":{"version":1,"sha256Hash":operation.1}}).to_string(),
            ),
        ])
        // Apollo's CSRF guard refuses a GET without a JSON content type.
        .header("content-type", "application/json")
        .header("apollographql-client-name", "Solace Calendar")
        .header("apollographql-client-version", env!("CARGO_PKG_VERSION"))
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|_| unavailable("request"))?;
    if !response.status().is_success() {
        return Err(unavailable("status"));
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| unavailable("body"))? {
        if body.len() + chunk.len() > 2_000_000 {
            return Err(unavailable("size"));
        }
        body.extend_from_slice(&chunk);
    }
    let result: Value = serde_json::from_slice(&body).map_err(|_| unavailable("json"))?;
    if result
        .get("errors")
        .and_then(Value::as_array)
        .is_some_and(|errors| !errors.iter().all(not_found))
    {
        return Err(unavailable("graphql"));
    }
    result
        .get("data")
        .filter(|v| !v.is_null())
        .cloned()
        .ok_or_else(|| unavailable("data"))
}

/// The tournament with this id, or `None` when Riot has no single match for it.
pub(super) async fn tournament(state: &AppState, id: &str) -> Result<Option<Value>, AppError> {
    let data = query(state, TOURNAMENT, json!({"tournamentId":id})).await?;
    let rows = data
        .get("competeTournaments")
        .and_then(Value::as_array)
        .ok_or_else(|| unavailable("tournament"))?;
    Ok(match rows.as_slice() {
        [row] if row.get("id").and_then(Value::as_str) == Some(id) => Some(row.clone()),
        _ => None,
    })
}

/// The store with this id, or `None` when Riot does not know it.
pub(super) async fn organizer(state: &AppState, id: &str) -> Result<Option<Value>, AppError> {
    if uuid::Uuid::parse_str(id).is_err() {
        return Ok(None);
    }
    let data = query(state, ORGANIZER, json!({"id":id})).await?;
    Ok(data
        .get("organizerSummary")
        .filter(|s| s.get("id").and_then(Value::as_str) == Some(id))
        .cloned())
}
