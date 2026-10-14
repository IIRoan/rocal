//! Suite harness: one `TestApp` per test, fresh invited users, and database state checks.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde_json::{Value, json};
use solace_api_tests::Result;
use solace_api_tests::client::{Agent, ApiResponse, ClientKind};
use solace_api_tests::env::{
    BackendTarget, DEVELOPMENT_FRONTEND_URL, PRODUCTION_BACKEND_URL, PRODUCTION_FRONTEND_URL,
    TEMPLATE_DATABASE, TestEnv,
};
use solace_api_tests::guard;
use sqlx::postgres::PgPoolOptions;
use sqlx::{Connection, Executor, PgPool};

/// `NODE_ENV` of the backend under test (`TEST_BACKEND_MODE`); production changes cookie names and attributes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Development,
    Production,
}

/// Which implementation runs (`TEST_BACKEND`), only for the differences the plan mandates.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Backend {
    TypeScript,
    Rust,
}

pub struct TestApp {
    pub base_url: String,
    /// The backend's own idea of its URL (`BACKEND_URL`), which it puts in links it hands out.
    pub public_api_url: String,
    pub origin: String,
    pub mode: Mode,
    pub backend: Backend,
    pub env: TestEnv,
    /// The backend's own database, for state checks.
    pub db: PgPool,
    root_user_id: String,
    /// The in-process server's database, dropped with the app.
    scratch: Option<ScratchDatabase>,
}

/// A database cloned from the template for one in-process test.
struct ScratchDatabase {
    admin_url: String,
    name: String,
}

impl Drop for ScratchDatabase {
    fn drop(&mut self) {
        let (admin_url, name) = (self.admin_url.clone(), self.name.clone());
        // Drop runs inside the test's runtime, so the cleanup gets a thread and runtime of its own.
        let cleanup = std::thread::spawn(move || {
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build();
            if let Ok(runtime) = runtime {
                runtime.block_on(async {
                    if let Ok(mut admin) = sqlx::PgConnection::connect(&admin_url).await {
                        let _ = admin
                            .execute(
                                format!("DROP DATABASE IF EXISTS {name} WITH (FORCE)").as_str(),
                            )
                            .await;
                    }
                });
            }
        });
        let _ = cleanup.join();
    }
}

fn mode() -> Mode {
    match std::env::var("TEST_BACKEND_MODE").as_deref() {
        Ok("production") => Mode::Production,
        _ => Mode::Development,
    }
}

/// Clones the template, then serves the Rust backend on it.
async fn in_process(env: &TestEnv, mode: Mode) -> (String, String, ScratchDatabase) {
    let name = format!("solace_test_run_{}", hex(8));
    let mut admin = sqlx::PgConnection::connect(&env.database_url)
        .await
        .expect("connect to the test Postgres");
    admin
        .execute(format!("CREATE DATABASE {name} TEMPLATE {TEMPLATE_DATABASE}").as_str())
        .await
        .expect("clone the template database (run `cargo xtask test-env template`)");
    let database_url = env.database_url_for(&name).expect("scratch database url");
    let base_url = serve_rust(env, mode, &database_url).await;
    let scratch = ScratchDatabase {
        admin_url: env.database_url.clone(),
        name,
    };
    (base_url, database_url, scratch)
}

/// Serves the Rust backend on a random port with the same settings the TypeScript backend gets.
async fn serve_rust(env: &TestEnv, mode: Mode, database_url: &str) -> String {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind a port");
    let port = listener.local_addr().expect("local address").port();
    let vars = env.backend_vars(&BackendTarget {
        port,
        production: mode == Mode::Production,
        database_url,
        stalwart_provision_token: "",
    });
    let config = solace_server::config::Config::from_lookup(|wanted| {
        vars.iter()
            .find(|(name, _)| *name == wanted)
            .map(|(_, value)| value.clone())
    })
    .expect("server config");
    let pool = solace_server::db::connect(database_url)
        .await
        .expect("server pool");
    let state = solace_server::state::AppState::new(config, pool).expect("server state");
    tokio::spawn(solace_server::serve(
        listener,
        state,
        std::future::pending(),
    ));
    format!("http://localhost:{port}")
}

pub struct TestUser {
    pub agent: Agent,
    pub id: String,
    pub email: String,
    pub password: String,
    pub name: String,
}

impl TestApp {
    /// The Rust server in-process on a random port with a fresh database, or `API_BASE_URL` (whose database is `TEST_DATABASE_URL`).
    pub async fn spawn() -> Self {
        let env = TestEnv::from_env().expect("test environment");
        let mode = mode();
        let (base_url, backend, database_url, scratch) = match std::env::var("API_BASE_URL") {
            Ok(base_url) => {
                guard::check_service_url("API_BASE_URL", &base_url).expect("API_BASE_URL");
                let backend = match std::env::var("TEST_BACKEND").as_deref() {
                    Ok("rust") => Backend::Rust,
                    _ => Backend::TypeScript,
                };
                (base_url, backend, env.database_url.clone(), None)
            }
            Err(_) => {
                let (base_url, database_url, scratch) = in_process(&env, mode).await;
                (base_url, Backend::Rust, database_url, Some(scratch))
            }
        };
        Self::connect(env, mode, base_url, backend, &database_url, scratch).await
    }

    /// The TypeScript backend at `INTEROP_TS_URL` and the Rust server in-process on its database (`TEST_DATABASE_URL`); `None` when unset.
    pub async fn interop() -> Option<(Self, Self)> {
        let ts_url = std::env::var("INTEROP_TS_URL").ok()?;
        guard::check_service_url("INTEROP_TS_URL", &ts_url).expect("INTEROP_TS_URL");
        let env = TestEnv::from_env().expect("test environment");
        let mode = mode();
        let database_url = env.database_url.clone();
        let rust_url = serve_rust(&env, mode, &database_url).await;
        let ts = Self::connect(
            env.clone(),
            mode,
            ts_url,
            Backend::TypeScript,
            &database_url,
            None,
        )
        .await;
        let rust = Self::connect(env, mode, rust_url, Backend::Rust, &database_url, None).await;
        Some((ts, rust))
    }

    async fn connect(
        env: TestEnv,
        mode: Mode,
        base_url: String,
        backend: Backend,
        database_url: &str,
        scratch: Option<ScratchDatabase>,
    ) -> Self {
        let public_api_url = std::env::var("TEST_PUBLIC_API_URL").unwrap_or_else(|_| match mode {
            Mode::Development => base_url.trim_end_matches('/').to_owned(),
            Mode::Production => PRODUCTION_BACKEND_URL.into(),
        });
        let origin = std::env::var("TEST_WEB_ORIGIN").unwrap_or_else(|_| {
            match mode {
                Mode::Development => DEVELOPMENT_FRONTEND_URL,
                Mode::Production => PRODUCTION_FRONTEND_URL,
            }
            .into()
        });
        let db = PgPoolOptions::new()
            .max_connections(2)
            .connect(database_url)
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
            public_api_url,
            origin,
            mode,
            backend,
            env,
            db,
            root_user_id,
            scratch,
        }
    }

    /// `better-auth.<suffix>`, with the `__Secure-` prefix in production.
    pub fn auth_cookie(&self, suffix: &str) -> String {
        match self.mode {
            Mode::Development => format!("better-auth.{suffix}"),
            Mode::Production => format!("__Secure-better-auth.{suffix}"),
        }
    }

    pub fn session_cookie(&self) -> String {
        self.auth_cookie("session_token")
    }

    /// Admin JMAP on the test Stalwart, for setup and inspection only.
    pub async fn stalwart_admin(&self, using: &[&str], method_calls: Value) -> Value {
        let mut request = reqwest::Client::new()
            .post(format!("{}/jmap/", self.env.stalwart_url))
            .basic_auth("admin", Some(&self.env.stalwart_admin_password))
            .json(&json!({"using": using, "methodCalls": method_calls}));
        if let Some(key) = &self.env.stalwart_gate_key {
            request = request.header("X-Solace-Gate", key);
        }
        request
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .expect("stalwart admin request")
            .json()
            .await
            .expect("stalwart admin json")
    }

    /// The Stalwart account id of a mailbox local part, if it exists.
    pub async fn stalwart_account_id(&self, local_part: &str) -> Option<String> {
        let response = self
            .stalwart_admin(
                &["urn:ietf:params:jmap:core", "urn:stalwart:jmap"],
                json!([["x:Account/query", {"filter": {"name": local_part}}, "q"]]),
            )
            .await;
        response["methodResponses"][0][1]["ids"]
            .as_array()
            .and_then(|ids| ids.first())
            .and_then(Value::as_str)
            .map(str::to_owned)
    }

    /// A Stalwart account without encryption at rest, so tests can read app mail sent to `local_part`.
    pub async fn plain_mailbox(&self, local_part: &str) {
        let domain = self
            .stalwart_admin(
                &["urn:ietf:params:jmap:core", "urn:stalwart:jmap"],
                json!([
                    ["x:Domain/query", {"filter": {"name": self.env.mail_domain}}, "q"]
                ]),
            )
            .await;
        let domain_id = domain["methodResponses"][0][1]["ids"][0].clone();
        let created = self
            .stalwart_admin(
                &["urn:ietf:params:jmap:core", "urn:stalwart:jmap"],
                json!([["x:Account/set", {"create": {"a": {
                    "@type": "User",
                    "name": local_part,
                    "domainId": domain_id,
                    "roles": {"@type": "User"},
                    "credentials": {"0": {"@type": "Password", "secret": format!("solace-test-{}", hex(12))}},
                }}}, "s"]]),
            )
            .await;
        assert!(
            created["methodResponses"][0][1]["created"]["a"]["id"].is_string(),
            "plain mailbox not created: {created}"
        );
    }

    /// Messages in a mailbox, newest first, with subject, from, to and text body.
    pub async fn mailbox_messages(&self, local_part: &str) -> Vec<Value> {
        let Some(account_id) = self.stalwart_account_id(local_part).await else {
            return Vec::new();
        };
        let response = self
            .stalwart_admin(
                &["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
                json!([
                    ["Email/query", {"accountId": account_id, "sort": [{"property": "receivedAt", "isAscending": false}], "limit": 50}, "q"],
                    ["Email/get", {
                        "accountId": account_id,
                        "#ids": {"resultOf": "q", "name": "Email/query", "path": "/ids"},
                        "properties": ["subject", "from", "to", "receivedAt", "textBody", "bodyValues", "attachments"],
                        "fetchTextBodyValues": true,
                    }, "g"],
                ]),
            )
            .await;
        response["methodResponses"][1][1]["list"]
            .as_array()
            .cloned()
            .unwrap_or_default()
    }

    /// Waits up to five seconds for a message whose subject contains `subject`.
    pub async fn wait_for_message(&self, local_part: &str, subject: &str) -> Value {
        for _ in 0..50 {
            let messages = self.mailbox_messages(local_part).await;
            if let Some(message) = messages
                .into_iter()
                .find(|m| m["subject"].as_str().is_some_and(|s| s.contains(subject)))
            {
                return message;
            }
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
        panic!("no message with subject containing {subject:?} for {local_part}");
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
    pub fn local_part(&self) -> &str {
        self.email.split('@').next().unwrap_or_default()
    }

    /// Provisions this user's mailbox with one of the four fixture OpenPGP keys.
    pub async fn bootstrap_mailbox(&mut self, key: usize) {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures/pgp");
        let keys: Value = serde_json::from_str(
            &std::fs::read_to_string(dir.join("keys.json")).expect("keys.json"),
        )
        .expect("keys.json");
        let entry = &keys[key % 4];
        let armored = std::fs::read_to_string(dir.join(entry["file"].as_str().unwrap_or_default()))
            .expect("fixture key");
        let response = self
            .post(
                "/api/mail/account/bootstrap",
                json!({
                    "publicKeyArmored": armored,
                    "fingerprint": entry["fingerprint"],
                    "algorithm": entry["algorithm"],
                    "createdAt": entry["createdAt"],
                    "vaultVersion": 1,
                    "encryptedVaultB64": "c29sYWNlLXRlc3QtdmF1bHQ=",
                    "kdf": "argon2id",
                    "kdfParams": {"saltB64": "c29sYWNlLXRlc3Q=", "memoryKiB": 65536, "iterations": 3, "parallelism": 1},
                    "wrappedSecret": "{\"version\":1,\"algorithm\":\"AES-GCM\",\"iv\":\"AAAAAAAAAAAAAAAA\",\"ciphertext\":\"c29sYWNl\"}",
                    "wrapAlgorithm": "AES-GCM-256",
                }),
            )
            .await;
        ok(response.expect_status(200));
    }

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

/// The `Set-Cookie` headers that set or expire `name`.
pub fn set_cookies_named(response: &ApiResponse, name: &str) -> Vec<String> {
    response
        .set_cookies()
        .into_iter()
        .filter(|cookie| {
            cookie
                .split_once('=')
                .is_some_and(|(n, _)| n.trim() == name)
        })
        .collect()
}

/// Better Auth's signed cookie value (`encodeURIComponent(value + "." + base64(HMAC-SHA256))`), verified and unwrapped.
pub fn signed_cookie_token(secret: &str, cookie_value: &str) -> Option<String> {
    use base64::engine::general_purpose::STANDARD;
    use hmac::{KeyInit, Mac};
    let decoded = percent_encoding::percent_decode_str(cookie_value)
        .decode_utf8()
        .ok()?;
    let (value, signature) = decoded.rsplit_once('.')?;
    let mut mac = hmac::Hmac::<sha2::Sha256>::new_from_slice(secret.as_bytes()).ok()?;
    mac.update(value.as_bytes());
    (STANDARD.encode(mac.finalize().into_bytes()) == signature).then(|| value.to_owned())
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

/// A service validation error without a field: no `details` at all.
pub fn expect_plain_error(response: &ApiResponse, message: &str) {
    let body = ok(response.expect_error(400, "Validation Error", message));
    assert!(body.get("details").is_none(), "{body}");
}
