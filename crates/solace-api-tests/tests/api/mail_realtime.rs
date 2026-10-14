//! `GET /api/realtime/mail`: a server-sent event stream of `mail.changed` signals for the caller's own mailbox only.

use std::time::Duration;

use serde_json::json;
use solace_api_tests::client::ApiResponse;
use solace_api_types::mail::MailChangedEvent;
use tokio::time::Instant;

use crate::helpers::{TestApp, TestUser, expect_unauthorized, ok};
use crate::mail_support::{Mailbox, mailbox, unique_subject};

struct EventStream {
    response: reqwest::Response,
    buffer: String,
}

impl EventStream {
    async fn open(app: &TestApp, user: &TestUser) -> Self {
        let cookie = user
            .agent
            .cookies()
            .iter()
            .map(|(name, value)| format!("{name}={value}"))
            .collect::<Vec<_>>()
            .join("; ");
        let response = reqwest::Client::new()
            .get(format!("{}/api/realtime/mail", app.base_url))
            .header("origin", &app.origin)
            .header("cookie", cookie)
            .header("x-forwarded-for", user.agent.client_ip())
            .send()
            .await
            .expect("open event stream");
        Self {
            response,
            buffer: String::new(),
        }
    }

    /// The next complete frame, or `None` once the deadline passes or the server closes the stream.
    async fn next_frame(&mut self, deadline: Instant) -> Option<String> {
        loop {
            if let Some(end) = self.buffer.find("\n\n") {
                let frame = self.buffer[..end].to_owned();
                self.buffer.drain(..end + 2);
                return Some(frame);
            }
            let chunk = tokio::time::timeout_at(deadline, self.response.chunk())
                .await
                .ok()?
                .ok()??;
            self.buffer.push_str(&String::from_utf8_lossy(&chunk));
        }
    }

    /// The next `mail.changed` event before the deadline.
    async fn next_mail_changed(&mut self, deadline: Instant) -> Option<MailChangedEvent> {
        while let Some(frame) = self.next_frame(deadline).await {
            let mut lines = frame.lines();
            if lines.next() != Some("event: mail.changed") {
                continue;
            }
            let data = lines
                .next()
                .and_then(|line| line.strip_prefix("data: "))
                .expect("event data");
            let response = ApiResponse {
                status: reqwest::StatusCode::OK,
                headers: reqwest::header::HeaderMap::new(),
                body: data.as_bytes().to_vec(),
            };
            return Some(ok(response.dto()));
        }
        None
    }
}

#[tokio::test]
async fn anonymous_callers_are_refused() {
    let app = TestApp::spawn().await;
    expect_unauthorized(&ok(app.anonymous().get("/api/realtime/mail").await));
}

#[tokio::test]
async fn the_stream_opens_with_a_retry_hint_even_without_a_mailbox() {
    let app = TestApp::spawn().await;
    let user = app.user().await;
    let mut stream = EventStream::open(&app, &user).await;
    assert_eq!(stream.response.status().as_u16(), 200);
    let header = |name: &str| {
        stream
            .response
            .headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned)
    };
    assert_eq!(header("content-type").as_deref(), Some("text/event-stream"));
    assert_eq!(
        header("cache-control").as_deref(),
        Some("no-cache, no-transform")
    );
    assert_eq!(header("x-accel-buffering").as_deref(), Some("no"));

    let deadline = Instant::now() + Duration::from_secs(5);
    assert_eq!(
        stream.next_frame(deadline).await.as_deref(),
        Some("retry: 5000\n: connected")
    );
}

#[tokio::test]
async fn mailbox_changes_are_announced_to_the_owner_only() {
    let app = TestApp::spawn().await;
    let mut owner: Mailbox = mailbox(&app).await;
    let bystander = mailbox(&app).await;
    let account = owner.account_id().to_owned();

    // The local Bun server drops a stream after 10 s without writes, so each attempt gets a fresh pair of streams.
    for _attempt in 0..8 {
        let mut owner_stream = EventStream::open(&app, &owner.user).await;
        let mut bystander_stream = EventStream::open(&app, &bystander.user).await;
        let deadline = Instant::now() + Duration::from_secs(9);
        for stream in [&mut owner_stream, &mut bystander_stream] {
            assert_eq!(
                stream.next_frame(deadline).await.as_deref(),
                Some("retry: 5000\n: connected")
            );
        }
        // A new message every two seconds, so a subscription that comes up late still sees a change.
        let mut received = None;
        while received.is_none() && Instant::now() < deadline {
            let subject = unique_subject("Realtime");
            owner
                .append(
                    "inbox",
                    json!({"from": [{"email": "sam@example.com"}], "to": [{"email": owner.user.email}], "subject": subject,
                           "bodyValues": {"t": {"value": "Ping"}}, "textBody": [{"partId": "t", "type": "text/plain"}]}),
                )
                .await;
            let wait = (Instant::now() + Duration::from_secs(2)).min(deadline);
            received = owner_stream.next_mail_changed(wait).await;
        }
        let Some(event) = received else {
            continue;
        };
        assert_eq!(event.kind, "mail.changed");
        assert_eq!(event.account_id.0, account);
        assert!(!event.changed_types.is_empty());
        assert!(
            event
                .changed_types
                .iter()
                .all(|t| ["Email", "Mailbox", "Thread"].contains(&t.as_str())),
            "{event:?}"
        );
        if let Some(sync) = &event.sync {
            assert_eq!(sync.account_id.0, account);
        }

        let quiet_until = Instant::now() + Duration::from_secs(2);
        while let Some(other) = bystander_stream.next_mail_changed(quiet_until).await {
            assert_ne!(
                other.account_id.0, account,
                "another user's stream never carries this mailbox"
            );
        }
        return;
    }
    panic!("no mail.changed event reached the owner's stream");
}
