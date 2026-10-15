//! The Solace API: `router()` and `openapi()` are shared by `main`, the API suite and `cargo xtask openapi`.

pub mod account;
pub mod addresses;
pub mod auth;
pub mod calendar_sharing;
pub mod calendars;
pub mod categories;
pub mod config;
pub mod db;
pub mod e2ee;
pub mod email;
pub mod entity_metadata;
pub mod error;
pub mod events;
pub mod health;
pub mod http;
pub mod instant;
pub mod integrations;
pub mod invitations;
pub mod invites;
pub mod mail_settings;
pub mod notifications;
pub mod profiles;
pub mod push_devices;
pub mod recent_contacts;
pub mod recurring;
pub mod settings;
pub mod state;
pub mod subscriptions;
pub mod telemetry;

use std::future::Future;

use axum::extract::{DefaultBodyLimit, Request};
use axum::middleware;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Router, ServiceExt};
use tokio::net::TcpListener;
use tower::Layer;
use tower::util::MapRequestLayer;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;

use crate::error::AppError;
use crate::state::AppState;

#[derive(OpenApi)]
#[openapi(info(
    title = "Solace API",
    description = "The Solace calendar and mail API."
))]
struct ApiDoc;

fn api() -> OpenApiRouter<AppState> {
    let mut document = ApiDoc::openapi();
    document.merge(solace_api_types::ApiSchemas::openapi());
    OpenApiRouter::with_openapi(document)
        .merge(health::routes())
        .merge(auth::routes())
        .merge(account::routes())
        .merge(invites::routes())
        .merge(calendars::routes())
        .merge(categories::routes())
        .merge(calendar_sharing::routes())
        .merge(settings::routes())
        .merge(recent_contacts::routes())
        .merge(push_devices::routes())
        .merge(profiles::routes())
        .merge(e2ee::routes())
        .merge(events::routes())
        .merge(notifications::routes())
        .merge(subscriptions::routes())
        .merge(invitations::routes())
        .merge(recurring::routes())
        .merge(mail_settings::routes())
}

/// Every route's OpenAPI entry, without a database.
pub fn openapi() -> utoipa::openapi::OpenApi {
    api().split_for_parts().1
}

/// The full application with its middleware, as one router.
pub fn router(state: AppState) -> Router {
    let (routes, _) = api().split_for_parts();
    routes
        .route("/api", get(health::root_redirect))
        .fallback(not_found)
        .method_not_allowed_fallback(not_found)
        .layer(DefaultBodyLimit::max(http::BODY_LIMIT_BYTES))
        .layer(middleware::from_fn(http::timeout))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth::pipeline::middleware,
        ))
        .layer(middleware::from_fn(http::response_cookies::middleware))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            http::headers::cors,
        ))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            http::headers::security_headers,
        ))
        .layer(middleware::from_fn(http::request_context::middleware))
        .with_state(state)
}

/// Serves until `shutdown` resolves, then drains in-flight requests.
pub async fn serve(
    listener: TcpListener,
    state: AppState,
    shutdown: impl Future<Output = ()> + Send + 'static,
) -> std::io::Result<()> {
    let app = MapRequestLayer::new(http::normalize_path).layer(router(state));
    axum::serve(listener, ServiceExt::<Request>::into_make_service(app))
        .with_graceful_shutdown(shutdown)
        .await
}

async fn not_found(request: Request) -> Response {
    if request.uri().path().starts_with("/api/auth/") {
        return auth::unknown_auth_path();
    }
    AppError::NotFound("Not Found".into()).into_response()
}
