//! `GET /api/realtime/mail`: `mail.changed` server-sent events for the caller's own mailbox.

use std::convert::Infallible;
use std::pin::Pin;
use std::task::{Context, Poll};
use std::time::Duration;

use axum::body::{Body, Bytes, HttpBody};
use axum::extract::State;
use axum::http::{HeaderValue, header};
use axum::response::{IntoResponse, Response};
use http_body::Frame;
use solace_api_types::mail::MailChangedEvent;
use tokio::sync::mpsc;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::{Owner, Subscription, subscribe};
use crate::auth::guard::Auth;
use crate::error::AppError;
use crate::mail::sync;
use crate::state::AppState;
use crate::telemetry::log_ref;

const HEARTBEAT: Duration = Duration::from_secs(15);

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().routes(routes!(stream))
}

/// Signals that the caller's mailbox changed, with the synced deltas.
#[utoipa::path(get, path = "/api/realtime/mail", operation_id = "streamMailEvents", tag = "Mail", responses((status = 200, content_type = "text/event-stream", body = String)))]
#[tracing::instrument(skip_all)]
pub async fn stream(State(state): State<AppState>, auth: Auth) -> Result<Response, AppError> {
    let user = auth.require()?;
    let account_ids = sync::authorized_account_ids(&state, &user.id).await?;
    let subscriber_id = uuid::Uuid::new_v4().to_string();
    let (sender, events) = mpsc::unbounded_channel();
    tracing::info!(
        subscriber_id,
        user_ref = log_ref(&user.id),
        accounts = account_ids.len(),
        "Mail SSE client connected"
    );
    let owner = Owner {
        user_id: user.id.clone(),
        email: user.email.trim().to_owned(),
    };
    let subscription = subscribe(&state, subscriber_id, account_ids, &owner, sender);
    let body = EventStream {
        greeting: Some(Bytes::from_static(b"retry: 5000\n: connected\n\n")),
        events,
        heartbeat: tokio::time::interval_at(tokio::time::Instant::now() + HEARTBEAT, HEARTBEAT),
        _subscription: subscription,
    };
    let mut response = Body::new(body).into_response();
    let headers = response.headers_mut();
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("no-cache, no-transform"),
    );
    headers.insert(header::CONNECTION, HeaderValue::from_static("keep-alive"));
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/event-stream"),
    );
    headers.insert("x-accel-buffering", HeaderValue::from_static("no"));
    Ok(response)
}

/// The SSE body: the retry hint, then events and heartbeats until the client goes away and the subscription drops.
struct EventStream {
    greeting: Option<Bytes>,
    events: mpsc::UnboundedReceiver<MailChangedEvent>,
    heartbeat: tokio::time::Interval,
    _subscription: Subscription,
}

impl HttpBody for EventStream {
    type Data = Bytes;
    type Error = Infallible;

    fn poll_frame(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Option<Result<Frame<Bytes>, Infallible>>> {
        if let Some(greeting) = self.greeting.take() {
            return Poll::Ready(Some(Ok(Frame::data(greeting))));
        }
        match self.events.poll_recv(cx) {
            Poll::Ready(Some(event)) => {
                let data = serde_json::to_string(&event).unwrap_or_default();
                let frame = format!("event: mail.changed\ndata: {data}\n\n");
                return Poll::Ready(Some(Ok(Frame::data(Bytes::from(frame)))));
            }
            Poll::Ready(None) => return Poll::Ready(None),
            Poll::Pending => {}
        }
        if self.heartbeat.poll_tick(cx).is_ready() {
            return Poll::Ready(Some(Ok(Frame::data(Bytes::from_static(
                b": keepalive\n\n",
            )))));
        }
        Poll::Pending
    }
}
