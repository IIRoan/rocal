//! The passkey plugin (`@better-auth/passkey` 1.7.7) on webauthn-rs-core, the step-up cookie it grants, and the native bridge (`passkey-bridge-session.ts`).

use std::sync::LazyLock;
use std::time::Duration;

use axum::extract::{RawQuery, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use base64::Engine;
use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use sea_orm::Set;
use serde::Deserialize;
use serde_json::{Value, json};
use solace_api_types::auth::{OkFlag, Passkey, PasskeyUpdated, StatusFlag};
use webauthn_rs_core::WebauthnCore;
use webauthn_rs_core::error::WebauthnError;
use webauthn_rs_core::proto::{
    AttestationFormat, AttestationMetadata, AuthenticationState, COSEKey, Credential,
    ParsedAttestation, ParsedAttestationData, PublicKeyCredential, RegisterPublicKeyCredential,
    RegisteredExtensions, RegistrationState, UserVerificationPolicy,
};

use super::api::{
    ApiError, LOWER_ALPHANUMERIC, URL_SAFE, generate_id, json, random_string, validate,
};
use super::hooks::{self, Reply};
use super::pipeline::AuthBody;
use super::session::{self, ActiveSession};
use super::sessions::{require_fresh_session, require_session};
use super::{cookies, store};
use crate::db::entities::{passkey, user};
use crate::http::extract::form_object;
use crate::http::zod::{self, Schema};
use crate::instant;
use crate::state::AppState;

const CHALLENGE_SECONDS: i64 = 300;
const TIMEOUT_MS: u64 = 60_000;
const RP_NAME: &str = "Rocani";
const OFFERED_ALGORITHMS: [i32; 3] = [-8, -7, -257];
/// simplewebauthn verifies every algorithm it supports, not only the three it offers.
const VERIFIED_ALGORITHMS: [&str; 10] = [
    "EDDSA",
    "ES256",
    "ES512",
    "PS256",
    "PS384",
    "PS512",
    "RS256",
    "RS384",
    "RS512",
    "INSECURE_RS1",
];

static REGISTER_QUERY: LazyLock<Schema> = LazyLock::new(|| {
    zod::object([
        (
            "authenticatorAttachment",
            zod::enumeration(&["platform", "cross-platform"]).optional(),
        ),
        ("name", zod::string().optional()),
        ("context", zod::string().optional()),
    ])
    .optional()
});

static REGISTRATION: LazyLock<Schema> = LazyLock::new(|| {
    zod::object([
        ("response", zod::any().nonoptional()),
        ("name", zod::string().trim().optional()),
        ("createSession", zod::boolean().optional()),
    ])
});

static AUTHENTICATION: LazyLock<Schema> =
    LazyLock::new(|| zod::object([("response", zod::record())]));

static DELETE: LazyLock<Schema> = LazyLock::new(|| zod::object([("id", zod::string())]));

static UPDATE: LazyLock<Schema> =
    LazyLock::new(|| zod::object([("id", zod::string()), ("name", zod::string().trim().min(1))]));

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct RegisterQuery {
    authenticator_attachment: Option<String>,
    name: Option<String>,
    context: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegistrationBody {
    response: Value,
    name: Option<String>,
    create_session: Option<bool>,
}

#[derive(Deserialize)]
struct AuthenticationBody {
    response: Value,
}

#[derive(Deserialize)]
struct IdBody {
    id: String,
}

#[derive(Deserialize)]
struct UpdateBody {
    id: String,
    name: String,
}

/// The verification row's value: what the options promised, for the verify call to check.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Challenge {
    #[serde(rename = "type")]
    ceremony: String,
    expected_challenge: String,
    #[serde(default)]
    user_data: ChallengeUser,
}

#[derive(Deserialize, Default)]
struct ChallengeUser {
    #[serde(default)]
    id: String,
}

fn challenge_not_found() -> ApiError {
    ApiError::new(
        StatusCode::BAD_REQUEST,
        "CHALLENGE_NOT_FOUND",
        "Challenge not found",
    )
}

fn passkey_not_found(status: StatusCode) -> ApiError {
    ApiError::new(status, "PASSKEY_NOT_FOUND", "Passkey not found")
}

fn not_allowed() -> ApiError {
    ApiError::new(
        StatusCode::UNAUTHORIZED,
        "YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY",
        "You are not allowed to register this passkey",
    )
}

fn registration_failed() -> ApiError {
    ApiError::new(
        StatusCode::INTERNAL_SERVER_ERROR,
        "FAILED_TO_VERIFY_REGISTRATION",
        "Failed to verify registration",
    )
}

fn authentication_failed(status: StatusCode) -> ApiError {
    ApiError::new(status, "AUTHENTICATION_FAILED", "Authentication failed")
}

/// `getRpId` in `lib/auth.ts`: the passkey origin's last two host labels, or `localhost`.
fn rp_id(passkey_origin: &str) -> String {
    let host = url::Url::parse(passkey_origin)
        .ok()
        .and_then(|url| url.host_str().map(str::to_owned));
    match host {
        Some(host) if host != "localhost" => {
            let labels: Vec<&str> = host.split('.').collect();
            labels[labels.len().saturating_sub(2)..].join(".")
        }
        _ => "localhost".into(),
    }
}

fn webauthn(state: &AppState) -> Result<WebauthnCore, String> {
    let origin = url::Url::parse(&state.config.passkey_origin).map_err(|e| e.to_string())?;
    Ok(WebauthnCore::new_unsafe_experts_only(
        RP_NAME,
        &rp_id(&state.config.passkey_origin),
        vec![origin],
        Duration::from_millis(TIMEOUT_MS),
        None,
        None,
    ))
}

fn challenge_cookie(state: &AppState) -> String {
    state.cookies.name("better-auth-passkey")
}

/// Stores the ceremony for five minutes under a random token that only the signed challenge cookie carries.
async fn issue_challenge(state: &AppState, data: &Value) -> Result<String, ApiError> {
    let token = random_string(32, URL_SAFE);
    store::create_verification(&state.db, &token, data.to_string(), CHALLENGE_SECONDS).await?;
    Ok(state
        .cookies
        .signed(&challenge_cookie(state), &token, Some(CHALLENGE_SECONDS)))
}

/// Consumes the challenge the cookie points at, once; a challenge for the other ceremony counts as missing.
async fn consume_challenge(
    state: &AppState,
    headers: &HeaderMap,
    ceremony: &str,
) -> Result<Challenge, ApiError> {
    let request_cookies = cookies::parse_cookies(headers);
    let token = cookies::cookie(&request_cookies, &challenge_cookie(state))
        .and_then(|signed| state.cookies.verify_signed(signed))
        .ok_or_else(challenge_not_found)?;
    let row = store::consume_verification(&state.db, &token)
        .await?
        .ok_or_else(challenge_not_found)?;
    let challenge: Challenge =
        serde_json::from_str(&row.value).map_err(|_| ApiError::internal())?;
    if challenge.ceremony != ceremony {
        return Err(challenge_not_found());
    }
    Ok(challenge)
}

async fn user_passkeys(state: &AppState, user_id: &str) -> Result<Vec<passkey::Model>, ApiError> {
    Ok(store::user_passkeys(&state.db, user_id).await?)
}

/// `excludeCredentials` / `allowCredentials` entries as simplewebauthn writes them.
fn descriptors(passkeys: &[passkey::Model]) -> Vec<Value> {
    passkeys
        .iter()
        .map(|row| {
            let mut descriptor = json!({"id": row.credential_id});
            if let Some(transports) = &row.transports {
                descriptor["transports"] = json!(transports.split(',').collect::<Vec<_>>());
            }
            descriptor["type"] = json!("public-key");
            descriptor
        })
        .collect()
}

fn passkey_dto(row: &passkey::Model) -> Passkey {
    Passkey {
        id: row.id.clone().into(),
        name: row.name.clone(),
        public_key: row.public_key.clone(),
        user_id: row.user_id.clone().into(),
        credential_id: row.credential_id.clone(),
        counter: row.counter,
        device_type: row.device_type.clone(),
        backed_up: row.backed_up,
        transports: row.transports.clone(),
        created_at: row.created_at.map(instant::iso),
        aaguid: row.aaguid.clone(),
    }
}

/// The step-up cookie for the session the ceremony belongs to (`passkey-step-up.ts`).
fn step_up(state: &AppState, active: &ActiveSession) -> String {
    state.cookies.step_up(
        &active.user.id,
        &active.session.id,
        instant::unix_seconds(instant::now()),
    )
}

/// A new two-week session for the user, with the cookies `setSessionCookie` writes.
async fn new_session(
    state: &AppState,
    headers: &HeaderMap,
    user: user::Model,
    cookies: &mut Vec<String>,
) -> Result<ActiveSession, ApiError> {
    let session = store::create_session(&state.db, &user.id, false).await?;
    cookies.extend(hooks::session_cookies(
        state,
        &session.token,
        hooks::dont_remember(state, headers),
    ));
    Ok(ActiveSession { session, user })
}

pub async fn registration_options(
    State(state): State<AppState>,
    headers: HeaderMap,
    RawQuery(query): RawQuery,
) -> Response {
    let mut cookies = Vec::new();
    let outcome = async {
        let query = query.map(|q| Value::Object(form_object(q.as_bytes())));
        let query: Option<RegisterQuery> = validate(&REGISTER_QUERY, query.as_ref(), "query")?;
        let query = query.unwrap_or_default();
        let active = require_fresh_session(&state, &headers, &mut cookies).await?;
        let user = &active.user;
        let name = if user.email.is_empty() {
            user.id.clone()
        } else {
            user.email.clone()
        };
        let challenge = URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>());
        let mut selection = json!({"residentKey": "preferred", "userVerification": "preferred"});
        if let Some(attachment) = &query.authenticator_attachment {
            selection["authenticatorAttachment"] = json!(attachment);
        }
        selection["requireResidentKey"] = json!(false);
        let options = json!({
            "challenge": challenge,
            "rp": {"name": RP_NAME, "id": rp_id(&state.config.passkey_origin)},
            "user": {
                "id": URL_SAFE_NO_PAD.encode(random_string(32, LOWER_ALPHANUMERIC)),
                "name": query.name.filter(|n| !n.is_empty()).unwrap_or_else(|| name.clone()),
                "displayName": name,
            },
            "pubKeyCredParams": OFFERED_ALGORITHMS.map(|alg| json!({"alg": alg, "type": "public-key"})),
            "timeout": TIMEOUT_MS,
            "attestation": "none",
            "excludeCredentials": descriptors(&user_passkeys(&state, &user.id).await?),
            "authenticatorSelection": selection,
            "extensions": {"credProps": true},
            "hints": [],
        });
        let data = json!({
            "type": "registration",
            "expectedChallenge": challenge,
            "userData": {"id": user.id, "name": name, "displayName": name},
            "context": query.context,
        });
        let cookie = issue_challenge(&state, &data).await?;
        Ok(Reply::new(json(&options), vec![cookie]))
    }
    .await;
    hooks::with_cookies(outcome, cookies)
}

pub async fn authentication_options(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let mut cookies = Vec::new();
    let outcome = async {
        let lookup = session::lookup_without_step_up(&state, &headers).await?;
        cookies.extend(lookup.cookies);
        let challenge = URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>());
        let mut options =
            json!({"rpId": rp_id(&state.config.passkey_origin), "challenge": challenge});
        let passkeys = match &lookup.session {
            Some(active) => user_passkeys(&state, &active.user.id).await?,
            None => Vec::new(),
        };
        if !passkeys.is_empty() {
            options["allowCredentials"] = json!(descriptors(&passkeys));
        }
        options["timeout"] = json!(TIMEOUT_MS);
        options["userVerification"] = json!("preferred");
        let user_id = lookup
            .session
            .map(|active| active.user.id)
            .unwrap_or_default();
        let data = json!({
            "type": "authentication",
            "expectedChallenge": challenge,
            "userData": {"id": user_id},
        });
        let cookie = issue_challenge(&state, &data).await?;
        Ok(Reply::new(json(&options), vec![cookie]))
    }
    .await;
    hooks::with_cookies(outcome, cookies)
}

pub async fn verify_registration(
    State(state): State<AppState>,
    headers: HeaderMap,
    AuthBody(body): AuthBody,
) -> Response {
    let mut cookies = Vec::new();
    let outcome = async {
        let body: RegistrationBody = validate(&REGISTRATION, body.as_ref(), "body")?;
        let active = require_fresh_session(&state, &headers, &mut cookies).await?;
        let challenge = consume_challenge(&state, &headers, "registration").await?;
        if challenge.user_data.id != active.user.id {
            return Err(not_allowed());
        }
        let registered =
            verify_attestation(&state, &body.response, &challenge.expected_challenge).map_err(
                |error| {
                    tracing::error!(error, "Failed to verify registration");
                    registration_failed()
                },
            )?;
        let row = store::insert_passkey(&state.db, passkey::ActiveModel {
            id: Set(generate_id()),
            name: Set(body.name.filter(|name| !name.is_empty())),
            public_key: Set(registered.public_key),
            user_id: Set(active.user.id.clone()),
            credential_id: Set(registered.credential_id),
            counter: Set(i32::try_from(registered.counter).unwrap_or(i32::MAX)),
            device_type: Set(registered.device_type.into()),
            backed_up: Set(registered.backed_up),
            transports: Set(Some(registered.transports)),
            created_at: Set(Some(instant::now())),
            aaguid: Set(Some(registered.aaguid)),
        })
        .await
        .map_err(|error| {
            tracing::error!(error = %crate::telemetry::redact_pii(&error.to_string()), "Failed to store a passkey");
            registration_failed()
        })?;
        let created = passkey_dto(&row);
        if body.create_session != Some(true) {
            return Ok(Reply::new(json(&created), vec![step_up(&state, &active)]));
        }
        let mut set = Vec::new();
        let fresh = new_session(&state, &headers, active.user.clone(), &mut set).await?;
        set.push(step_up(&state, &fresh));
        let mut body = serde_json::to_value(&created).map_err(|_| ApiError::internal())?;
        let with_user = serde_json::to_value(session::session_dto(&fresh))
            .map_err(|_| ApiError::internal())?;
        if let (Some(body), Value::Object(extra)) = (body.as_object_mut(), with_user) {
            body.extend(extra);
        }
        Ok(Reply::new(json(&body), set))
    }
    .await;
    hooks::with_cookies(outcome, cookies)
}

struct Registered {
    credential_id: String,
    public_key: String,
    counter: u32,
    device_type: &'static str,
    backed_up: bool,
    aaguid: String,
    transports: String,
}

/// `verifyRegistrationResponse` without required user verification, plus the fields the passkey row keeps.
fn verify_attestation(
    state: &AppState,
    response: &Value,
    expected_challenge: &str,
) -> Result<Registered, String> {
    check_credential(response)?;
    let transports = match response["response"].get("transports") {
        None | Some(Value::Null) => String::new(),
        Some(Value::Array(items)) => items
            .iter()
            .map(|item| {
                item.as_str()
                    .map_or_else(|| item.to_string(), str::to_owned)
            })
            .collect::<Vec<_>>()
            .join(","),
        Some(_) => return Err("transports is not an array".into()),
    };
    let credential: RegisterPublicKeyCredential =
        serde_json::from_value(signed_part(response)).map_err(|e| e.to_string())?;
    let ceremony: RegistrationState = serde_json::from_value(json!({
        "policy": "preferred",
        "exclude_credentials": [],
        "challenge": expected_challenge,
        "credential_algorithms": VERIFIED_ALGORITHMS,
        "require_resident_key": false,
        "authenticator_attachment": null,
        "extensions": {},
        "allow_synchronised_authenticators": true,
    }))
    .map_err(|e| e.to_string())?;
    let verified = webauthn(state)?
        .register_credential(&credential, &ceremony, None)
        .map_err(|e| format!("{e:?}"))?;
    let (aaguid, public_key) = attested_key(credential.response.attestation_object.as_slice())?;
    Ok(Registered {
        credential_id: URL_SAFE_NO_PAD.encode(verified.cred_id.as_slice()),
        public_key: STANDARD.encode(public_key),
        counter: verified.counter,
        device_type: if verified.backup_eligible {
            "multiDevice"
        } else {
            "singleDevice"
        },
        backed_up: verified.backup_state,
        aaguid,
        transports,
    })
}

/// simplewebauthn's checks on the credential envelope before it verifies anything.
fn check_credential(response: &Value) -> Result<(), String> {
    let id = response
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
        .ok_or("Missing credential ID")?;
    if response.get("rawId").and_then(Value::as_str) != Some(id) {
        return Err("Credential ID was not base64url-encoded".into());
    }
    if response.get("type").and_then(Value::as_str) != Some("public-key") {
        return Err("Unexpected credential type".into());
    }
    Ok(())
}

/// The response without its unsigned parts (transports, client extension results), which simplewebauthn does not verify.
fn signed_part(response: &Value) -> Value {
    let mut response = response.clone();
    if let Some(object) = response.as_object_mut() {
        object.remove("clientExtensionResults");
        object.remove("extensions");
        if let Some(inner) = object.get_mut("response").and_then(Value::as_object_mut) {
            inner.remove("transports");
        }
    }
    response
}

/// The AAGUID and the CBOR COSE key from the attested credential data in `authData`.
fn attested_key(attestation_object: &[u8]) -> Result<(String, Vec<u8>), String> {
    use serde_cbor_2::Value as Cbor;
    let object: Cbor = serde_cbor_2::from_slice(attestation_object).map_err(|e| e.to_string())?;
    let Cbor::Map(object) = object else {
        return Err("attestation object is not a map".into());
    };
    let Some(Cbor::Bytes(auth_data)) = object.get(&Cbor::Text("authData".into())) else {
        return Err("attestation object has no authData".into());
    };
    // The RP ID hash (32 bytes), flags (1) and counter (4) come before the AAGUID and the credential id length.
    let aaguid = auth_data.get(37..53).ok_or("authData has no AAGUID")?;
    let id_length = auth_data
        .get(53..55)
        .and_then(|bytes| <[u8; 2]>::try_from(bytes).ok())
        .map(|bytes| usize::from(u16::from_be_bytes(bytes)))
        .ok_or("authData has no credential id")?;
    let key = auth_data
        .get(55 + id_length..)
        .ok_or("authData has no public key")?;
    let mut decoder = serde_cbor_2::Deserializer::from_slice(key);
    Cbor::deserialize(&mut decoder).map_err(|e| e.to_string())?;
    let key = key[..decoder.byte_offset()].to_vec();
    let aaguid = uuid::Uuid::from_slice(aaguid).map_err(|e| e.to_string())?;
    Ok((aaguid.hyphenated().to_string(), key))
}

pub async fn verify_authentication(
    State(state): State<AppState>,
    headers: HeaderMap,
    AuthBody(body): AuthBody,
) -> Response {
    let outcome = async {
        let body: AuthenticationBody = validate(&AUTHENTICATION, body.as_ref(), "body")?;
        let challenge = consume_challenge(&state, &headers, "authentication").await?;
        let credential_id = body.response.get("id").and_then(Value::as_str);
        let (row, owner) = match credential_id {
            Some(id) => store::passkey_by_credential(&state.db, id).await?,
            None => None,
        }
        .ok_or_else(|| passkey_not_found(StatusCode::UNAUTHORIZED))?;
        let counter = verify_assertion(&state, &body.response, &challenge.expected_challenge, &row)
            .map_err(|error| match error {
                Failure::Signature => authentication_failed(StatusCode::UNAUTHORIZED),
                Failure::Invalid(reason) => {
                    tracing::warn!(reason, "Passkey authentication failed");
                    authentication_failed(StatusCode::BAD_REQUEST)
                }
            })?;
        store::set_passkey_counter(&state.db, row, i32::try_from(counter).unwrap_or(i32::MAX))
            .await?;
        let owner = owner.ok_or_else(|| {
            ApiError::message(StatusCode::INTERNAL_SERVER_ERROR, "User not found")
        })?;
        let mut set = Vec::new();
        let fresh = new_session(&state, &headers, owner, &mut set).await?;
        set.push(step_up(&state, &fresh));
        Ok(Reply::new(json(&session::session_dto(&fresh)), set))
    }
    .await;
    hooks::with_cookies(outcome, Vec::new())
}

enum Failure {
    /// A well-formed signature that does not verify: simplewebauthn answers `verified: false`.
    Signature,
    /// Anything simplewebauthn throws on.
    Invalid(String),
}

/// `verifyAuthenticationResponse` against the stored COSE key; the new counter on success.
fn verify_assertion(
    state: &AppState,
    response: &Value,
    expected_challenge: &str,
    row: &passkey::Model,
) -> Result<u32, Failure> {
    let invalid = |e: String| Failure::Invalid(e);
    check_credential(response).map_err(invalid)?;
    let assertion: PublicKeyCredential =
        serde_json::from_value(signed_part(response)).map_err(|e| invalid(e.to_string()))?;
    let flags = assertion
        .response
        .authenticator_data
        .as_slice()
        .get(32)
        .copied()
        .ok_or_else(|| invalid("authenticatorData is too short".into()))?;
    let key = STANDARD
        .decode(&row.public_key)
        .map_err(|e| invalid(e.to_string()))?;
    let key: serde_cbor_2::Value =
        serde_cbor_2::from_slice(&key).map_err(|e| invalid(e.to_string()))?;
    let key = COSEKey::try_from(&key).map_err(|e| invalid(format!("{e:?}")))?;
    let credential_id = URL_SAFE_NO_PAD
        .decode(&row.credential_id)
        .map_err(|e| invalid(e.to_string()))?;
    let stored = Credential {
        cred_id: credential_id.into(),
        cred: key,
        counter: u32::try_from(row.counter).unwrap_or(0),
        transports: None,
        user_verified: false,
        // simplewebauthn keeps no backup eligibility, so the assertion's own flag is taken as registered.
        backup_eligible: flags & 0x08 != 0,
        backup_state: row.backed_up,
        registration_policy: UserVerificationPolicy::Preferred,
        extensions: RegisteredExtensions::none(),
        attestation: ParsedAttestation {
            data: ParsedAttestationData::None,
            metadata: AttestationMetadata::None,
        },
        attestation_format: AttestationFormat::None,
    };
    let ceremony: AuthenticationState = serde_json::from_value(json!({
        "credentials": [stored],
        "policy": "preferred",
        "challenge": expected_challenge,
        "appid": null,
        "allow_backup_eligible_upgrade": true,
    }))
    .map_err(|e| invalid(e.to_string()))?;
    let core = webauthn(state).map_err(invalid)?;
    match core.authenticate_credential(&assertion, &ceremony) {
        Ok(result) => Ok(result.counter()),
        Err(WebauthnError::AuthenticationFailure) => Err(Failure::Signature),
        Err(error) => Err(invalid(format!("{error:?}"))),
    }
}

pub async fn list(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let mut cookies = Vec::new();
    let outcome = async {
        let active = require_session(&state, &headers, &mut cookies).await?;
        let passkeys: Vec<Passkey> = user_passkeys(&state, &active.user.id)
            .await?
            .iter()
            .map(passkey_dto)
            .collect();
        Ok(json(&passkeys))
    }
    .await;
    hooks::with_cookies(outcome, cookies)
}

/// `requireResourceOwnership`: the row, 404 when it does not exist, `None` when another user owns it.
async fn owned(
    state: &AppState,
    active: &ActiveSession,
    id: &str,
) -> Result<Option<passkey::Model>, ApiError> {
    let row = store::passkey_by_id(&state.db, id)
        .await?
        .ok_or_else(|| passkey_not_found(StatusCode::NOT_FOUND))?;
    Ok((row.user_id == active.user.id).then_some(row))
}

pub async fn delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    AuthBody(body): AuthBody,
) -> Response {
    let mut cookies = Vec::new();
    let outcome = async {
        let body: IdBody = validate(&DELETE, body.as_ref(), "body")?;
        let active = require_session(&state, &headers, &mut cookies).await?;
        let Some(row) = owned(&state, &active, &body.id).await? else {
            return Ok(StatusCode::UNAUTHORIZED.into_response());
        };
        store::delete_passkey(&state.db, row).await?;
        Ok(json(&StatusFlag { status: true }))
    }
    .await;
    hooks::with_cookies(outcome, cookies)
}

pub async fn update(
    State(state): State<AppState>,
    headers: HeaderMap,
    AuthBody(body): AuthBody,
) -> Response {
    let mut cookies = Vec::new();
    let outcome = async {
        let body: UpdateBody = validate(&UPDATE, body.as_ref(), "body")?;
        let active = require_session(&state, &headers, &mut cookies).await?;
        let row = owned(&state, &active, &body.id)
            .await?
            .ok_or_else(not_allowed)?;
        let row = store::rename_passkey(&state.db, row, body.name).await?;
        Ok(json(&PasskeyUpdated {
            passkey: passkey_dto(&row),
        }))
    }
    .await;
    hooks::with_cookies(outcome, cookies)
}

/// Native passkey setup opens the web app with a one-time token; registering needs a session younger than a day.
pub async fn freshen_session(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let mut cookies = Vec::new();
    let outcome = async {
        let active = require_session(&state, &headers, &mut cookies).await?;
        let mut set = Vec::new();
        new_session(&state, &headers, active.user, &mut set)
            .await
            .map_err(|_| {
                ApiError::message(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Unable to prepare passkey setup.",
                )
            })?;
        Ok(Reply::new(json(&OkFlag { ok: true }), set))
    }
    .await;
    hooks::with_cookies(outcome, cookies)
}

/// Known gap kept for parity: any session can mark itself passkey-verified here.
pub async fn complete_step_up(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let mut cookies = Vec::new();
    let outcome = async {
        let active = require_session(&state, &headers, &mut cookies).await?;
        Ok(Reply::new(
            json(&OkFlag { ok: true }),
            vec![step_up(&state, &active)],
        ))
    }
    .await;
    hooks::with_cookies(outcome, cookies)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_rp_id_is_the_registrable_domain_of_the_passkey_origin() {
        for (origin, expected) in [
            ("https://solace.onl", "solace.onl"),
            ("https://app.solace.onl", "solace.onl"),
            ("http://localhost:4000", "localhost"),
            ("not a url", "localhost"),
        ] {
            assert_eq!(rp_id(origin), expected, "{origin}");
        }
    }

    #[test]
    fn the_cose_key_and_aaguid_come_from_the_attested_credential_data() {
        use serde_cbor_2::Value as Cbor;
        let key = serde_cbor_2::to_vec(&Cbor::Map(
            [
                (Cbor::Integer(1), Cbor::Integer(2)),
                (Cbor::Integer(3), Cbor::Integer(-7)),
            ]
            .into(),
        ))
        .unwrap();
        let mut auth_data = vec![0u8; 37];
        auth_data.extend((1..=16).collect::<Vec<u8>>());
        auth_data.extend(2u16.to_be_bytes());
        auth_data.extend([9, 9]);
        auth_data.extend(&key);
        auth_data.extend([0xa0]);
        let object = serde_cbor_2::to_vec(&Cbor::Map(
            [(Cbor::Text("authData".into()), Cbor::Bytes(auth_data))].into(),
        ))
        .unwrap();
        let (aaguid, cose) = attested_key(&object).unwrap();
        assert_eq!(aaguid, "01020304-0506-0708-090a-0b0c0d0e0f10");
        assert_eq!(cose, key, "trailing extension data is not part of the key");
    }

    #[test]
    fn credential_envelopes_are_checked_like_simplewebauthn() {
        assert!(check_credential(&json!({"id": "a", "rawId": "a", "type": "public-key"})).is_ok());
        assert!(check_credential(&json!({"id": "a", "rawId": "b", "type": "public-key"})).is_err());
        assert!(check_credential(&json!({"id": "", "rawId": "", "type": "public-key"})).is_err());
        assert!(check_credential(&json!({"id": "a", "rawId": "a", "type": "other"})).is_err());
    }
}
