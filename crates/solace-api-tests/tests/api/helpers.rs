//! Suite harness: one `TestApp` per test, fresh invited users, and database state checks.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde_json::{Value, json};
use solace_api_tests::Result;
use solace_api_tests::client::{Agent, ApiResponse, ClientKind};
use solace_api_tests::env::TestEnv;
use solace_api_tests::guard;
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;

/// The web origin every browser agent sends; the backend under test must trust it.
const DEFAULT_WEB_ORIGIN: &str = "http://localhost:4100";

pub struct TestApp {
    pub base_url: String,
    pub origin: String,
    pub env: TestEnv,
    /// The backend's own database, for state checks.
    pub db: PgPool,
    root_user_id: String,
}

pub struct TestUser {
    pub agent: Agent,
    pub id: String,
    pub email: String,
    pub password: String,
    pub name: String,
}

impl TestApp {
    /// Targets `API_BASE_URL` (a running backend whose database is `TEST_DATABASE_URL`).
    pub async fn spawn() -> Self {
        let env = TestEnv::from_env().expect("test environment");
        let base_url = std::env::var("API_BASE_URL")
            .expect("API_BASE_URL must point at the backend under test");
        guard::check_service_url("API_BASE_URL", &base_url).expect("API_BASE_URL");
        let origin = std::env::var("TEST_WEB_ORIGIN").unwrap_or_else(|_| DEFAULT_WEB_ORIGIN.into());
        let db = PgPoolOptions::new()
            .max_connections(2)
            .connect(&env.database_url)
            .await
            .expect("connect to the backend's test database");

        // Sign-up is invite-gated; a credential-less root user sends every invite.
        let root_user_id = format!("suiteroot{}", hex(8));
        sqlx::query(
            "INSERT INTO \"user\" (id, name, email, email_verified, created_at, updated_at) \
             VALUES ($1, 'Suite Root', $2, true, now(), now())",
        )
        .bind(&root_user_id)
        .bind(format!("{root_user_id}@example.com"))
        .execute(&db)
        .await
        .expect("insert root user");

        Self {
            base_url,
            origin,
            env,
            db,
            root_user_id,
        }
    }

    pub fn anonymous(&self) -> Agent {
        Agent::new(&self.base_url, &self.origin, ClientKind::Browser).expect("agent")
    }

    pub fn expo(&self, scheme: &str) -> Agent {
        Agent::new(&self.base_url, &format!("{scheme}://"), ClientKind::Expo).expect("agent")
    }

    /// An invite from the root user for someone outside Solace, straight in the database.
    pub async fn invite_token(&self) -> String {
        let token = URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>());
        sqlx::query(
            "INSERT INTO invite (id, token, invited_by_id, email, status, expires_at, created_at, updated_at) \
             VALUES ($1, $2, $3, $4, 'pending', now() + interval '7 days', now(), now())",
        )
        .bind(format!("suiteinvite{}", hex(8)))
        .bind(&token)
        .bind(&self.root_user_id)
        .bind(format!("invitee-{}@example.com", hex(6)))
        .execute(&self.db)
        .await
        .expect("insert invite");
        token
    }

    /// A fresh user signed up through the invite flow, with a browser agent holding its session.
    pub async fn user(&self) -> TestUser {
        let handle = format!("u{}", hex(6));
        let email = format!("{handle}@{}", self.env.mail_domain);
        let password = format!("solace-test-{}", hex(8));
        let name = format!("Test {handle}");
        let mut agent = self.anonymous();
        let token = self.invite_token().await;
        agent
            .post(
                "/api/account/invite/claim",
                json!({"token": token, "chosenEmail": email}),
            )
            .await
            .and_then(|r| r.expect_status(200))
            .expect("claim invite");
        let signed_up = agent
            .post(
                "/api/auth/sign-up/email",
                json!({"email": email, "password": password, "name": name}),
            )
            .await
            .and_then(|r| r.expect_status(200))
            .and_then(|r| r.value())
            .expect("sign up");
        let id = signed_up["user"]["id"]
            .as_str()
            .expect("user id")
            .to_owned();
        TestUser {
            agent,
            id,
            email,
            password,
            name,
        }
    }
}

impl TestUser {
    pub async fn get(&mut self, path: &str) -> ApiResponse {
        self.agent.get(path).await.expect("request")
    }

    pub async fn delete(&mut self, path: &str) -> ApiResponse {
        self.agent.delete(path).await.expect("request")
    }

    pub async fn post(&mut self, path: &str, body: Value) -> ApiResponse {
        self.agent.post(path, body).await.expect("request")
    }

    pub async fn put(&mut self, path: &str, body: Value) -> ApiResponse {
        self.agent.put(path, body).await.expect("request")
    }

    pub async fn patch(&mut self, path: &str, body: Value) -> ApiResponse {
        self.agent.patch(path, body).await.expect("request")
    }
}

/// The auth guard's 401: no request id, fixed message.
pub fn expect_unauthorized(response: &ApiResponse) {
    let body = response
        .expect_error(401, "Unauthorized", "Unauthorized access")
        .expect("401 envelope");
    assert!(
        body.get("requestId").is_none(),
        "guard 401 has no requestId: {body}"
    );
}

/// A strict-schema rejection of an extra field such as a forged `userId`.
pub fn expect_unknown_field(response: &ApiResponse, field: &str) {
    let message = format!("Unrecognized key(s) in object: '{field}'");
    let body = response
        .expect_error(400, "Validation Error", &message)
        .expect("400 envelope");
    assert_eq!(
        body["details"]["issues"][0]["message"],
        json!(message),
        "{body}"
    );
}

pub async fn count(db: &PgPool, sql: &str, bind: &str) -> i64 {
    sqlx::query_scalar(sql)
        .bind(bind)
        .fetch_one(db)
        .await
        .expect("count query")
}

pub fn hex(bytes: usize) -> String {
    (0..bytes)
        .map(|_| format!("{:02x}", rand::random::<u8>()))
        .collect()
}

/// Turns a request failure into a test failure with the server's answer.
pub fn ok<T>(result: Result<T>) -> T {
    result.unwrap_or_else(|error| panic!("{error}"))
}

/// A Zod rejection: Zod v3's message and the path of the first issue.
pub fn expect_invalid(response: &ApiResponse, message: &str, path: &str) -> Value {
    let body = ok(response.expect_error(400, "Validation Error", message));
    assert_eq!(body["details"]["issues"][0]["path"], json!(path), "{body}");
    body
}

/// A service-level validation error: message plus `details.field`.
pub fn expect_field_error(response: &ApiResponse, message: &str, field: &str) -> Value {
    let body = ok(response.expect_error(400, "Validation Error", message));
    assert_eq!(body["details"], json!({ "field": field }), "{body}");
    assert!(body["requestId"].is_string(), "{body}");
    body
}

/// A request DTO as the JSON body to send.
pub fn json_body<T: serde::Serialize>(value: &T) -> Value {
    serde_json::to_value(value).expect("request DTO serializes")
}

/// Bytes of a file in `crates/solace-api-tests/fixtures`.
pub fn fixture(name: &str) -> Vec<u8> {
    std::fs::read(format!("{}/fixtures/{name}", env!("CARGO_MANIFEST_DIR"))).expect("fixture")
}
