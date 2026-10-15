//! `MailService`: the public config with Stalwart's limits, per-user mail tokens, mailbox status, provisioning and repair, the key directory, vault backups and mailbox deletion.

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, LazyLock, Mutex, PoisonError};
use std::time::{Duration, Instant};

use axum::http::StatusCode;
use regex_lite::Regex;
use sea_orm::{DbErr, SqlErr, TransactionTrait};
use solace_api_types::mail::{
    MailAccessToken, MailAccountId, MailAccountStatus, MailBootstrapRequest, MailConfig,
    MailDirectoryKey, MailOAuthConfig, MailServerLimits, MailSignup, MailVaultBackup,
    MailVaultBackupRequest, MailVaultKdfParams,
};

use super::bridge;
use super::queries::{self, Provisioned, Vault};
use crate::addresses;
use crate::auth::guard::RouteUser;
use crate::db::entities::{mail_directory_entry, mail_vault_backup};
use crate::error::AppError;
use crate::http::zod::js_trim;
use crate::instant;
use crate::integrations::stalwart::admin::{Admin, AdminError};
use crate::integrations::stalwart::limits;
use crate::state::AppState;
use crate::telemetry;

const MAIL_TOKEN_EXPIRY_SKEW_MS: i64 = 60_000;
const SERVER_LIMITS_TTL: Duration = Duration::from_secs(60);
const DEFAULT_TOKEN_LIFETIME_SECONDS: u64 = 3600;

static LOCAL_PART: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$")
        .unwrap_or_else(|error| panic!("local part pattern: {error}"))
});

/// Per-process mail state, bounded by the number of users and accounts.
#[derive(Default)]
pub struct MailCache {
    tokens: Mutex<HashMap<String, Arc<tokio::sync::Mutex<Option<CachedToken>>>>>,
    bridge_passwords: Mutex<HashSet<String>>,
    limits: tokio::sync::Mutex<Option<(Instant, Option<MailServerLimits>)>>,
}

#[derive(Clone)]
struct CachedToken {
    token: MailAccessToken,
    expires_at_ms: i64,
}

pub async fn config(state: &AppState) -> MailConfig {
    let backend = state.config.backend_url.trim_end_matches('/');
    MailConfig {
        default_domain: state.config.stalwart_default_domain.clone(),
        discovery_base_url: format!("{backend}/api/mail/jmap"),
        signup_enabled: true,
        oauth: MailOAuthConfig {
            mail_token_endpoint: format!("{backend}/api/mail/oauth/access-token"),
        },
        server_limits: server_limits(state).await,
    }
}

/// Cached for a minute after a read; a failed read is retried by the next request.
async fn server_limits(state: &AppState) -> Option<MailServerLimits> {
    let mut cache = state.mail_cache.limits.lock().await;
    if let Some((expires, limits)) = cache.as_ref()
        && *expires > Instant::now()
    {
        return limits.clone();
    }
    match limits::fetch(&Admin::new(state)).await {
        Ok(limits) => {
            let reported = serde_json::to_value(&limits)
                .ok()
                .and_then(|value| value.as_object().map(|o| o.values().any(|v| !v.is_null())))
                .unwrap_or_default();
            let limits = reported.then_some(limits);
            *cache = Some((Instant::now() + SERVER_LIMITS_TTL, limits.clone()));
            limits
        }
        Err(error) => {
            tracing::warn!(error = %telemetry::redact_pii(&error.to_string()), "Failed to load Stalwart mail server limits");
            *cache = None;
            None
        }
    }
}

/// `getAccessTokenForUser`: the cached bearer until a minute before it expires; concurrent callers for one user mint once.
pub async fn access_token_for_user(
    state: &AppState,
    user_id: &str,
    email: &str,
) -> Result<MailAccessToken, AppError> {
    let slot = state
        .mail_cache
        .tokens
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .entry(user_id.to_owned())
        .or_default()
        .clone();
    // Callers queued behind a failed mint try their own rather than sharing its error.
    let mut cached = slot.lock().await;
    let now = instant::unix_millis(instant::now());
    if let Some(entry) = cached
        .as_ref()
        .filter(|entry| now + MAIL_TOKEN_EXPIRY_SKEW_MS < entry.expires_at_ms)
    {
        return Ok(entry.token.clone());
    }
    let token = issue_access_token(state, user_id, email).await?;
    *cached = Some(CachedToken {
        token: token.clone(),
        expires_at_ms: i64::try_from(token.expires_at)
            .unwrap_or(i64::MAX / 1000)
            .saturating_mul(1000),
    });
    tracing::debug!(
        user_id,
        expires_at = token.expires_at,
        "Cached mail access token for user"
    );
    Ok(token)
}

/// Drops the cached bearer, so the next caller mints a new one.
pub fn invalidate_access_token(state: &AppState, user_id: &str) {
    state
        .mail_cache
        .tokens
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .remove(user_id);
}

/// `issueAccessTokenForUser`: logs in with the derived bridge secret, setting it as the account password only after a refused login.
async fn issue_access_token(
    state: &AppState,
    user_id: &str,
    email: &str,
) -> Result<MailAccessToken, AppError> {
    let email = normalize_email_or_throw(email)?;
    let mailbox = find_or_attach(state, user_id, &email)
        .await?
        .filter(|mailbox| !mailbox.stalwart_account_id.is_empty())
        .ok_or_else(|| {
            AppError::field(
                "This Solace account does not have a provisioned mailbox yet.",
                "email",
            )
        })?;
    let secret = bridge::secret(
        state.config.mail_bridge_hmac_key.as_deref(),
        user_id,
        &mailbox.email,
    )
    .map_err(AppError::internal)?;
    let redirect_uri = bridge::redirect_uri(&state.config);
    let admin = Admin::new(state);
    admin
        .ensure_oauth_client(
            bridge::CLIENT_ID,
            &redirect_uri,
            Some("Solace mail backend bridge"),
        )
        .await
        .map_err(upstream)?;
    // Resetting the password on every mint would revoke the bearers other processes still hold.
    let login = admin
        .issue_oauth_access_token(
            &mailbox.email,
            &secret,
            bridge::CLIENT_ID,
            &redirect_uri,
            bridge::pkce(),
        )
        .await;
    let token = match login {
        Ok(token) => token,
        Err(error) => {
            tracing::warn!(
                account_id = mailbox.stalwart_account_id,
                error = %telemetry::redact_pii(&error.to_string()),
                "Stalwart bridge login failed; configuring account password and retrying once"
            );
            ensure_bridge_password(state, &admin, &mailbox.stalwart_account_id, &secret).await?;
            admin
                .issue_oauth_access_token(
                    &mailbox.email,
                    &secret,
                    bridge::CLIENT_ID,
                    &redirect_uri,
                    bridge::pkce(),
                )
                .await
                .map_err(upstream)?
        }
    };
    let expires_in = token.expires_in.unwrap_or(DEFAULT_TOKEN_LIFETIME_SECONDS);
    let now = u64::try_from(instant::unix_millis(instant::now()) / 1000).unwrap_or_default();
    Ok(MailAccessToken {
        access_token: token.access_token,
        expires_in,
        expires_at: token.expires_at.unwrap_or(now + expires_in),
    })
}

async fn ensure_bridge_password(
    state: &AppState,
    admin: &Admin<'_>,
    account_id: &str,
    secret: &str,
) -> Result<(), AppError> {
    let passwords = || {
        state
            .mail_cache
            .bridge_passwords
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
    };
    if passwords().contains(account_id) {
        return Ok(());
    }
    admin
        .set_account_password(account_id, secret)
        .await
        .map_err(upstream)?;
    passwords().insert(account_id.to_owned());
    tracing::debug!(
        account_id,
        "Configured Stalwart bridge password for account"
    );
    Ok(())
}

fn upstream(error: AdminError) -> AppError {
    AppError::Upstream {
        status: StatusCode::SERVICE_UNAVAILABLE,
        message: error.to_string(),
    }
}

pub async fn status(state: &AppState, user: &RouteUser) -> Result<MailAccountStatus, AppError> {
    let email = normalize_email_or_throw(&user.email)?;
    let mailbox = find_or_attach(state, &user.id, &email).await?;
    Ok(MailAccountStatus {
        provisioned: mailbox.is_some(),
        display_name: mailbox
            .as_ref()
            .and_then(|mailbox| mailbox.display_name.clone())
            .or_else(|| optional_text(Some(&user.name))),
        email: mailbox.map_or(email, |mailbox| mailbox.email),
        mailbox_approved: queries::mailbox_approved(&state.db, &user.id).await?,
    })
}

/// The caller's entry by owner, else an unowned entry with their address, which is linked to them.
async fn find_or_attach(
    state: &AppState,
    user_id: &str,
    email: &str,
) -> Result<Option<mail_directory_entry::Model>, AppError> {
    if let Some(entry) = queries::entry_by_user(&state.db, user_id).await? {
        return Ok(Some(entry));
    }
    let Some(entry) = queries::entry_by_email(&state.db, email).await? else {
        return Ok(None);
    };
    match entry.user_id.as_deref() {
        Some(owner) if owner != user_id => Err(linked_elsewhere()),
        Some(_) => Ok(Some(entry)),
        None => Ok(Some(queries::attach(&state.db, &entry.id, user_id).await?)),
    }
}

fn linked_elsewhere() -> AppError {
    AppError::field(
        "That mailbox is already linked to another Solace account.",
        "email",
    )
}

/// `bootstrapForUser`: only for approved accounts, only with a vault the server cannot open; an entry without a vault is repaired.
pub async fn bootstrap(
    state: &AppState,
    user: &RouteUser,
    request: MailBootstrapRequest,
) -> Result<MailSignup, AppError> {
    if !queries::mailbox_approved(&state.db, &user.id).await? {
        return Err(AppError::Forbidden(
            "This account is not approved for a mailbox yet.".into(),
        ));
    }
    if optional_text(request.wrapped_secret.clone().flatten().as_deref()).is_none() {
        return Err(AppError::field(
            "A vault secret sealed to your account key is required.",
            "wrappedSecret",
        ));
    }
    let address = mailbox_address(&user.email)?;
    let existing = find_or_attach(state, &user.id, &address.email).await?;
    if let Some(mailbox) = &existing
        && queries::vault(&state.db, &mailbox.id).await?.is_some()
    {
        return Err(AppError::field(
            "A mailbox has already been provisioned for this account.",
            "email",
        ));
    }
    let provisioning = provisioning(request, Some(&user.name))?;
    match existing {
        Some(mailbox) => repair(state, &user.id, &mailbox, &address, provisioning).await,
        None => create(state, &user.id, &address, provisioning).await,
    }
}

struct Address {
    email: String,
    local_part: String,
    domain: String,
}

fn mailbox_address(value: &str) -> Result<Address, AppError> {
    let email = normalize_email_or_throw(value)?;
    let (local_part, domain) = email.rsplit_once('@').unwrap_or_default();
    if !LOCAL_PART.is_match(local_part) {
        return Err(AppError::field(
            "Mailbox local parts may only contain lowercase letters, numbers, dots, underscores, and hyphens.",
            "email",
        ));
    }
    Ok(Address {
        local_part: local_part.to_owned(),
        domain: domain.to_owned(),
        email,
    })
}

struct Provisioning {
    display_name: Option<String>,
    public_key_armored: String,
    fingerprint: String,
    algorithm: String,
    created_at: time::PrimitiveDateTime,
    vault: Vault,
}

fn provisioning(
    request: MailBootstrapRequest,
    display_name: Option<&str>,
) -> Result<Provisioning, AppError> {
    let public_key_armored = js_trim(&request.public_key_armored).to_owned();
    let algorithm = js_trim(&request.algorithm).to_lowercase();
    let encrypted_vault_b64 = js_trim(&request.encrypted_vault_b64).to_owned();
    if public_key_armored.is_empty() {
        return Err(AppError::field(
            "A public key is required.",
            "publicKeyArmored",
        ));
    }
    if algorithm != "openpgp" {
        return Err(AppError::field(
            "Only OpenPGP mailbox keys are supported by this demo.",
            "algorithm",
        ));
    }
    let created_at = instant::parse_js_date(&request.created_at)
        .and_then(instant::from_unix_millis)
        .ok_or_else(|| {
            AppError::field("Key creation time must be a valid ISO date.", "createdAt")
        })?;
    if encrypted_vault_b64.is_empty() {
        return Err(AppError::field(
            "An encrypted vault backup is required.",
            "encryptedVaultB64",
        ));
    }
    Ok(Provisioning {
        display_name: optional_text(display_name),
        fingerprint: normalize_fingerprint(&request.fingerprint),
        vault: stored_vault(
            request.vault_version,
            encrypted_vault_b64,
            &request.kdf,
            &request.kdf_params,
            optional_text(request.wrapped_secret.flatten().as_deref()),
            optional_text(request.wrap_algorithm.flatten().as_deref()),
        )?,
        public_key_armored,
        algorithm,
        created_at,
    })
}

/// `assertVaultParams` beyond the schema's numeric bounds, and the stored form of the vault.
fn stored_vault(
    vault_version: u32,
    encrypted_vault_b64: String,
    kdf: &str,
    params: &MailVaultKdfParams,
    wrapped_secret: Option<String>,
    wrap_algorithm: Option<String>,
) -> Result<Vault, AppError> {
    let kdf = js_trim(kdf).to_lowercase();
    if kdf != "argon2id" {
        return Err(AppError::field(
            "Mail vault backups must use Argon2id.",
            "kdf",
        ));
    }
    let salt = js_trim(&params.salt_b64);
    if salt.is_empty() {
        return Err(AppError::field(
            "Vault salt is required.",
            "kdfParams.saltB64",
        ));
    }
    let int = |value: u32| i32::try_from(value).unwrap_or(i32::MAX);
    Ok(Vault {
        vault_version: int(vault_version),
        encrypted_vault_b64,
        kdf,
        kdf_salt_b64: salt.to_owned(),
        kdf_memory_kib: int(params.memory_kib),
        kdf_iterations: int(params.iterations),
        kdf_parallelism: int(params.parallelism),
        wrapped_secret,
        wrap_algorithm,
    })
}

/// The key's own fingerprint, which must match the one the client claims.
fn verified_fingerprint(provisioning: &Provisioning) -> Result<String, AppError> {
    let derived = fingerprint(&provisioning.public_key_armored).ok_or_else(|| {
        AppError::field(
            "The submitted public key could not be parsed as OpenPGP.",
            "publicKeyArmored",
        )
    })?;
    if derived != provisioning.fingerprint {
        return Err(AppError::field(
            "The submitted public-key fingerprint does not match the uploaded key.",
            "fingerprint",
        ));
    }
    Ok(derived)
}

/// `getOpenPgpPublicKeyFingerprint`: openpgp.js `readKey` reads public and private key blocks alike.
fn fingerprint(armored: &str) -> Option<String> {
    use pgp::composed::Any;
    use pgp::types::KeyDetails;
    let fingerprint = match Any::from_string(armored).ok()?.0 {
        Any::PublicKey(key) => key.fingerprint(),
        Any::SecretKey(key) => key.fingerprint(),
        _ => return None,
    };
    Some(hex::encode_upper(fingerprint.as_bytes()))
}

fn normalize_fingerprint(value: &str) -> String {
    value
        .chars()
        .filter(|c| !crate::http::zod::is_js_whitespace(*c))
        .collect::<String>()
        .to_uppercase()
}

/// The Stalwart half of provisioning as it progresses: the account (created unless known), its key, and the verified fingerprint.
struct Stalwart {
    domain_id: String,
    account_id: String,
    account_created: bool,
    public_key_id: String,
    fingerprint: String,
}

impl Stalwart {
    fn new(account_id: &str, fingerprint: String) -> Self {
        Self {
            domain_id: String::new(),
            account_id: account_id.to_owned(),
            account_created: false,
            public_key_id: String::new(),
            fingerprint,
        }
    }

    /// Resolves the domain, creates the account when there is none, registers the key and turns on encryption at rest.
    async fn provision(
        &mut self,
        admin: &Admin<'_>,
        address: &Address,
        provisioning: &Provisioning,
    ) -> Result<(), AdminError> {
        self.domain_id = admin.resolve_domain_by_name(&address.domain).await?;
        if self.account_id.is_empty() {
            let account = admin
                .create_account(
                    &address.local_part,
                    &credential_secret(),
                    &self.domain_id,
                    provisioning.display_name.as_deref(),
                )
                .await?;
            self.account_id = account.account_id;
            self.account_created = account.created;
        }
        let description = format!(
            "{} primary OpenPGP key",
            provisioning
                .display_name
                .as_deref()
                .unwrap_or(&address.email)
        );
        self.public_key_id = admin
            .register_public_key(
                &self.account_id,
                &address.email,
                &provisioning.public_key_armored,
                Some(&description),
            )
            .await?;
        admin
            .enable_encryption_at_rest(&self.account_id, &self.public_key_id)
            .await
    }

    fn signup(&self, address: &Address, provisioning: &Provisioning) -> MailSignup {
        MailSignup {
            email: address.email.clone(),
            display_name: provisioning.display_name.clone(),
            stalwart_account_id: MailAccountId(self.account_id.clone()),
            stalwart_public_key_id: self.public_key_id.clone(),
            fingerprint: self.fingerprint.clone(),
            encryption_at_rest_enabled: true,
        }
    }

    fn provisioned<'a>(&'a self, address: &'a Address, p: &'a Provisioning) -> Provisioned<'a> {
        Provisioned {
            stalwart_account_id: &self.account_id,
            email: &address.email,
            local_part: &address.local_part,
            domain: &address.domain,
            display_name: p.display_name.clone(),
            stalwart_domain_id: &self.domain_id,
            stalwart_public_key_id: &self.public_key_id,
            public_key_armored: &p.public_key_armored,
            fingerprint: &self.fingerprint,
            key_algorithm: &p.algorithm,
            key_created_at: p.created_at,
            vault: p.vault.clone(),
        }
    }
}

/// A random password nobody uses: mailbox logins use the bridge secret.
fn credential_secret() -> String {
    format!("{}{}", uuid::Uuid::new_v4(), uuid::Uuid::new_v4())
}

async fn create(
    state: &AppState,
    user_id: &str,
    address: &Address,
    provisioning: Provisioning,
) -> Result<MailSignup, AppError> {
    if addresses::is_reserved_system_email(&address.email, Some(&address.domain)) {
        return Err(AppError::field(
            "That mailbox address is reserved.",
            "email",
        ));
    }
    if queries::entry_by_email(&state.db, &address.email)
        .await?
        .is_some()
    {
        return Err(AppError::field("That mailbox already exists.", "email"));
    }
    let admin = Admin::new(state);
    let mut remote = Stalwart::new("", verified_fingerprint(&provisioning)?);
    if let Err(error) = remote.provision(&admin, address, &provisioning).await {
        tracing::error!(
            recipient_ref = telemetry::log_ref(&address.email),
            user_id,
            stalwart_account_id = remote.account_id,
            stalwart_account_created = remote.account_created,
            error = %telemetry::redact_pii(&error.to_string()),
            "Mailbox Stalwart provisioning failed"
        );
        delete_orphan(state, &admin, &remote).await?;
        return Err(provisioning_error(&error));
    }
    if remote.domain_id.is_empty()
        || remote.account_id.is_empty()
        || remote.public_key_id.is_empty()
    {
        return Err(AppError::Upstream {
            status: StatusCode::SERVICE_UNAVAILABLE,
            message: "Mailbox provisioning did not complete successfully.".into(),
        });
    }
    if let Err(error) = persist_new(state, user_id, address, &provisioning, &remote).await {
        delete_orphan(state, &admin, &remote).await?;
        tracing::error!(
            recipient_ref = telemetry::log_ref(&address.email),
            user_id,
            stalwart_account_id = remote.account_id,
            "Failed to persist provisioned mailbox state"
        );
        return Err(persistence_error(error));
    }
    Ok(remote.signup(address, &provisioning))
}

/// The entry Stalwart's account id already has is reconciled; otherwise a new entry, or the one a concurrent bootstrap just wrote.
async fn persist_new(
    state: &AppState,
    user_id: &str,
    address: &Address,
    provisioning: &Provisioning,
    remote: &Stalwart,
) -> Result<(), Persist> {
    let transaction = state.db.begin().await?;
    if let Some(existing) = queries::entry_by_account(&transaction, &remote.account_id).await? {
        reconcile(
            &transaction,
            user_id,
            address,
            provisioning,
            remote,
            &existing,
        )
        .await?;
        return Ok(transaction.commit().await?);
    }
    let savepoint = transaction.begin().await?;
    let inserted = queries::insert_entry(
        &savepoint,
        user_id,
        remote.provisioned(address, provisioning),
    )
    .await;
    match inserted {
        Ok(()) => savepoint.commit().await?,
        Err(error) if unique_on(&error) == Some(Unique::StalwartAccountId) => {
            savepoint.rollback().await?;
            let Some(concurrent) =
                queries::entry_by_account(&transaction, &remote.account_id).await?
            else {
                return Err(error.into());
            };
            tracing::warn!(
                user_id,
                stalwart_account_id = remote.account_id,
                directory_entry_id = concurrent.id,
                "Detected concurrent mail directory entry creation during mailbox provisioning"
            );
            reconcile(
                &transaction,
                user_id,
                address,
                provisioning,
                remote,
                &concurrent,
            )
            .await?;
        }
        Err(error) => return Err(error.into()),
    }
    Ok(transaction.commit().await?)
}

/// `reconcileProvisionedMailboxRecord`: rewrites the entry Stalwart's account id points at, resetting sync state when it held another address.
async fn reconcile<C: sea_orm::ConnectionTrait>(
    db: &C,
    user_id: &str,
    address: &Address,
    provisioning: &Provisioning,
    remote: &Stalwart,
    existing: &mail_directory_entry::Model,
) -> Result<(), Persist> {
    if existing
        .user_id
        .as_deref()
        .is_some_and(|owner| owner != user_id)
    {
        tracing::warn!(
            user_id,
            existing_user_id = existing.user_id,
            stalwart_account_id = remote.account_id,
            directory_entry_id = existing.id,
            "Provisioned Stalwart account is already linked to another Solace account"
        );
        return Err(Persist::App(linked_elsewhere()));
    }
    if existing.email != address.email {
        tracing::warn!(
            user_id,
            stalwart_account_id = remote.account_id,
            directory_entry_id = existing.id,
            reset_mail_sync_state = true,
            "Repairing stale mail directory entry for a provisioned Stalwart account"
        );
        queries::delete_sync_states(db, &existing.id).await?;
    } else {
        tracing::warn!(
            user_id,
            stalwart_account_id = remote.account_id,
            directory_entry_id = existing.id,
            "Reusing existing mail directory entry for provisioned Stalwart account"
        );
    }
    let link_user = existing.user_id.is_none().then_some(user_id);
    queries::update_entry(
        db,
        &existing.id,
        link_user,
        remote.provisioned(address, provisioning),
    )
    .await?;
    Ok(())
}

/// `repairMailboxForUser`: an entry without a vault gets the new key, reusing its Stalwart account.
async fn repair(
    state: &AppState,
    user_id: &str,
    mailbox: &mail_directory_entry::Model,
    address: &Address,
    provisioning: Provisioning,
) -> Result<MailSignup, AppError> {
    let admin = Admin::new(state);
    let mut remote = Stalwart::new(
        &mailbox.stalwart_account_id,
        verified_fingerprint(&provisioning)?,
    );
    if let Err(error) = remote.provision(&admin, address, &provisioning).await {
        tracing::error!(
            recipient_ref = telemetry::log_ref(&address.email),
            user_id,
            directory_entry_id = mailbox.id,
            stalwart_account_id = remote.account_id,
            stalwart_account_created = remote.account_created,
            error = %telemetry::redact_pii(&error.to_string()),
            "Mailbox Stalwart repair failed"
        );
        delete_orphan(state, &admin, &remote).await?;
        return Err(provisioning_error(&error));
    }
    let persisted = async {
        let transaction = state.db.begin().await?;
        reconcile(
            &transaction,
            user_id,
            address,
            &provisioning,
            &remote,
            mailbox,
        )
        .await?;
        Ok::<_, Persist>(transaction.commit().await?)
    }
    .await;
    if let Err(error) = persisted {
        delete_orphan(state, &admin, &remote).await?;
        tracing::error!(
            recipient_ref = telemetry::log_ref(&address.email),
            user_id,
            directory_entry_id = mailbox.id,
            stalwart_account_id = remote.account_id,
            "Failed to persist repaired mailbox state"
        );
        return Err(persistence_error(error));
    }
    Ok(remote.signup(address, &provisioning))
}

/// Removes an account this provisioning created, unless the directory already points at it.
async fn delete_orphan(
    state: &AppState,
    admin: &Admin<'_>,
    remote: &Stalwart,
) -> Result<(), AppError> {
    if remote.account_id.is_empty() || !remote.account_created {
        return Ok(());
    }
    if queries::entry_by_account(&state.db, &remote.account_id)
        .await?
        .is_some()
    {
        return Ok(());
    }
    match admin.delete_account(&remote.account_id).await {
        Ok(()) => tracing::warn!(
            stalwart_account_id = remote.account_id,
            "Deleted orphaned Stalwart account after failed mailbox provisioning"
        ),
        Err(error) => tracing::error!(
            stalwart_account_id = remote.account_id,
            error = %telemetry::redact_pii(&error.to_string()),
            "Failed to delete orphaned Stalwart account after failed mailbox provisioning"
        ),
    }
    Ok(())
}

/// `normalizeMailProvisioningError`, which classifies Stalwart's failures by their message.
fn provisioning_error(error: &AdminError) -> AppError {
    static CONFLICT: LazyLock<Regex> =
        LazyLock::new(|| pattern(r"already exists|already in use|duplicate"));
    static NO_DOMAIN: LazyLock<Regex> =
        LazyLock::new(|| pattern(r"domain .*not found|domain .*was not found"));
    static SHOWN: LazyLock<Regex> = LazyLock::new(|| {
        pattern(
            r"account creation failed|public-key registration failed|admin session|admin jmap request failed|encryption",
        )
    });
    let unavailable = |message: String| AppError::Upstream {
        status: StatusCode::SERVICE_UNAVAILABLE,
        message,
    };
    let message = error.to_string().trim().to_owned();
    if message.is_empty() {
        return unavailable("Mailbox provisioning failed for an unknown reason.".into());
    }
    if CONFLICT.is_match(&message) {
        return AppError::Conflict("That mailbox already exists on the mail server.".into());
    }
    if NO_DOMAIN.is_match(&message) {
        return unavailable("The configured mail domain was not found on the mail server.".into());
    }
    if SHOWN.is_match(&message) {
        return unavailable(message);
    }
    unavailable(format!("Mailbox provisioning failed: {message}"))
}

fn pattern(source: &str) -> Regex {
    Regex::new(&format!("(?i){source}")).unwrap_or_else(|error| panic!("{source}: {error}"))
}

/// A persistence failure: a database error to classify, or a rule the reconciliation enforced.
enum Persist {
    Db(DbErr),
    App(AppError),
}

impl From<DbErr> for Persist {
    fn from(error: DbErr) -> Self {
        Self::Db(error)
    }
}

#[derive(PartialEq, Eq)]
enum Unique {
    Email,
    UserId,
    StalwartAccountId,
}

/// Which of the entry's unique columns a violation hit, by Prisma's constraint names.
fn unique_on(error: &DbErr) -> Option<Unique> {
    let Some(SqlErr::UniqueConstraintViolation(message)) = error.sql_err() else {
        return None;
    };
    [
        (
            "mail_directory_entry_stalwart_account_id_key",
            Unique::StalwartAccountId,
        ),
        ("mail_directory_entry_user_id_key", Unique::UserId),
        ("mail_directory_entry_email_key", Unique::Email),
    ]
    .into_iter()
    .find_map(|(constraint, unique)| message.contains(constraint).then_some(unique))
}

/// `normalizeMailPersistenceError`; other database failures do not echo the database's message.
fn persistence_error(error: Persist) -> AppError {
    let error = match error {
        Persist::App(error) => return error,
        Persist::Db(error) => error,
    };
    match unique_on(&error) {
        Some(Unique::Email) => AppError::Conflict("That mailbox already exists.".into()),
        Some(Unique::UserId) => AppError::field(
            "A mailbox has already been provisioned for this account.",
            "email",
        ),
        Some(Unique::StalwartAccountId) => {
            AppError::Conflict("That mailbox is already linked to an existing mail account.".into())
        }
        None => {
            tracing::error!(error = %telemetry::redact_pii(&error.to_string()), "Mailbox directory persistence failed");
            AppError::Upstream {
                status: StatusCode::INTERNAL_SERVER_ERROR,
                message: "Mailbox directory persistence failed.".into(),
            }
        }
    }
}

/// `getDirectoryKey`: the entry for the address, else the entry of the user signed in with it, else (for signed-in callers) Stalwart's key.
pub async fn directory_key(
    state: &AppState,
    email: &str,
    allow_remote: bool,
) -> Result<MailDirectoryKey, AppError> {
    let email = addresses::normalize(email);
    if let Some(entry) = queries::entry_by_email(&state.db, &email).await? {
        return Ok(directory_record(entry));
    }
    if let Some(user_id) = queries::user_id_by_email(&state.db, &email).await?
        && let Some(entry) = queries::entry_by_user(&state.db, &user_id).await?
    {
        return Ok(directory_record(entry));
    }
    if allow_remote && let Some(key) = remote_directory_key(state, &email).await? {
        return Ok(key);
    }
    Err(AppError::NotFound(
        "No internal public key was found for that email.".into(),
    ))
}

fn directory_record(entry: mail_directory_entry::Model) -> MailDirectoryKey {
    MailDirectoryKey {
        email: entry.email,
        public_key_armored: entry.public_key_armored,
        fingerprint: entry.public_key_fingerprint,
        source: entry.source,
        trust: entry.trust,
    }
}

/// Only addresses on the Solace domain; a Stalwart failure reads as no key.
async fn remote_directory_key(
    state: &AppState,
    email: &str,
) -> Result<Option<MailDirectoryKey>, AppError> {
    let configured = state.config.stalwart_default_domain.trim().to_lowercase();
    match email.rsplit_once('@') {
        Some((local, domain)) if !local.is_empty() && domain == configured => {}
        _ => return Ok(None),
    }
    let remote = match Admin::new(state).resolve_mailbox_public_key(email).await {
        Ok(Some(remote)) => remote,
        Ok(None) => return Ok(None),
        Err(error) => {
            tracing::warn!(
                recipient_ref = telemetry::log_ref(email),
                error = %telemetry::redact_pii(&error.to_string()),
                "Failed to resolve mailbox public key from Stalwart"
            );
            return Ok(None);
        }
    };
    tracing::info!(
        recipient_ref = telemetry::log_ref(email),
        stalwart_account_id = remote.stalwart_account_id,
        "Resolved mailbox public key from Stalwart after missing directory entry"
    );
    Ok(Some(MailDirectoryKey {
        email: email.to_owned(),
        fingerprint: fingerprint(&remote.public_key_armored)
            .ok_or_else(|| AppError::internal("Stalwart holds a public key that is not OpenPGP"))?,
        public_key_armored: remote.public_key_armored,
        source: "internal".into(),
        trust: "verified".into(),
    }))
}

pub async fn vault_backup(state: &AppState, user: &RouteUser) -> Result<MailVaultBackup, AppError> {
    let missing =
        || AppError::NotFound("No encrypted vault backup was found for this mailbox.".into());
    let email = normalize_email_or_throw(&user.email)?;
    let mailbox = find_or_attach(state, &user.id, &email)
        .await?
        .ok_or_else(missing)?;
    let vault = queries::vault(&state.db, &mailbox.id)
        .await?
        .ok_or_else(missing)?;
    Ok(vault_record(mailbox.email, vault))
}

/// Replaces the vault; an omitted or null seal keeps the stored one, so a write never makes a vault server-openable again.
pub async fn put_vault_backup(
    state: &AppState,
    user: &RouteUser,
    request: MailVaultBackupRequest,
) -> Result<MailVaultBackup, AppError> {
    let missing =
        || AppError::NotFound("No encrypted vault backup was stored for that mailbox.".into());
    let email = normalize_email_or_throw(&user.email)?;
    let mailbox = find_or_attach(state, &user.id, &email)
        .await?
        .ok_or_else(missing)?;
    let encrypted_vault_b64 = js_trim(&request.encrypted_vault_b64).to_owned();
    if encrypted_vault_b64.is_empty() {
        return Err(AppError::field(
            "An encrypted vault backup is required.",
            "encryptedVaultB64",
        ));
    }
    let vault = stored_vault(
        request.vault_version,
        encrypted_vault_b64,
        &request.kdf,
        &request.kdf_params,
        request.wrapped_secret.flatten(),
        request.wrap_algorithm.flatten(),
    )?;
    let stored = queries::upsert_vault(&state.db, &mailbox.id, vault, true).await?;
    Ok(vault_record(mailbox.email, stored))
}

fn vault_record(email: String, vault: mail_vault_backup::Model) -> MailVaultBackup {
    let count = |value: i32| u32::try_from(value).unwrap_or_default();
    MailVaultBackup {
        email,
        vault_version: count(vault.vault_version),
        encrypted_vault_b64: vault.encrypted_vault_b64,
        kdf: vault.kdf,
        kdf_params: MailVaultKdfParams {
            salt_b64: vault.kdf_salt_b64,
            memory_kib: count(vault.kdf_memory_kib),
            iterations: count(vault.kdf_iterations),
            parallelism: count(vault.kdf_parallelism),
        },
        wrapped_secret: vault.wrapped_secret,
        wrap_algorithm: vault.wrap_algorithm,
    }
}

/// `deleteMailboxForUser`: the linked Stalwart account, then any account still holding the mailbox name, then the entry.
pub async fn delete_mailbox_for_user(state: &AppState, user_id: &str) -> Result<(), AppError> {
    let Some(mailbox) = queries::entry_by_user(&state.db, user_id).await? else {
        return Ok(());
    };
    let admin = Admin::new(state);
    let purged = async {
        let linked = mailbox.stalwart_account_id.trim();
        if !linked.is_empty() {
            admin.delete_account(linked).await?;
        }
        if let Some(remote) = admin
            .resolve_account_id_by_mailbox(&mailbox.local_part, &mailbox.stalwart_domain_id)
            .await?
            && !remote.trim().is_empty()
            && remote.trim() != linked
        {
            admin.delete_account(&remote).await?;
        }
        Ok::<_, AdminError>(())
    }
    .await;
    if let Err(error) = purged {
        tracing::error!(
            recipient_ref = telemetry::log_ref(&mailbox.email),
            stalwart_account_id = mailbox.stalwart_account_id,
            error = %telemetry::redact_pii(&error.to_string()),
            "Failed to delete linked Stalwart account during Solace account deletion"
        );
        return Err(AppError::Upstream {
            status: StatusCode::SERVICE_UNAVAILABLE,
            message: "Could not delete the linked Stalwart mailbox. Try again in a moment.".into(),
        });
    }
    queries::delete_entry(&state.db, &mailbox.id).await?;
    tracing::info!(
        user_id,
        recipient_ref = telemetry::log_ref(&mailbox.email),
        stalwart_account_id = mailbox.stalwart_account_id,
        "Deleted linked mailbox for Solace account"
    );
    Ok(())
}

/// `normalizeEmailOrThrow`: trimmed, lowercased, and a valid address by Zod's rule.
fn normalize_email_or_throw(value: &str) -> Result<String, AppError> {
    let email = addresses::normalize(value);
    if !addresses::is_zod_email(&email) {
        return Err(AppError::field(
            "A valid email address is required.",
            "email",
        ));
    }
    Ok(email)
}

fn optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(js_trim)
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
}

#[cfg(test)]
pub mod tests {
    use sea_orm::{ConnectionTrait, Database};
    use serde_json::json;

    use super::*;
    use crate::config::Config;
    use crate::db::scratch::ScratchDatabase;
    use crate::integrations::stalwart::fake::{FakeStalwart, Recorded, Reply};

    pub const OWNER: &str = "mail-test-owner";
    const KEY: &str = include_str!("../../../solace-api-tests/fixtures/pgp/test1.asc");
    const FINGERPRINT: &str = "CDCE225F09515A0156BBECB7D0018F17DFF405AC";

    /// A server on a scratch database whose Stalwart is `fake`, with an approved owner `alice@solace.test`.
    pub async fn mail_state(database: &ScratchDatabase, fake: &FakeStalwart) -> AppState {
        let config = Config::from_lookup(|name| match name {
            "DATABASE_URL" => Some(database.url.clone()),
            "BETTER_AUTH_SECRET" => Some("solace-test-auth-secret-0123456789abcdef".into()),
            "STALWART_BASE_URL" => Some(fake.base_url.clone()),
            "STALWART_DEFAULT_DOMAIN" => Some("solace.test".into()),
            "STALWART_PROVISION_TOKEN" => Some("token-1".into()),
            "MAIL_BRIDGE_HMAC_KEY" => Some("ZmVkY2JhOTg3NjU0MzIxMGZlZGNiYTk4NzY1NDMyMTA=".into()),
            _ => None,
        })
        .unwrap();
        let state = AppState::new(config, database.db.clone()).unwrap();
        insert_user(&state, OWNER, "alice@solace.test").await;
        state
    }

    async fn exec(state: &AppState, sql: &str) {
        state.db.execute_unprepared(sql).await.unwrap();
    }

    async fn insert_user(state: &AppState, id: &str, email: &str) {
        exec(
            state,
            &format!(
                "INSERT INTO \"user\" (id, name, email, email_verified, mailbox_approved_at, created_at, updated_at) \
                 VALUES ('{id}', 'Alice Example', '{email}', true, now(), now(), now())"
            ),
        )
        .await;
    }

    /// The owner's provisioned mailbox, linked to Stalwart account `account_id`.
    pub async fn seed_mailbox(state: &AppState, account_id: &str) {
        seed_entry(
            state,
            "entry-1",
            "alice@solace.test",
            account_id,
            Some(OWNER),
        )
        .await;
    }

    async fn seed_entry(
        state: &AppState,
        id: &str,
        email: &str,
        account_id: &str,
        user_id: Option<&str>,
    ) {
        let (local_part, _) = email.split_once('@').unwrap();
        let user_id = user_id.map_or("NULL".to_owned(), |id| format!("'{id}'"));
        exec(
            state,
            &format!(
                "INSERT INTO mail_directory_entry (id, email, local_part, domain, stalwart_account_id, stalwart_domain_id, \
                 public_key_armored, public_key_fingerprint, created_at, updated_at, user_id) \
                 VALUES ('{id}', '{email}', '{local_part}', 'solace.test', '{account_id}', 'domain-1', 'old-key', 'OLD', now(), now(), {user_id})"
            ),
        )
        .await;
    }

    async fn seed_sync_state(state: &AppState, entry_id: &str, account_id: &str) {
        exec(
            state,
            &format!(
                "INSERT INTO mail_jmap_sync_state (id, directory_entry_id, stalwart_account_id, email_state, mailbox_state, created_at, updated_at) \
                 VALUES ('sync-1', '{entry_id}', '{account_id}', 'e', 'm', now(), now())"
            ),
        )
        .await;
    }

    async fn count(state: &AppState, table: &str) -> i64 {
        state
            .db
            .query_one_raw(sea_orm::Statement::from_string(
                state.db.get_database_backend(),
                format!("SELECT count(*) AS n FROM {table}"),
            ))
            .await
            .unwrap()
            .unwrap()
            .try_get("", "n")
            .unwrap()
    }

    /// A valid cached bearer for the owner.
    pub fn cache_token(state: &AppState, access_token: &str) {
        let expires_at = u64::try_from(instant::unix_millis(instant::now()) / 1000).unwrap() + 3600;
        let token = MailAccessToken {
            access_token: access_token.into(),
            expires_in: 3600,
            expires_at,
        };
        state.mail_cache.tokens.lock().unwrap().insert(
            OWNER.into(),
            Arc::new(tokio::sync::Mutex::new(Some(CachedToken {
                expires_at_ms: i64::try_from(expires_at).unwrap() * 1000,
                token,
            }))),
        );
    }

    fn owner(email: &str) -> RouteUser {
        RouteUser {
            id: OWNER.into(),
            session_id: "mail-test-session".into(),
            email: email.into(),
            name: "Alice Example".into(),
        }
    }

    fn request() -> MailBootstrapRequest {
        MailBootstrapRequest {
            public_key_armored: KEY.into(),
            fingerprint: FINGERPRINT.into(),
            algorithm: "openpgp".into(),
            created_at: "2026-05-06T21:00:00.000Z".into(),
            vault_version: 1,
            encrypted_vault_b64: "vault-b64".into(),
            kdf: "argon2id".into(),
            kdf_params: MailVaultKdfParams {
                salt_b64: "salt-b64".into(),
                memory_kib: 65_536,
                iterations: 3,
                parallelism: 4,
            },
            wrapped_secret: Some(Some("wrapped:sealed-secret".into())),
            wrap_algorithm: Some(Some("e2ee-account-key-v1".into())),
        }
    }

    /// How the fake provisions: `adopt` finds the account by name, `refuse` rejects its creation.
    #[derive(Clone, Copy, Default)]
    pub struct Plan {
        local_part: &'static str,
        adopt: bool,
        refuse: Option<&'static str>,
        refuse_destroy: bool,
    }

    /// Stalwart's registry for provisioning: domain `domain-1`, account `acct-1`, key `pk-1`, and the bridge login.
    pub fn provisioning(plan: Plan) -> impl Fn(&Recorded) -> Reply {
        move |request| {
            match request.path.as_str() {
                "/api/auth" => {
                    return Reply::json(json!({"type": "authenticated", "clientCode": "code-1"}));
                }
                "/auth/token" => {
                    return Reply::json(
                        json!({"access_token": "stalwart-access-token", "expires_in": 1800, "expires_at": 1_779_149_999u64}),
                    );
                }
                _ => {}
            }
            let body = request.json();
            let call = &body["methodCalls"][0];
            let arguments = &call[1];
            let answer = match call[0].as_str().unwrap_or_default() {
                "x:Domain/query" => json!({"ids": ["domain-1"]}),
                "x:Domain/get" => json!({"list": [{"id": "domain-1", "name": "solace.test"}]}),
                "x:Account/query" if plan.adopt => json!({"ids": ["acct-1"]}),
                "x:Account/query" => json!({"ids": []}),
                "x:Account/get" => {
                    json!({"list": [{"id": "acct-1", "name": plan.local_part, "domainId": "domain-1"}]})
                }
                "x:Account/set" if arguments.get("create").is_some() => match plan.refuse {
                    Some(description) => {
                        json!({"notCreated": {"user1": {"type": "invalidProperties", "description": description}}})
                    }
                    None => json!({"created": {"user1": {"id": "acct-1"}}}),
                },
                "x:Account/set" if arguments.get("destroy").is_some() && plan.refuse_destroy => {
                    json!({"notDestroyed": {"acct-1": {"type": "forbidden"}}})
                }
                "x:Account/set" if arguments.get("destroy").is_some() => {
                    json!({"destroyed": ["acct-1"]})
                }
                "x:Account/set" => json!({"updated": {"acct-1": null}}),
                "x:PublicKey/set" => json!({"created": {"pk1": {"id": "pk-1"}}}),
                "x:AccountSettings/set" => json!({"updated": {"singleton": null}}),
                "x:OAuthClient/query" => json!({"ids": []}),
                "x:OAuthClient/set" => json!({"created": {"client1": {"id": "client-1"}}}),
                _ => return Reply::status(500),
            };
            Reply::json(json!({"methodResponses": [[call[0], answer, call[2]]]}))
        }
    }

    fn destroyed(fake: &FakeStalwart) -> bool {
        fake.requests()
            .iter()
            .any(|r| r.json()["methodCalls"][0][1].get("destroy").is_some())
    }

    fn limits_reply() -> Reply {
        Reply::json(json!({"methodResponses": [
            ["x:Email/get", {"list": [{"maxAttachmentSize": 100_000_000, "maxMessageSize": 150_000_000}]}, "e1"],
            ["x:Jmap/get", {"list": [{"maxUploadSize": 100_000_000}]}, "j1"],
        ]}))
    }

    fn database_free_state(fake: &FakeStalwart) -> AppState {
        let config = Config::from_lookup(|name| match name {
            "DATABASE_URL" => Some("postgres://unused".into()),
            "BACKEND_URL" => Some("https://api.solace.test/".into()),
            "STALWART_BASE_URL" => Some(fake.base_url.clone()),
            "STALWART_DEFAULT_DOMAIN" => Some("solace.test".into()),
            _ => None,
        })
        .unwrap();
        AppState::new(config, sea_orm::DatabaseConnection::default()).unwrap()
    }

    #[tokio::test]
    async fn caches_server_limits() {
        let fake = FakeStalwart::scripted(vec![limits_reply()]).await;
        let state = database_free_state(&fake);
        let first = config(&state).await;
        assert_eq!(
            serde_json::to_value(&first).unwrap(),
            json!({
                "defaultDomain": "solace.test",
                "discoveryBaseUrl": "https://api.solace.test/api/mail/jmap",
                "signupEnabled": true,
                "oauth": {"mailTokenEndpoint": "https://api.solace.test/api/mail/oauth/access-token"},
                "serverLimits": {"maxBlobUploadBytes": 100_000_000, "maxAttachmentSizeBytes": 100_000_000, "maxMessageSizeBytes": 150_000_000},
            })
        );
        assert_eq!(config(&state).await, first);
        assert_eq!(fake.requests().len(), 1);
    }

    #[tokio::test]
    async fn does_not_cache_failed_limits() {
        let fake = FakeStalwart::scripted(vec![Reply::status(503), limits_reply()]).await;
        let state = database_free_state(&fake);
        assert_eq!(config(&state).await.server_limits, None);
        assert_eq!(
            config(&state)
                .await
                .server_limits
                .and_then(|limits| limits.max_message_size_bytes),
            Some(150_000_000)
        );
        assert_eq!(fake.requests().len(), 2);
    }

    #[tokio::test]
    async fn does_not_reset_the_bridge_password_on_later_mints() {
        let database = ScratchDatabase::create().await;
        let fake = FakeStalwart::start(provisioning(Plan::default())).await;
        let state = mail_state(&database, &fake).await;
        seed_mailbox(&state, "acct-1").await;
        let first = issue_access_token(&state, OWNER, "Alice@Solace.test")
            .await
            .unwrap();
        issue_access_token(&state, OWNER, "alice@solace.test")
            .await
            .unwrap();
        assert_eq!(
            (
                first.access_token.as_str(),
                first.expires_in,
                first.expires_at
            ),
            ("stalwart-access-token", 1800, 1_779_149_999)
        );
        let requests = fake.requests();
        assert!(
            !requests.iter().any(|r| r.first_method() == "x:Account/set"),
            "a successful login never resets the account password"
        );
        let logins: Vec<_> = requests.iter().filter(|r| r.path == "/api/auth").collect();
        assert_eq!(logins.len(), 2);
        let secret = bridge::secret(
            state.config.mail_bridge_hmac_key.as_deref(),
            OWNER,
            "alice@solace.test",
        )
        .unwrap();
        assert_eq!(logins[0].json()["accountName"], json!("alice@solace.test"));
        assert_eq!(logins[0].json()["accountSecret"], json!(secret));
        assert_ne!(
            logins[0].json()["codeChallenge"],
            logins[1].json()["codeChallenge"],
            "every mint uses a fresh PKCE pair"
        );
        assert_eq!(
            requests
                .iter()
                .find(|r| r.first_method() == "x:OAuthClient/set")
                .map(|r| r.json()["methodCalls"][0][1]["create"]["client1"].clone()),
            Some(
                json!({"clientId": "solace-mail-bridge", "redirectUris": ["http://localhost:4001/api/mail/oauth/stalwart/callback"], "description": "Solace mail backend bridge"})
            )
        );
    }

    #[tokio::test]
    async fn reissues_a_token_after_invalidation() {
        let database = ScratchDatabase::create().await;
        let fake = FakeStalwart::start(provisioning(Plan::default())).await;
        let state = mail_state(&database, &fake).await;
        seed_mailbox(&state, "acct-1").await;
        let mints = |fake: &FakeStalwart| {
            fake.requests()
                .iter()
                .filter(|r| r.path == "/auth/token")
                .count()
        };
        // Stalwart dates this token in the past, so it is never reused.
        access_token_for_user(&state, OWNER, "alice@solace.test")
            .await
            .unwrap();
        access_token_for_user(&state, OWNER, "alice@solace.test")
            .await
            .unwrap();
        assert_eq!(mints(&fake), 2);
        cache_token(&state, "cached-token");
        let cached = access_token_for_user(&state, OWNER, "alice@solace.test")
            .await
            .unwrap();
        assert_eq!(cached.access_token, "cached-token");
        assert_eq!(mints(&fake), 2);
        invalidate_access_token(&state, OWNER);
        let fresh = access_token_for_user(&state, OWNER, "alice@solace.test")
            .await
            .unwrap();
        assert_eq!(fresh.access_token, "stalwart-access-token");
        assert_eq!(mints(&fake), 3);
    }

    /// Runs `sql` on another connection and waits for it, from inside a fake Stalwart answer.
    fn execute_elsewhere(url: &str, sql: &str) {
        let (url, sql) = (url.to_owned(), sql.to_owned());
        std::thread::spawn(move || {
            tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .unwrap()
                .block_on(async {
                    let db = Database::connect(&url).await.unwrap();
                    db.execute_unprepared(&sql).await.unwrap();
                    db.close().await.unwrap();
                });
        })
        .join()
        .unwrap();
    }

    #[tokio::test]
    async fn reuses_the_entry_of_an_existing_stalwart_account() {
        let database = ScratchDatabase::create().await;
        let url = database.url.clone();
        let answer = provisioning(Plan {
            local_part: "alice",
            ..Plan::default()
        });
        // A concurrent bootstrap writes the entry while Stalwart is still provisioning.
        let fake = FakeStalwart::start(move |request| {
            if request.first_method() == "x:AccountSettings/set" {
                execute_elsewhere(
                    &url,
                    "INSERT INTO mail_directory_entry (id, email, local_part, domain, stalwart_account_id, stalwart_domain_id, \
                     public_key_armored, public_key_fingerprint, created_at, updated_at) \
                     VALUES ('entry-1', 'alice@solace.test', 'alice', 'solace.test', 'acct-1', 'domain-1', 'old-key', 'OLD', now(), now())",
                );
            }
            answer(request)
        })
        .await;
        let state = mail_state(&database, &fake).await;
        let signup = bootstrap(&state, &owner("alice@solace.test"), request())
            .await
            .unwrap();
        assert_eq!(
            signup,
            MailSignup {
                email: "alice@solace.test".into(),
                display_name: Some("Alice Example".into()),
                stalwart_account_id: MailAccountId("acct-1".into()),
                stalwart_public_key_id: "pk-1".into(),
                fingerprint: FINGERPRINT.into(),
                encryption_at_rest_enabled: true,
            }
        );
        let entry = queries::entry_by_account(&state.db, "acct-1")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(entry.id, "entry-1", "the existing entry is reused");
        assert_eq!(entry.user_id.as_deref(), Some(OWNER));
        assert_eq!(entry.public_key_fingerprint, FINGERPRINT);
        assert_eq!(entry.stalwart_public_key_id.as_deref(), Some("pk-1"));
        let vault = queries::vault(&state.db, "entry-1").await.unwrap().unwrap();
        assert_eq!(
            vault.wrapped_secret.as_deref(),
            Some("wrapped:sealed-secret")
        );
        assert_eq!(count(&state, "mail_directory_entry").await, 1);
        assert!(!destroyed(&fake));
    }

    #[tokio::test]
    async fn repairs_a_stale_entry_for_a_reused_account_id() {
        let database = ScratchDatabase::create().await;
        let fake = FakeStalwart::start(provisioning(Plan {
            local_part: "testprod12",
            ..Plan::default()
        }))
        .await;
        let state = mail_state(&database, &fake).await;
        seed_entry(&state, "entry-stale", "1531536@solace.test", "acct-1", None).await;
        seed_sync_state(&state, "entry-stale", "acct-1").await;
        let signup = bootstrap(&state, &owner("testprod12@solace.test"), request())
            .await
            .unwrap();
        assert_eq!(signup.email, "testprod12@solace.test");
        assert_eq!(signup.stalwart_account_id.0, "acct-1");
        let entry = queries::entry_by_user(&state.db, OWNER)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            (
                entry.id.as_str(),
                entry.email.as_str(),
                entry.local_part.as_str()
            ),
            ("entry-stale", "testprod12@solace.test", "testprod12")
        );
        assert_eq!(
            count(&state, "mail_jmap_sync_state").await,
            0,
            "the stale sync state is reset"
        );
        assert_eq!(count(&state, "mail_directory_entry").await, 1);
    }

    #[tokio::test]
    async fn repair_stores_the_account_it_creates_for_an_entry_without_one() {
        let database = ScratchDatabase::create().await;
        let fake = FakeStalwart::start(provisioning(Plan {
            local_part: "alice",
            ..Plan::default()
        }))
        .await;
        let state = mail_state(&database, &fake).await;
        seed_mailbox(&state, "").await;
        let signup = bootstrap(&state, &owner("alice@solace.test"), request())
            .await
            .unwrap();
        assert_eq!(signup.stalwart_account_id.0, "acct-1");
        let entry = queries::entry_by_user(&state.db, OWNER)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            (entry.id.as_str(), entry.stalwart_account_id.as_str()),
            ("entry-1", "acct-1")
        );
        assert!(!destroyed(&fake), "the stored account is kept");
    }

    #[tokio::test]
    async fn refuses_stale_entry_repair_for_another_users_mailbox() {
        let database = ScratchDatabase::create().await;
        let fake = FakeStalwart::start(provisioning(Plan {
            local_part: "testprod12",
            ..Plan::default()
        }))
        .await;
        let state = mail_state(&database, &fake).await;
        insert_user(&state, "user-old", "old@solace.test").await;
        seed_entry(
            &state,
            "entry-stale",
            "1531536@solace.test",
            "acct-1",
            Some("user-old"),
        )
        .await;
        seed_sync_state(&state, "entry-stale", "acct-1").await;
        let error = bootstrap(&state, &owner("testprod12@solace.test"), request())
            .await
            .unwrap_err();
        assert!(
            matches!(&error, AppError::Validation { message, .. } if message == "That mailbox is already linked to another Solace account."),
            "{error:?}"
        );
        assert_eq!(count(&state, "mail_jmap_sync_state").await, 1);
        let entry = queries::entry_by_account(&state.db, "acct-1")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(entry.email, "1531536@solace.test");
        assert!(
            !destroyed(&fake),
            "an account in the directory is never deleted"
        );
    }

    #[tokio::test]
    async fn stale_mailbox_conflicts_are_not_a_500() {
        let database = ScratchDatabase::create().await;
        let fake = FakeStalwart::start(provisioning(Plan {
            local_part: "alice",
            refuse: Some("account already exists"),
            ..Plan::default()
        }))
        .await;
        let state = mail_state(&database, &fake).await;
        let error = bootstrap(&state, &owner("alice@solace.test"), request())
            .await
            .unwrap_err();
        assert!(
            matches!(&error, AppError::Conflict(message) if message == "That mailbox already exists on the mail server."),
            "{error:?}"
        );
        assert_eq!(count(&state, "mail_directory_entry").await, 0);
    }

    #[tokio::test]
    async fn deletes_orphaned_accounts_when_persistence_fails() {
        let database = ScratchDatabase::create().await;
        let fake = FakeStalwart::start(provisioning(Plan {
            local_part: "alice",
            ..Plan::default()
        }))
        .await;
        let state = mail_state(&database, &fake).await;
        exec(&state, "DROP TABLE mail_vault_backup").await;
        let error = bootstrap(&state, &owner("alice@solace.test"), request())
            .await
            .unwrap_err();
        assert!(
            error
                .to_string()
                .contains("Mailbox directory persistence failed"),
            "{error}"
        );
        assert_eq!(
            count(&state, "mail_directory_entry").await,
            0,
            "the transaction rolled back"
        );
        assert!(
            destroyed(&fake),
            "the account this bootstrap created is deleted"
        );
    }

    #[tokio::test]
    async fn keeps_adopted_accounts_when_persistence_fails() {
        let database = ScratchDatabase::create().await;
        let fake = FakeStalwart::start(provisioning(Plan {
            local_part: "alice",
            adopt: true,
            ..Plan::default()
        }))
        .await;
        let state = mail_state(&database, &fake).await;
        exec(&state, "DROP TABLE mail_vault_backup").await;
        let error = bootstrap(&state, &owner("alice@solace.test"), request())
            .await
            .unwrap_err();
        assert!(
            error
                .to_string()
                .contains("Mailbox directory persistence failed"),
            "{error}"
        );
        assert!(!destroyed(&fake), "an adopted account is kept");
    }

    #[tokio::test]
    async fn deletion_fails_when_stalwart_removal_fails() {
        let database = ScratchDatabase::create().await;
        let fake = FakeStalwart::start(provisioning(Plan {
            local_part: "alice",
            refuse_destroy: true,
            ..Plan::default()
        }))
        .await;
        let state = mail_state(&database, &fake).await;
        seed_mailbox(&state, "acct-1").await;
        let error = delete_mailbox_for_user(&state, OWNER).await.unwrap_err();
        assert!(
            matches!(&error, AppError::Upstream { status, message } if *status == StatusCode::SERVICE_UNAVAILABLE
                && message == "Could not delete the linked Stalwart mailbox. Try again in a moment."),
            "{error:?}"
        );
        assert_eq!(
            count(&state, "mail_directory_entry").await,
            1,
            "the entry stays for a retry"
        );
        delete_mailbox_for_user(&state, "someone-without-a-mailbox")
            .await
            .unwrap();
    }
}
