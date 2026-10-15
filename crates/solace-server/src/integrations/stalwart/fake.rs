//! A local HTTP server that answers like Stalwart and records every request, for the Stalwart clients' tests.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, Method, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use serde_json::Value;

use super::gate::{GATE_HEADER, StalwartGate};

#[derive(Debug, Clone)]
pub struct Recorded {
    pub method: Method,
    pub path: String,
    pub authorization: Option<String>,
    pub gate: Option<String>,
    pub content_type: Option<String>,
    pub body: String,
}

impl Recorded {
    pub fn json(&self) -> Value {
        serde_json::from_str(&self.body).unwrap_or(Value::Null)
    }

    /// The first JMAP method name of the request body.
    pub fn first_method(&self) -> String {
        self.json()["methodCalls"][0][0]
            .as_str()
            .unwrap_or_default()
            .to_owned()
    }
}

pub struct Reply {
    status: StatusCode,
    body: Option<Value>,
}

impl Reply {
    pub fn json(body: Value) -> Self {
        Self {
            status: StatusCode::OK,
            body: Some(body),
        }
    }

    pub fn status(status: u16) -> Self {
        Self {
            status: StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
            body: None,
        }
    }
}

type Handler = dyn Fn(&Recorded) -> Reply + Send + Sync;

#[derive(Clone)]
struct Shared {
    handler: Arc<Handler>,
    requests: Arc<Mutex<Vec<Recorded>>>,
}

pub struct FakeStalwart {
    pub base_url: String,
    pub http: reqwest::Client,
    pub gate: StalwartGate,
    requests: Arc<Mutex<Vec<Recorded>>>,
}

impl FakeStalwart {
    /// Answers each request with the next reply, in order; a 500 once they run out.
    pub async fn scripted(replies: Vec<Reply>) -> Self {
        let queue = Mutex::new(VecDeque::from(replies));
        Self::start(move |_| {
            queue
                .lock()
                .unwrap()
                .pop_front()
                .unwrap_or_else(|| Reply::status(500))
        })
        .await
    }

    pub async fn start(handler: impl Fn(&Recorded) -> Reply + Send + Sync + 'static) -> Self {
        let requests = Arc::new(Mutex::new(Vec::new()));
        let shared = Shared {
            handler: Arc::new(handler),
            requests: requests.clone(),
        };
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        let app = axum::Router::new().fallback(answer).with_state(shared);
        tokio::spawn(async move { axum::serve(listener, app).await });
        Self {
            gate: StalwartGate::new(&base_url, None),
            http: reqwest::Client::new(),
            base_url,
            requests,
        }
    }

    pub fn requests(&self) -> Vec<Recorded> {
        self.requests.lock().unwrap().clone()
    }
}

async fn answer(
    State(shared): State<Shared>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let header = |name: &str| {
        headers
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned)
    };
    let recorded = Recorded {
        method,
        path: uri.path().to_owned(),
        authorization: header("authorization"),
        gate: header(GATE_HEADER),
        content_type: header("content-type"),
        body: String::from_utf8_lossy(&body).into_owned(),
    };
    shared.requests.lock().unwrap().push(recorded.clone());
    let reply = (shared.handler)(&recorded);
    match reply.body {
        Some(body) => (reply.status, axum::Json(body)).into_response(),
        None => reply.status.into_response(),
    }
}
