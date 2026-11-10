//! Mailbox lifecycle uses the provisioner; account-scoped keys and settings use the owner bearer through the backend gate.

use reqwest::{Client, RequestBuilder};
use serde_json::{Map, Value, json};
use thiserror::Error;

use super::gate::StalwartGate;
use crate::state::AppState;

/// The registry capabilities; mail capabilities are never requested with the provisioning token.
const USING: [&str; 2] = ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"];

#[derive(Debug, Error)]
pub enum AdminError {
    #[error("Stalwart request failed.")]
    Http(#[from] reqwest::Error),
    #[error("Stalwart returned a response that is not JSON.")]
    NotJson,
    #[error("Stalwart admin JMAP request failed with status {0}.")]
    Status(u16),
    #[error("Stalwart rejected mailbox authentication.")]
    LoginRejected,
    #[error("Stalwart refused owner authorization.")]
    OwnerAuthRefused,
    #[error("Stalwart mailbox metadata differs from the committed policy.")]
    PolicyDrift,
    #[error("Stalwart committed public key has expired.")]
    ExpiredKey,
    #[error("Stalwart JMAP response did not include {0}.")]
    MissingMethod(String),
    #[error("{0}")]
    Failed(String),
}

pub struct CreatedAccount {
    pub account_id: String,
    /// False when retrying a verified owner-marked, receiving-denied stage.
    pub created: bool,
}

pub struct OAuthToken {
    pub access_token: String,
    pub expires_in: Option<u64>,
    pub expires_at: Option<u64>,
}

pub struct MailboxKey {
    pub public_key_armored: String,
    pub stalwart_account_id: String,
}

/// `parseStalwartJmapEnvelope`: only the known fields, and an empty envelope when any of them has the wrong shape.
pub fn parse_envelope(value: Value) -> Value {
    let Value::Object(mut object) = value else {
        return json!({});
    };
    let mut envelope = Map::new();
    for key in [
        "methodResponses",
        "primaryAccounts",
        "accounts",
        "eventSourceUrl",
        "uploadUrl",
    ] {
        let Some(field) = object.remove(key) else {
            continue;
        };
        let valid = match key {
            "methodResponses" => field
                .as_array()
                .is_some_and(|responses| responses.iter().all(is_method_response)),
            "primaryAccounts" => field
                .as_object()
                .is_some_and(|accounts| accounts.values().all(Value::is_string)),
            "accounts" => field.is_object(),
            _ => field.is_string(),
        };
        if !valid {
            return json!({});
        }
        envelope.insert(key.to_owned(), field);
    }
    Value::Object(envelope)
}

fn is_method_response(response: &Value) -> bool {
    response.as_array().is_some_and(|parts| {
        parts.len() == 3 && parts[0].is_string() && parts[1].is_object() && parts[2].is_string()
    })
}

pub fn method_result<'a>(envelope: &'a Value, method: &str) -> Result<&'a Value, AdminError> {
    super::method_response(envelope, method)
        .ok_or_else(|| AdminError::MissingMethod(method.to_owned()))
}

pub struct Admin<'a> {
    http: &'a Client,
    gate: &'a StalwartGate,
    base_url: &'a str,
    token: &'a str,
}

impl<'a> Admin<'a> {
    pub fn new(state: &'a AppState) -> Self {
        Self {
            http: &state.http,
            gate: &state.stalwart_gate,
            base_url: state.config.stalwart_base_url.trim_end_matches('/'),
            token: state.config.stalwart_provision_token.trim(),
        }
    }

    pub fn with_owner_token<'b>(&'b self, token: &'b str) -> Admin<'b> {
        Admin {
            http: self.http,
            gate: self.gate,
            base_url: self.base_url,
            token,
        }
    }

    #[cfg(test)]
    pub fn for_tests(fake: &'a super::fake::FakeStalwart) -> Self {
        Self {
            http: &fake.http,
            gate: &fake.gate,
            base_url: &fake.base_url,
            token: "token-1",
        }
    }

    fn post(&self, path: &str) -> RequestBuilder {
        let url = format!("{}{path}", self.base_url);
        self.gate.apply(self.http.post(&url), &url)
    }

    /// One registry request; the answer is the parsed envelope.
    pub async fn call_jmap(&self, method_calls: Value) -> Result<Value, AdminError> {
        let (status, body) = super::send_in(
            &super::PROVISIONER_LANE,
            self.post("/jmap/")
                .bearer_auth(self.token)
                .json(&json!({"using": USING, "methodCalls": method_calls})),
        )
        .await?;
        if !status.is_success() {
            return Err(AdminError::Status(status.as_u16()));
        }
        Ok(parse_envelope(read_json(&body)?))
    }

    /// One method call and its result's arguments.
    async fn call(
        &self,
        method: &str,
        arguments: Value,
        call_id: &str,
    ) -> Result<Value, AdminError> {
        let envelope = self
            .call_jmap(json!([[method, arguments, call_id]]))
            .await?;
        method_result(&envelope, method).cloned()
    }

    async fn ids(&self, method: &str, arguments: Value) -> Result<Vec<Value>, AdminError> {
        Ok(self
            .call(method, arguments, "c1")
            .await?
            .get("ids")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default())
    }

    async fn list(&self, method: &str, ids: Vec<Value>) -> Result<Vec<Value>, AdminError> {
        Ok(list_of(
            &self.call(method, json!({"ids": ids}), "c1").await?,
        ))
    }

    /// The id of the domain with this name.
    pub async fn resolve_domain_by_name(&self, name: &str) -> Result<String, AdminError> {
        let wanted = name.trim().to_lowercase();
        let ids = self.ids("x:Domain/query", json!({})).await?;
        self.list("x:Domain/get", ids)
            .await?
            .iter()
            .find(|domain| {
                str_field(domain, "name").is_some_and(|n| n.trim().to_lowercase() == wanted)
            })
            .and_then(|domain| str_field(domain, "id"))
            .map(str::to_owned)
            .ok_or_else(|| AdminError::Failed(format!("Stalwart domain '{name}' was not found.")))
    }

    pub async fn create_account(
        &self,
        local_part: &str,
        secret: &str,
        domain_id: &str,
        description: Option<&str>,
    ) -> Result<CreatedAccount, AdminError> {
        let requested = local_part.trim().to_lowercase();
        if let Some(existing) = self.find_account_by_mailbox(&requested, domain_id).await? {
            ensure_managed_staging(&existing, description)?;
            let id = str_field(&existing, "id").unwrap_or_default().to_owned();
            tracing::info!(
                existing_account_id = id,
                "Reusing existing Stalwart account for mailbox provisioning"
            );
            self.update_password(&id, existing.get("credentials"), secret)
                .await?;
            return Ok(CreatedAccount {
                account_id: id,
                created: false,
            });
        }
        let result = self
            .call(
                "x:Account/set",
                json!({"create": {"user1": {
                    "@type": "User",
                    "aliases": {},
                    "credentials": {"0":{"@type":"Password","secret":secret,"expiresAt":null,"allowedIps":{}}},
                    "encryptionAtRest": {"@type": "Disabled"},
                    "memberGroupIds": {},
                    "name": local_part,
                    "domainId": domain_id,
                    "permissions": {"@type": "Merge", "enabledPermissions": {}, "disabledPermissions": {"emailReceive": true}},
                    "quotas": {},
                    "roles": {"@type": "User"},
                    "description": description,
                }}}),
                "c1",
            )
            .await?;
        let created_id = result.pointer("/created/user1/id").and_then(Value::as_str);
        let refused = result.pointer("/notCreated/user1");
        tracing::info!(
            created_account_id = created_id,
            error_type = refused.and_then(|e| str_field(e, "type")),
            "Stalwart createAccount response"
        );
        let account_id = created_id
            .map(str::to_owned)
            .or_else(|| recovered_account_id(refused))
            .filter(|id| !id.is_empty())
            .ok_or_else(|| {
                AdminError::Failed(format!(
                    "Stalwart account creation failed: {}",
                    description_of(refused).unwrap_or("Unknown error")
                ))
            })?;
        let verified = self.account(&account_id).await?;
        let verified_name = str_field(&verified, "name").unwrap_or_default();
        let verified_domain = str_field(&verified, "domainId").unwrap_or_default();
        if verified_name.trim().to_lowercase() != requested {
            tracing::error!(
                returned_account_id = account_id,
                "Stalwart createAccount resolved to a different mailbox name"
            );
            return Err(AdminError::Failed(format!(
                "Stalwart returned a mismatched mailbox after account creation. Requested local part '{requested}' but resolved '{verified_name}'."
            )));
        }
        if verified_domain != domain_id {
            tracing::error!(
                returned_account_id = account_id,
                "Stalwart createAccount resolved to a different domain id"
            );
            return Err(AdminError::Failed(format!(
                "Stalwart returned a mismatched domain id after account creation. Requested '{domain_id}' but resolved '{verified_domain}'."
            )));
        }
        ensure_managed_staging(&verified, description)?;
        self.update_password(&account_id, verified.get("credentials"), secret)
            .await?;
        Ok(CreatedAccount {
            account_id,
            created: created_id.is_some_and(|id| !id.is_empty()),
        })
    }

    async fn find_account_by_mailbox(
        &self,
        local_part: &str,
        domain_id: &str,
    ) -> Result<Option<Value>, AdminError> {
        let local_part = local_part.trim().to_lowercase();
        let ids = self
            .ids(
                "x:Account/query",
                json!({"filter": {"name": local_part, "domainId": domain_id}}),
            )
            .await?;
        let Some(id) = ids
            .first()
            .and_then(Value::as_str)
            .filter(|id| !id.is_empty())
        else {
            return Ok(None);
        };
        let account = self.account(id).await?;
        let matches = str_field(&account, "name").map(|name| name.trim().to_lowercase())
            == Some(local_part)
            && str_field(&account, "domainId") == Some(domain_id);
        Ok(matches.then_some(account))
    }

    async fn account_if_exists(&self, account_id: &str) -> Result<Option<Value>, AdminError> {
        Ok(self
            .list("x:Account/get", vec![json!(account_id)])
            .await?
            .into_iter()
            .next())
    }

    async fn account(&self, account_id: &str) -> Result<Value, AdminError> {
        self.account_if_exists(account_id).await?.ok_or_else(|| {
            AdminError::Failed(format!(
                "Stalwart account lookup failed after account creation for id '{account_id}'."
            ))
        })
    }

    pub async fn set_account_password(
        &self,
        account_id: &str,
        secret: &str,
    ) -> Result<(), AdminError> {
        let account = self.account(account_id).await?;
        self.update_password(account_id, account.get("credentials"), secret)
            .await
    }

    pub async fn resolve_account_id_by_mailbox(
        &self,
        local_part: &str,
        domain_id: &str,
    ) -> Result<Option<String>, AdminError> {
        Ok(self
            .find_account_by_mailbox(local_part, domain_id)
            .await?
            .and_then(|account| str_field(&account, "id").map(str::to_owned)))
    }

    pub async fn mailbox_public_key(
        &self,
        account_id: &str,
        email: &str,
    ) -> Result<Option<MailboxKey>, AdminError> {
        let keys = self.public_keys(account_id).await?;
        let Some(key) = keys
            .iter()
            .find(|key| key_matches_email(key, email))
            .or_else(|| if keys.len() == 1 { keys.first() } else { None })
        else {
            return Ok(None);
        };
        let armored = str_field(key, "key").map(str::trim).unwrap_or_default();
        if str_field(key, "id").is_none_or(str::is_empty) || armored.is_empty() {
            return Ok(None);
        }
        let Some(fingerprint) = public_key_fingerprint(armored) else {
            return Ok(None);
        };
        validate_public_key(key, &fingerprint)?;
        Ok(Some(MailboxKey {
            public_key_armored: armored.to_owned(),
            stalwart_account_id: account_id.to_owned(),
        }))
    }

    pub async fn delete_account(&self, account_id: &str) -> Result<(), AdminError> {
        let account_id = account_id.trim();
        if account_id.is_empty() {
            return Err(AdminError::Failed(
                "Stalwart account deletion requires a non-empty account id.".into(),
            ));
        }
        let result = self
            .call("x:Account/set", json!({"destroy": [account_id]}), "c1")
            .await?;
        if let Some(refused) = result
            .get("notDestroyed")
            .and_then(|refused| refused.get(account_id))
            .filter(|error| truthy(error))
        {
            if str_field(refused, "type") == Some("notFound") {
                return Ok(());
            }
            return Err(AdminError::Failed(
                description_of(Some(refused))
                    .unwrap_or("Stalwart account deletion failed.")
                    .to_owned(),
            ));
        }
        if result
            .get("destroyed")
            .and_then(Value::as_array)
            .is_some_and(|ids| ids.iter().any(|id| id.as_str() == Some(account_id)))
        {
            tracing::info!(account_id, "Deleted Stalwart account");
            return Ok(());
        }
        if self.account_if_exists(account_id).await?.is_none() {
            tracing::info!(
                account_id,
                "Stalwart account already absent before deletion"
            );
            return Ok(());
        }
        Err(AdminError::Failed(
            "Stalwart account deletion was not acknowledged.".into(),
        ))
    }

    /// Replaces the password credential in place, keeping its other fields and every other credential.
    async fn update_password(
        &self,
        account_id: &str,
        credentials: Option<&Value>,
        secret: &str,
    ) -> Result<(), AdminError> {
        let existing = credentials
            .and_then(Value::as_object)
            .and_then(|credentials| {
                credentials
                    .iter()
                    .find(|(_, credential)| str_field(credential, "@type") == Some("Password"))
            });
        let key = existing.map_or("0", |(key, _)| key.as_str());
        let mut credential = existing
            .and_then(|(_, credential)| credential.as_object())
            .cloned()
            .unwrap_or_default();
        credential.remove("credentialId");
        credential.remove("createdAt");
        let allowed_ips = credential
            .get("allowedIps")
            .filter(|ips| ips.is_object() || ips.is_array())
            .cloned()
            .unwrap_or_else(|| json!({}));
        credential.insert("@type".into(), json!("Password"));
        credential.insert("secret".into(), json!(secret));
        credential.insert("expiresAt".into(), Value::Null);
        credential.insert("allowedIps".into(), allowed_ips);
        let result = self
            .call(
                "x:Account/set",
                json!({"update": {account_id: {format!("credentials/{key}"): credential}}}),
                "c1",
            )
            .await?;
        acknowledged(
            &result,
            account_id,
            "Stalwart account password update failed.",
            "Stalwart account password update was not acknowledged.",
        )
    }

    /// Adds this backend's callback to the plan-registered bridge client; creating it here would make it third-party.
    pub async fn ensure_oauth_redirect(
        &self,
        client_id: &str,
        redirect_uri: &str,
    ) -> Result<(), AdminError> {
        let ids = self.ids("x:OAuthClient/query", json!({})).await?;
        let clients = if ids.is_empty() {
            Vec::new()
        } else {
            self.list("x:OAuthClient/get", ids).await?
        };
        let client = clients
            .iter()
            .find(|client| str_field(client, "clientId") == Some(client_id))
            .ok_or_else(|| {
                AdminError::Failed("Stalwart has no OAuth client for the mail bridge.".into())
            })?;
        for scope in ["mail", "settings"] {
            if client.pointer(&format!("/scopes/{scope}")) != Some(&Value::Bool(true)) {
                return Err(AdminError::Failed(
                    "Stalwart mail bridge must allow mail and settings scopes.".into(),
                ));
            }
        }
        let id = str_field(client, "id")
            .filter(|id| !id.is_empty())
            .ok_or_else(|| AdminError::Failed("Stalwart OAuth client has no id.".into()))?;
        if client
            .pointer("/redirectUris")
            .and_then(|uris| uris.get(redirect_uri))
            == Some(&json!(true))
        {
            return Ok(());
        }
        let path = redirect_uri.replace('~', "~0").replace('/', "~1");
        let calls = json!([["x:OAuthClient/set", {"update": {id: {format!("redirectUris/{path}"): true}}}, "c1"]]);
        let mut attempt = 0;
        // The patch is idempotent; Stalwart can reject concurrent writes to this shared client.
        let result = loop {
            let envelope = self.call_jmap(calls.clone()).await?;
            if super::method_response(&envelope, "error")
                .is_some_and(|error| error["type"] == "serverUnavailable")
                && attempt < super::LIMIT_RETRIES
            {
                tokio::time::sleep(super::backoff(attempt)).await;
                attempt += 1;
                continue;
            }
            break method_result(&envelope, "x:OAuthClient/set")?.clone();
        };
        acknowledged(
            &result,
            id,
            "Stalwart OAuth client update failed.",
            "Stalwart OAuth client update was not acknowledged.",
        )
    }

    /// Logs in as the mailbox (authorization code with PKCE) and exchanges the code for its bearer.
    pub async fn issue_oauth_access_token(
        &self,
        account_name: &str,
        account_secret: &str,
        client_id: &str,
        redirect_uri: &str,
        pkce: crate::mail::bridge::Pkce,
    ) -> Result<OAuthToken, AdminError> {
        let state = uuid::Uuid::new_v4().to_string();
        let response = self
            .post("/api/auth")
            .json(&super::oauth::login_request(
                account_name,
                account_secret,
                client_id,
                redirect_uri,
                &pkce,
                &state,
            ))
            .send()
            .await?;
        let status = response.status();
        let payload = json_or_null(response).await;
        if owner_login_refused(status.as_u16(), &payload) {
            return Err(AdminError::OwnerAuthRefused);
        }
        if status.is_success() && str_field(&payload, "type") == Some("failure") {
            return Err(AdminError::LoginRejected);
        }
        if !status.is_success() {
            return Err(AdminError::Status(status.as_u16()));
        }
        if !truthy(&payload) {
            return Err(AdminError::Failed(
                "Stalwart mailbox login is unavailable.".into(),
            ));
        }
        let code = super::oauth::authorization_code(&payload, redirect_uri, &state)
            .ok_or_else(|| AdminError::Failed("Stalwart mailbox login was rejected.".into()))?;
        let response = self
            .post("/auth/token")
            .form(&[
                ("grant_type", "authorization_code"),
                ("client_id", client_id),
                ("redirect_uri", redirect_uri),
                ("code", &code),
                ("code_verifier", &pkce.verifier),
            ])
            .send()
            .await?;
        let status = response.status();
        let payload = json_or_null(response).await;
        if owner_login_refused(status.as_u16(), &payload) {
            return Err(AdminError::OwnerAuthRefused);
        }
        if !status.is_success() {
            return Err(AdminError::Status(status.as_u16()));
        }
        match str_field(&payload, "access_token").filter(|token| !token.is_empty()) {
            Some(access_token) if status.is_success() => Ok(OAuthToken {
                access_token: access_token.to_owned(),
                expires_in: payload.get("expires_in").and_then(Value::as_u64),
                expires_at: payload.get("expires_at").and_then(Value::as_u64),
            }),
            _ => Err(AdminError::Failed(
                "Stalwart mailbox token exchange failed.".into(),
            )),
        }
    }

    pub async fn mailbox_is_empty(&self, account_id: &str) -> Result<bool, AdminError> {
        // Owner-scoped mailbox totals avoid reading message identifiers, bodies or blobs.
        let (status, body) = super::send_in(&super::PROVISIONER_LANE,
            self.post("/jmap/").bearer_auth(self.token).json(&json!({"using":["urn:ietf:params:jmap:core","urn:ietf:params:jmap:mail"],"methodCalls":[["Mailbox/get",{"accountId":account_id,"properties":["id","totalEmails"]},"empty"]]}))).await?;
        if !status.is_success() {
            return Err(AdminError::Status(status.as_u16()));
        }
        let envelope = parse_envelope(read_json(&body)?);
        let result = method_result(&envelope, "Mailbox/get")?;
        let mailboxes = result["list"]
            .as_array()
            .ok_or_else(|| AdminError::Failed("Mailbox totals are unavailable.".into()))?;
        if result
            .get("notFound")
            .and_then(Value::as_array)
            .is_some_and(|ids| !ids.is_empty())
        {
            return Err(AdminError::Failed("Mailbox totals are incomplete.".into()));
        }
        let mut empty = true;
        for mailbox in mailboxes {
            let total = mailbox["totalEmails"]
                .as_u64()
                .ok_or_else(|| AdminError::Failed("Mailbox total is unavailable.".into()))?;
            empty &= total == 0;
        }
        Ok(empty)
    }

    pub async fn prepare_uncommitted_key(
        &self,
        account_id: &str,
        armored: &str,
    ) -> Result<(), AdminError> {
        let wanted = public_key_fingerprint(armored)
            .ok_or_else(|| AdminError::Failed("Invalid public key.".into()))?;
        let keys = self.public_keys(account_id).await?;
        if keys.len() == 1
            && str_field(&keys[0], "key")
                .and_then(public_key_fingerprint)
                .as_deref()
                == Some(&wanted)
        {
            return Ok(());
        }
        if !self.mailbox_is_empty(account_id).await? {
            return Err(AdminError::Failed(
                "Staged mailbox contains stored messages; operator recovery required.".into(),
            ));
        }
        let disabled = json!({"@type":"Disabled"});
        if self.encryption_settings(account_id).await? != disabled {
            let result = self.call("x:AccountSettings/set", json!({"accountId":account_id,"update":{"singleton":{"encryptionAtRest":disabled}}}),"disable").await?;
            acknowledged(
                &result,
                "singleton",
                "Staged encryption reset failed.",
                "Staged encryption reset was not acknowledged.",
            )?;
            if self.encryption_settings(account_id).await? != disabled {
                return Err(AdminError::Failed(
                    "Staged encryption reset readback failed.".into(),
                ));
            }
        }
        let ids = keys
            .iter()
            .map(|key| {
                str_field(key, "id")
                    .filter(|id| !id.is_empty())
                    .map(str::to_owned)
                    .ok_or_else(|| AdminError::Failed("Staged public key has no id.".into()))
            })
            .collect::<Result<Vec<_>, _>>()?;
        if ids.is_empty() {
            return Ok(());
        }
        let result = self
            .call(
                "x:PublicKey/set",
                json!({"accountId":account_id,"destroy":ids}),
                "reset",
            )
            .await?;
        if result["destroyed"].as_array()
            != Some(&ids.iter().map(|id| json!(id)).collect::<Vec<_>>())
            || result
                .get("notDestroyed")
                .and_then(Value::as_object)
                .is_some_and(|errors| !errors.is_empty())
        {
            return Err(AdminError::Failed(
                "Staged public key cleanup was not acknowledged.".into(),
            ));
        }
        Ok(())
    }

    pub async fn needs_activation(
        &self,
        account_id: &str,
        marker: &str,
    ) -> Result<bool, AdminError> {
        let account = self.account(account_id).await?;
        if str_field(&account, "description") != Some(marker) {
            return Ok(false);
        }
        ensure_managed_owner(&account, Some(marker))?;
        Ok(receiving_denied(&account))
    }

    pub async fn register_public_key(
        &self,
        account_id: &str,
        _email: &str,
        public_key_armored: &str,
        description: Option<&str>,
    ) -> Result<String, AdminError> {
        let wanted = public_key_fingerprint(public_key_armored).ok_or_else(|| {
            AdminError::Failed(
                "Stalwart public-key registration requires a valid public key.".into(),
            )
        })?;
        let existing = self.public_keys(account_id).await?;
        if !existing.is_empty() {
            let matching: Vec<_> = existing
                .iter()
                .filter(|key| {
                    str_field(key, "key")
                        .and_then(public_key_fingerprint)
                        .as_deref()
                        == Some(&wanted)
                })
                .collect();
            if existing.len() != 1 || matching.len() != 1 {
                return Err(AdminError::Failed("Stalwart mailbox has an unrelated or ambiguous public key; refusing replacement.".into()));
            }
            validate_public_key(matching[0], &wanted)?;
            return str_field(matching[0], "id")
                .filter(|id| !id.is_empty())
                .map(str::to_owned)
                .ok_or_else(|| AdminError::Failed("Stalwart public key has no id.".into()));
        }
        let result = self
            .call(
                "x:PublicKey/set",
                json!({"accountId": account_id, "create": {"pk1": {
                    "description": description, "key": public_key_armored,
                }}}),
                "c1",
            )
            .await?;
        let id = result
            .pointer("/created/pk1/id")
            .and_then(Value::as_str)
            .filter(|id| !id.is_empty())
            .ok_or_else(|| {
                AdminError::Failed("Stalwart public-key registration was not acknowledged.".into())
            })?;
        let read = self
            .call(
                "x:PublicKey/get",
                json!({"accountId": account_id, "ids": [id]}),
                "c1",
            )
            .await?;
        let key = list_of(&read)
            .into_iter()
            .find(|key| str_field(key, "id") == Some(id))
            .ok_or_else(|| AdminError::Failed("Stalwart public-key readback failed.".into()))?;
        validate_public_key(&key, &wanted)?;
        Ok(id.to_owned())
    }

    async fn public_keys(&self, account_id: &str) -> Result<Vec<Value>, AdminError> {
        let ids = self
            .ids("x:PublicKey/query", json!({"accountId": account_id}))
            .await?;
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        Ok(list_of(
            &self
                .call(
                    "x:PublicKey/get",
                    json!({"accountId": account_id, "ids": ids}),
                    "c1",
                )
                .await?,
        ))
    }

    pub async fn ensure_staging(&self, account_id: &str, marker: &str) -> Result<(), AdminError> {
        ensure_managed_staging(&self.account(account_id).await?, Some(marker))
    }

    pub async fn activate_account(&self, account_id: &str, marker: &str) -> Result<(), AdminError> {
        let account = self.account(account_id).await?;
        ensure_managed_owner(&account, Some(marker))?;
        if !receiving_denied(&account) {
            return Ok(());
        }
        if str_field(&account, "description") != Some(marker) {
            return Err(AdminError::Failed(
                "Quarantined mailbox requires operator recovery.".into(),
            ));
        }
        let active_marker = activated_marker(marker);
        let mut permissions = account.get("permissions").cloned().ok_or_else(|| {
            AdminError::Failed("Stalwart mailbox permissions are missing.".into())
        })?;
        match permissions["@type"].as_str() {
            Some("Merge") => {
                permissions["disabledPermissions"]
                    .as_object_mut()
                    .ok_or_else(|| {
                        AdminError::Failed("Stalwart mailbox receiving denial is missing.".into())
                    })?
                    .remove("emailReceive");
            }
            Some("Replace") => {
                permissions["enabledPermissions"]
                    .as_object_mut()
                    .ok_or_else(|| {
                        AdminError::Failed("Stalwart mailbox permissions are malformed.".into())
                    })?
                    .insert("emailReceive".into(), json!(true));
            }
            _ => {
                return Err(AdminError::Failed(
                    "Stalwart mailbox permissions cannot be activated.".into(),
                ));
            }
        }
        let result = self
            .call(
                "x:Account/set",
                json!({"update": {account_id: {"permissions": permissions,"description":active_marker}}}),
                "c1",
            )
            .await?;
        acknowledged(
            &result,
            account_id,
            "Stalwart mailbox activation failed.",
            "Stalwart mailbox activation was not acknowledged.",
        )?;
        let read = self.account(account_id).await?;
        ensure_managed_owner(&read, Some(marker))?;
        if receiving_denied(&read) || str_field(&read, "description") != Some(&active_marker) {
            return Err(AdminError::Failed(
                "Stalwart mailbox is still denied receiving.".into(),
            ));
        }
        Ok(())
    }

    pub async fn managed_accounts(&self, marker: &str) -> Result<Vec<Value>, AdminError> {
        let owner = marker
            .strip_prefix("Solace managed mailbox v1:")
            .filter(|owner| !owner.is_empty())
            .ok_or_else(|| {
                AdminError::Failed("Mailbox cleanup requires an owner marker.".into())
            })?;
        let result = self
            .call(
                "x:Account/query",
                json!({"filter":{"text":owner},"limit":1000,"calculateTotal":true}),
                "c1",
            )
            .await?;
        let ids = result["ids"]
            .as_array()
            .ok_or_else(|| AdminError::Failed("Mailbox cleanup query is incomplete.".into()))?;
        let mut unique = std::collections::HashSet::new();
        if ids.len() > 1000
            || result["total"].as_u64() != Some(ids.len() as u64)
            || ids
                .iter()
                .any(|id| !id.as_str().is_some_and(|id| unique.insert(id)))
        {
            return Err(AdminError::Failed(
                "Mailbox cleanup query is incomplete.".into(),
            ));
        }
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let records = self
            .call(
                "x:Account/get",
                json!({"ids":ids,"properties":["id","description"]}),
                "c1",
            )
            .await?;
        let accounts = list_of(&records);
        let found: std::collections::HashSet<_> = accounts
            .iter()
            .filter_map(|account| str_field(account, "id"))
            .chain(
                records["notFound"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(Value::as_str),
            )
            .collect();
        if found != unique {
            return Err(AdminError::Failed(
                "Mailbox cleanup readback is incomplete.".into(),
            ));
        }
        Ok(accounts
            .into_iter()
            .filter(|account| {
                str_field(account, "description") == Some(marker)
                    || str_field(account, "description") == Some(&activated_marker(marker))
            })
            .collect())
    }

    pub async fn managed_account_metadata(&self) -> Result<Vec<Value>, AdminError> {
        let mut matched = Vec::new();
        let mut position = 0u64;
        let mut state = None;
        let mut seen = std::collections::HashSet::new();
        for _ in 0..100 {
            let result = self
                .call(
                    "x:Account/query",
                    json!({"position":position,"limit":100,"calculateTotal":true}),
                    "c1",
                )
                .await?;
            let total = result["total"].as_u64().ok_or_else(|| {
                AdminError::Failed("Stalwart account scan total is missing.".into())
            })?;
            let current = result["queryState"].as_str().ok_or_else(|| {
                AdminError::Failed("Stalwart account scan state is missing.".into())
            })?;
            if total > 10_000
                || result["position"].as_u64() != Some(position)
                || state.as_deref().is_some_and(|state| state != current)
            {
                return Err(AdminError::Failed(
                    "Stalwart account scan changed or exceeded its bounded limit.".into(),
                ));
            }
            state = Some(current.to_owned());
            let ids = result["ids"].as_array().ok_or_else(|| {
                AdminError::Failed("Stalwart account scan ids are missing.".into())
            })?;
            if ids.len() > 100
                || ids
                    .iter()
                    .any(|id| !id.as_str().is_some_and(|id| seen.insert(id.to_owned())))
                || (ids.is_empty() && position < total)
            {
                return Err(AdminError::Failed(
                    "Stalwart account scan page is incomplete.".into(),
                ));
            }
            if !ids.is_empty() {
                let records = self.call("x:Account/get",json!({"ids":ids,"properties":["id","description","createdAt","permissions"]}),"c1").await?;
                matched.extend(list_of(&records).into_iter().filter(|account| {
                    str_field(account, "description").is_some_and(|description| {
                        description.starts_with("Solace managed mailbox v1:")
                            || description.starts_with("Solace activated mailbox v1:")
                    })
                }));
            }
            position += u64::try_from(ids.len()).unwrap_or(100);
            if position >= total {
                return Ok(matched);
            }
        }
        Err(AdminError::Failed(
            "Stalwart account scan exceeded its page limit.".into(),
        ))
    }

    pub async fn managed_stage(
        &self,
        account_id: &str,
        marker: &str,
    ) -> Result<Option<Value>, AdminError> {
        let Some(account) = self.account_if_exists(account_id).await? else {
            return Ok(None);
        };
        Ok((str_field(&account, "description") == Some(marker)
            && ensure_managed_staging(&account, Some(marker)).is_ok())
        .then_some(account))
    }

    pub async fn is_managed_account(
        &self,
        account_id: &str,
        marker: &str,
    ) -> Result<bool, AdminError> {
        let account = self.account(account_id).await?;
        if !str_field(&account, "description").is_some_and(|description| {
            description.starts_with("Solace managed mailbox v1:")
                || description.starts_with("Solace activated mailbox v1:")
        }) {
            return Ok(false);
        }
        ensure_managed_owner(&account, Some(marker))?;
        Ok(true)
    }

    async fn encryption_settings(&self, account_id: &str) -> Result<Value, AdminError> {
        let result = self
            .call(
                "x:AccountSettings/get",
                json!({"accountId": account_id, "ids": ["singleton"]}),
                "c1",
            )
            .await?;
        list_of(&result)
            .into_iter()
            .find(|settings| str_field(settings, "id") == Some("singleton"))
            .and_then(|settings| settings.get("encryptionAtRest").cloned())
            .ok_or_else(|| {
                AdminError::Failed("Stalwart encryption settings readback failed.".into())
            })
    }

    pub async fn verify_mailbox_key(
        &self,
        account_id: &str,
        key_id: &str,
        fingerprint: &str,
    ) -> Result<bool, AdminError> {
        let result = self
            .call(
                "x:PublicKey/get",
                json!({"accountId":account_id,"ids":[key_id]}),
                "c1",
            )
            .await?;
        let key = list_of(&result)
            .into_iter()
            .find(|key| str_field(key, "id") == Some(key_id))
            .ok_or_else(|| {
                if result["notFound"]
                    .as_array()
                    .is_some_and(|ids| ids.iter().any(|id| id.as_str() == Some(key_id)))
                {
                    AdminError::PolicyDrift
                } else {
                    AdminError::Failed("Stalwart committed public key is unavailable.".into())
                }
            })?;
        validate_public_key(&key, fingerprint)?;
        Ok(public_key_near_expiry_at(
            &key,
            crate::instant::unix_millis(crate::instant::now()),
        ))
    }

    pub async fn verify_account_binding(
        &self,
        account_id: &str,
        local_part: &str,
        domain_id: &str,
    ) -> Result<(), AdminError> {
        let result = self
            .call("x:Account/get", json!({"ids":[account_id]}), "c1")
            .await?;
        let account = list_of(&result)
            .into_iter()
            .find(|account| str_field(account, "id") == Some(account_id))
            .ok_or_else(|| {
                if result["notFound"]
                    .as_array()
                    .is_some_and(|ids| ids.iter().any(|id| id.as_str() == Some(account_id)))
                {
                    AdminError::PolicyDrift
                } else {
                    AdminError::Failed("Stalwart account binding is unavailable.".into())
                }
            })?;
        let (Some(name), Some(domain)) =
            (str_field(&account, "name"), str_field(&account, "domainId"))
        else {
            return Err(AdminError::Failed(
                "Stalwart account binding is unavailable.".into(),
            ));
        };
        if name != local_part || domain != domain_id {
            return Err(AdminError::PolicyDrift);
        }
        Ok(())
    }

    pub async fn verify_encryption_at_rest(
        &self,
        account_id: &str,
        public_key_id: &str,
    ) -> Result<(), AdminError> {
        if self.encryption_settings(account_id).await? != encryption_policy(public_key_id) {
            return Err(AdminError::PolicyDrift);
        }
        Ok(())
    }

    /// Owner-scoped settings preserve client-encrypted drafts and Sent copies without another encryption layer.
    pub async fn enable_encryption_at_rest(
        &self,
        account_id: &str,
        public_key_id: &str,
    ) -> Result<(), AdminError> {
        let policy = encryption_policy(public_key_id);
        if self.encryption_settings(account_id).await? == policy {
            return Ok(());
        }
        let result = self.call("x:AccountSettings/set", json!({"accountId": account_id, "update": {"singleton": {"encryptionAtRest": policy}}}), "c1").await?;
        acknowledged(
            &result,
            "singleton",
            "Stalwart encryption-at-rest update failed.",
            "Stalwart encryption-at-rest update was not acknowledged.",
        )?;
        self.verify_encryption_at_rest(account_id, public_key_id)
            .await
    }
}

fn owner_login_refused(status: u16, payload: &Value) -> bool {
    matches!(status, 401 | 403 | 404)
        || (status == 400
            && matches!(
                str_field(payload, "error"),
                Some("invalid_grant" | "invalidGrant" | "access_denied" | "accessDenied")
            ))
}

fn activated_marker(marker: &str) -> String {
    marker.replacen(
        "Solace managed mailbox v1:",
        "Solace activated mailbox v1:",
        1,
    )
}

pub fn managed_marker(user_id: &str) -> String {
    format!("Solace managed mailbox v1:{user_id}")
}

fn ensure_managed_owner(account: &Value, marker: Option<&str>) -> Result<(), AdminError> {
    if !marker.is_some_and(|marker| {
        marker.starts_with("Solace managed mailbox v1:")
            && (str_field(account, "description") == Some(marker)
                || str_field(account, "description") == Some(&activated_marker(marker)))
    }) {
        return Err(AdminError::Failed(
            "Stalwart mailbox ownership marker does not match; refusing adoption.".into(),
        ));
    }
    Ok(())
}

pub fn receiving_denied(account: &Value) -> bool {
    match account
        .pointer("/permissions/@type")
        .and_then(Value::as_str)
    {
        Some("Merge") => {
            account.pointer("/permissions/disabledPermissions/emailReceive")
                == Some(&Value::Bool(true))
        }
        Some("Replace") => {
            account.pointer("/permissions/enabledPermissions/emailReceive")
                != Some(&Value::Bool(true))
        }
        _ => false,
    }
}

fn ensure_managed_staging(account: &Value, marker: Option<&str>) -> Result<(), AdminError> {
    ensure_managed_owner(account, marker)?;
    if !receiving_denied(account) || str_field(account, "description") != marker {
        return Err(AdminError::Failed(
            "Stalwart mailbox is not staged with receiving denied; refusing provisioning.".into(),
        ));
    }
    Ok(())
}

fn encryption_policy(public_key_id: &str) -> Value {
    json!({"@type":"Enabled","publicKey":public_key_id,"headerProtection":"none","encryptOnAppend":false,"allowSpamTraining":false})
}

fn public_key_fingerprint(armored: &str) -> Option<String> {
    use pgp::composed::Deserializable;
    use pgp::types::KeyDetails;
    let (key, _) = pgp::composed::SignedPublicKey::from_string(armored).ok()?;
    Some(hex::encode_upper(key.fingerprint().as_bytes()))
}

fn public_key_near_expiry_at(key: &Value, now: i64) -> bool {
    key.get("expiresAt")
        .and_then(Value::as_str)
        .and_then(crate::instant::parse_js_date)
        .is_some_and(|expires| {
            expires > now && expires.saturating_sub(now) <= 14 * 24 * 60 * 60 * 1000
        })
}

fn validate_public_key(key: &Value, wanted: &str) -> Result<(), AdminError> {
    validate_public_key_at(
        key,
        wanted,
        crate::instant::unix_millis(crate::instant::now()),
    )
}

fn validate_public_key_at(key: &Value, wanted: &str, now: i64) -> Result<(), AdminError> {
    if str_field(key, "key")
        .and_then(public_key_fingerprint)
        .as_deref()
        != Some(wanted)
    {
        return Err(AdminError::PolicyDrift);
    }
    if key
        .get("expiresAt")
        .and_then(Value::as_str)
        .and_then(crate::instant::parse_js_date)
        .is_some_and(|expires| expires <= now)
    {
        return Err(AdminError::ExpiredKey);
    }
    let warnings = key
        .get("warnings")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            AdminError::Failed("Stalwart public-key warnings were not returned.".into())
        })?;
    // Advisory warnings cannot stop delivery policy when account binding and the independent fingerprint match.
    if warnings
        .iter()
        .any(|warning| !matches!(warning.as_str(), Some("addressMismatch" | "expiresSoon")))
    {
        return Err(AdminError::PolicyDrift);
    }
    match key.get("expiresAt") {
        Some(Value::Null)
            if !warnings
                .iter()
                .any(|warning| warning.as_str() == Some("expiresSoon")) => {}
        Some(Value::String(expires)) => {
            let expires = crate::instant::parse_js_date(expires).ok_or_else(|| {
                AdminError::Failed("Stalwart public-key expiry is unavailable.".into())
            })?;
            if expires <= now {
                return Err(AdminError::ExpiredKey);
            }
        }
        _ => {
            return Err(AdminError::Failed(
                "Stalwart public-key expiry is unavailable.".into(),
            ));
        }
    }
    Ok(())
}

/// `response.json().catch(() => null)`.
async fn json_or_null(response: reqwest::Response) -> Value {
    response.json().await.unwrap_or(Value::Null)
}

fn read_json(body: &[u8]) -> Result<Value, AdminError> {
    serde_json::from_slice(body).map_err(|_| AdminError::NotJson)
}

fn str_field<'v>(value: &'v Value, key: &str) -> Option<&'v str> {
    value.get(key).and_then(Value::as_str)
}

fn list_of(result: &Value) -> Vec<Value> {
    result
        .get("list")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

/// JavaScript truthiness for the error objects of a `/set` answer.
fn truthy(value: &Value) -> bool {
    !matches!(value, Value::Null | Value::Bool(false))
        && value.as_str() != Some("")
        && value.as_f64() != Some(0.0)
}

fn description_of(error: Option<&Value>) -> Option<&str> {
    error
        .and_then(|error| str_field(error, "description"))
        .filter(|description| !description.is_empty())
}

/// `notUpdated[id]` fails with its description, and an `updated` without the id is unacknowledged.
fn acknowledged(
    result: &Value,
    id: &str,
    failed: &str,
    unacknowledged: &str,
) -> Result<(), AdminError> {
    if let Some(error) = result
        .get("notUpdated")
        .and_then(|refused| refused.get(id))
        .filter(|error| truthy(error))
    {
        return Err(AdminError::Failed(
            description_of(Some(error)).unwrap_or(failed).to_owned(),
        ));
    }
    if result
        .get("updated")
        .and_then(Value::as_object)
        .is_some_and(|updated| updated.contains_key(id))
    {
        return Ok(());
    }
    Err(AdminError::Failed(unacknowledged.to_owned()))
}

/// A `primaryKeyViolation` on `email` names the account that already holds the mailbox.
fn recovered_account_id(error: Option<&Value>) -> Option<String> {
    let error = error?;
    let on_email = str_field(error, "type") == Some("primaryKeyViolation")
        && error
            .get("properties")
            .and_then(Value::as_array)
            .is_some_and(|properties| properties.contains(&json!("email")));
    if !on_email {
        return None;
    }
    let id = error
        .pointer("/objectId/id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|id| !id.is_empty())?;
    tracing::warn!(
        existing_account_id = id,
        "Stalwart createAccount reported an existing remote mailbox; attempting recovery"
    );
    Some(id.to_owned())
}

fn key_matches_email(key: &Value, email: &str) -> bool {
    match key.get("emailAddresses") {
        Some(Value::Array(addresses)) => addresses
            .iter()
            .filter_map(Value::as_str)
            .any(|address| address.trim().to_lowercase() == email),
        Some(Value::Object(addresses)) => addresses.get(email) == Some(&Value::Bool(true)),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::super::fake::{FakeStalwart, Reply};
    use super::*;

    fn admin(fake: &FakeStalwart) -> Admin<'_> {
        Admin::for_tests(fake)
    }

    fn envelope(method: &str, arguments: Value, call_id: &str) -> Reply {
        Reply::json(json!({"methodResponses": [[method, arguments, call_id]]}))
    }

    #[test]
    fn sends_the_gate_key_when_configured() {
        let http = Client::new();
        let gate = StalwartGate::new("https://mail.solace.onl/", Some(&"g".repeat(64)));
        let admin = Admin {
            http: &http,
            gate: &gate,
            base_url: "https://mail.solace.onl",
            token: "token-1",
        };
        let request = admin
            .post("/jmap/")
            .bearer_auth(admin.token)
            .build()
            .unwrap();
        assert_eq!(request.url().as_str(), "https://mail.solace.onl/jmap/");
        let header = |name: &str| request.headers().get(name).and_then(|v| v.to_str().ok());
        assert_eq!(header("X-Solace-Gate"), Some("g".repeat(64).as_str()));
        assert_eq!(header("Authorization"), Some("Bearer token-1"));
    }

    #[tokio::test]
    async fn resolves_a_domain_by_name() {
        let fake = FakeStalwart::scripted(vec![
            envelope("x:Domain/query", json!({"ids": ["domain-1"]}), "c1"),
            envelope(
                "x:Domain/get",
                json!({"list": [{"id": "domain-1", "name": "solace.onl"}], "notFound": []}),
                "c1",
            ),
        ])
        .await;
        let domain_id = admin(&fake)
            .resolve_domain_by_name("solace.onl")
            .await
            .unwrap();
        assert_eq!(domain_id, "domain-1");
        let requests = fake.requests();
        assert_eq!(requests.len(), 2);
        assert_eq!(requests[0].path, "/jmap/");
        assert_eq!(requests[0].authorization.as_deref(), Some("Bearer token-1"));
        assert_eq!(
            requests[0].content_type.as_deref(),
            Some("application/json")
        );
        assert_eq!(
            requests[0].json()["using"],
            json!(["urn:ietf:params:jmap:core", "urn:stalwart:jmap"])
        );
        assert_eq!(
            requests[0].json()["methodCalls"][0],
            json!(["x:Domain/query", {}, "c1"])
        );
        assert_eq!(
            requests[1].json()["methodCalls"][0],
            json!(["x:Domain/get", {"ids": ["domain-1"]}, "c1"])
        );
    }

    #[tokio::test]
    async fn resends_registry_calls_refused_at_the_concurrency_limit() {
        let fake = FakeStalwart::scripted(vec![
            Reply::concurrency_limit(),
            Reply::concurrency_limit(),
            envelope("x:Domain/query", json!({"ids": ["domain-1"]}), "c1"),
        ])
        .await;
        let envelope = admin(&fake)
            .call_jmap(json!([["x:Domain/query", {}, "c1"]]))
            .await
            .unwrap();
        assert_eq!(
            envelope,
            json!({"methodResponses": [["x:Domain/query", {"ids": ["domain-1"]}, "c1"]]})
        );
        assert_eq!(fake.requests().len(), 3);
    }

    #[tokio::test]
    async fn gives_up_on_the_concurrency_limit_and_never_resends_other_errors() {
        let attempts = usize::try_from(super::super::LIMIT_RETRIES).unwrap() + 1;
        let fake = FakeStalwart::scripted(
            std::iter::repeat_with(Reply::concurrency_limit)
                .take(attempts)
                .chain([Reply::status(400)])
                .collect(),
        )
        .await;
        let admin = admin(&fake);
        let busy = admin.call_jmap(json!([["x:Domain/query", {}, "c1"]])).await;
        assert!(matches!(busy, Err(AdminError::Status(400))), "{busy:?}");
        assert_eq!(fake.requests().len(), attempts);
        let refused = admin.call_jmap(json!([["x:Domain/query", {}, "c1"]])).await;
        assert!(
            matches!(refused, Err(AdminError::Status(400))),
            "{refused:?}"
        );
        assert_eq!(
            fake.requests().len(),
            attempts + 1,
            "a plain 400 is sent once"
        );
    }

    #[tokio::test]
    async fn rejects_mismatched_create_account_responses() {
        let fake = FakeStalwart::scripted(vec![
            envelope("x:Account/query", json!({"ids": []}), "c1"),
            envelope(
                "x:Account/set",
                json!({"created": {"user1": {"id": "acct-1", "emailAddress": "other@solace.onl", "domainId": "domain-1"}}}),
                "c1",
            ),
            envelope(
                "x:Account/get",
                json!({"list": [{"id": "acct-1", "name": "other", "domainId": "domain-1", "emailAddress": "other@solace.onl"}]}),
                "c1",
            ),
        ])
        .await;
        let error = admin(&fake)
            .create_account(
                "alice",
                "StrongPassw0rd!",
                "domain-1",
                Some("Solace managed mailbox v1:test-owner"),
            )
            .await
            .err()
            .unwrap();
        assert!(
            error
                .to_string()
                .contains("Stalwart returned a mismatched mailbox"),
            "{error}"
        );
        assert_eq!(fake.requests().len(), 3, "no password is set");
    }

    #[tokio::test]
    async fn reuses_an_account_after_a_primary_key_violation() {
        let fake = FakeStalwart::scripted(vec![
            envelope("x:Account/query", json!({"ids": []}), "c1"),
            envelope(
                "x:Account/set",
                json!({"notCreated": {"user1": {"type": "primaryKeyViolation", "properties": ["email"], "objectId": {"object": "Account", "id": "acct-existing"}}}}),
                "c1",
            ),
            envelope(
                "x:Account/get",
                json!({"list": [{"id": "acct-existing", "name": "alice", "domainId": "domain-1", "description":"Solace managed mailbox v1:test-owner", "permissions":{"@type":"Merge","disabledPermissions":{"emailReceive":true}}, "emailAddress": "alice@solace.onl"}]}),
                "c1",
            ),
            envelope("x:Account/set", json!({"updated": {"acct-existing": null}}), "c1"),
        ])
        .await;
        let account = admin(&fake)
            .create_account(
                "alice",
                "StrongPassw0rd!",
                "domain-1",
                Some("Solace managed mailbox v1:test-owner"),
            )
            .await
            .unwrap();
        assert_eq!(account.account_id, "acct-existing");
        assert!(!account.created);
        let requests = fake.requests();
        assert_eq!(
            requests[1].json()["methodCalls"][0],
            json!(["x:Account/set", {"create": {"user1": {
                "@type": "User", "aliases": {}, "credentials": {"0":{"@type":"Password","secret":"StrongPassw0rd!","expiresAt":null,"allowedIps":{}}},
                "encryptionAtRest": {"@type": "Disabled"}, "memberGroupIds": {},
                "name": "alice", "domainId": "domain-1", "permissions": {"@type": "Merge", "enabledPermissions":{},"disabledPermissions":{"emailReceive":true}},
                "quotas": {}, "roles": {"@type": "User"}, "description": "Solace managed mailbox v1:test-owner",
            }}}, "c1"])
        );
        assert_eq!(
            requests[3].json()["methodCalls"][0],
            json!(["x:Account/set", {"update": {"acct-existing": {"credentials/0": {
                "@type": "Password", "secret": "StrongPassw0rd!", "expiresAt": null, "allowedIps": {},
            }}}}, "c1"])
        );
    }

    #[tokio::test]
    async fn reuses_an_account_found_by_query() {
        let fake = FakeStalwart::scripted(vec![
            envelope("x:Account/query", json!({"ids": ["acct-existing"]}), "c1"),
            envelope(
                "x:Account/get",
                json!({"list": [{"id": "acct-existing", "name": "alice", "domainId": "domain-1", "description":"Solace managed mailbox v1:test-owner", "permissions":{"@type":"Merge","disabledPermissions":{"emailReceive":true}}, "credentials": {
                    "0": {"@type": "Password", "allowedIps": {}, "expiresAt": null, "secret": "****", "credentialId": "x", "createdAt": 1},
                    "api1": {"@type": "ApiKey", "description": "existing-api-key", "secret": "****"},
                }}]}),
                "c1",
            ),
            envelope("x:Account/set", json!({"updated": {"acct-existing": null}}), "c1"),
        ])
        .await;
        let account = admin(&fake)
            .create_account(
                " Alice ",
                "StrongPassw0rd!",
                "domain-1",
                Some("Solace managed mailbox v1:test-owner"),
            )
            .await
            .unwrap();
        assert_eq!(account.account_id, "acct-existing");
        assert!(!account.created);
        let requests = fake.requests();
        assert_eq!(
            requests[0].json()["methodCalls"][0],
            json!(["x:Account/query", {"filter": {"name": "alice", "domainId": "domain-1"}}, "c1"])
        );
        assert_eq!(
            requests[2].json()["methodCalls"][0][1],
            json!({"update": {"acct-existing": {"credentials/0": {
                "@type": "Password", "allowedIps": {}, "expiresAt": null, "secret": "StrongPassw0rd!",
            }}}}),
            "only the password credential is written, without its server-set fields"
        );
    }

    #[tokio::test]
    async fn adds_a_missing_callback_after_write_contention_without_replacing_existing_redirects() {
        let fake = FakeStalwart::scripted(vec![
            envelope("x:OAuthClient/query", json!({"ids": ["client-1"]}), "c1"),
            envelope("x:OAuthClient/get", json!({"list": [{"id": "client-1", "clientId": "bridge", "scopes": {"mail":true,"settings":true}, "redirectUris": {"https://old.test/callback": true}}]}), "c1"),
            envelope("error", json!({"type": "serverUnavailable"}), "c1"),
            envelope("error", json!({"type": "serverUnavailable"}), "c1"),
            envelope("x:OAuthClient/set", json!({"updated": {"client-1": null}}), "c1"),
        ]).await;
        admin(&fake)
            .ensure_oauth_redirect("bridge", "https://new.test/~callback")
            .await
            .unwrap();
        assert_eq!(
            fake.requests()[2].json()["methodCalls"][0][1],
            json!({"update": {"client-1": {"redirectUris/https:~1~1new.test~1~0callback": true}}})
        );
        assert_eq!(fake.requests().len(), 5);
        for request in &fake.requests()[2..] {
            assert_eq!(request.json(), fake.requests()[2].json());
        }
    }

    #[tokio::test]
    async fn never_creates_the_bridge_client() {
        let fake = FakeStalwart::scripted(vec![envelope(
            "x:OAuthClient/query",
            json!({"ids": []}),
            "c1",
        )])
        .await;
        assert!(
            admin(&fake)
                .ensure_oauth_redirect("bridge", "https://new.test/callback")
                .await
                .is_err()
        );
        assert_eq!(fake.requests().len(), 1);
    }

    #[tokio::test]
    async fn callback_retries_are_bounded_and_only_for_unavailable_updates() {
        let retries = usize::try_from(super::super::LIMIT_RETRIES).unwrap();
        for (kind, attempts) in [("serverUnavailable", retries + 1), ("forbidden", 1)] {
            let mut replies = vec![
                envelope("x:OAuthClient/query", json!({"ids": ["client-1"]}), "c1"),
                envelope(
                    "x:OAuthClient/get",
                    json!({"list": [{"id": "client-1", "clientId": "bridge", "scopes": {"mail":true,"settings":true}, "redirectUris": {}}]}),
                    "c1",
                ),
            ];
            replies.extend((0..attempts).map(|_| envelope("error", json!({"type": kind}), "c1")));
            let fake = FakeStalwart::scripted(replies).await;
            assert!(
                admin(&fake)
                    .ensure_oauth_redirect("bridge", "https://new.test/callback")
                    .await
                    .is_err()
            );
            assert_eq!(fake.requests().len(), attempts + 2, "{kind}");
        }
    }

    #[tokio::test]
    async fn accepts_v1_authorization_redirect() {
        let fake = FakeStalwart::start(|request| {
            if request.path == "/auth/token" {
                return Reply::json(json!({"access_token": "v1-token", "expires_in": 3600}));
            }
            let body = request.json();
            let Some(query) = body.get("query").and_then(Value::as_str) else {
                return Reply::status(400);
            };
            let query: std::collections::HashMap<_, _> =
                url::form_urlencoded::parse(query.as_bytes()).collect();
            assert_eq!(query.get("response_type").map(|v| v.as_ref()), Some("code"));
            assert_eq!(
                query.get("code_challenge_method").map(|v| v.as_ref()),
                Some("S256")
            );
            assert_eq!(
                query.get("scope").map(|v| v.as_ref()),
                Some(super::super::oauth::MAIL_BRIDGE_SCOPES)
            );
            assert_eq!(body["consent"], json!(true));
            let mut location =
                url::Url::parse("https://api.solace.test/api/mail/oauth/callback").unwrap();
            location
                .query_pairs_mut()
                .append_pair("code", "v1-code")
                .append_pair("state", query.get("state").unwrap());
            Reply::json(json!({"type": "authenticated", "location": location.as_str()}))
        })
        .await;
        let token = admin(&fake)
            .issue_oauth_access_token(
                "alice@solace.test",
                "solace-test-password",
                "solace-mail-bridge",
                "https://api.solace.test/api/mail/oauth/callback",
                crate::mail::bridge::pkce(),
            )
            .await
            .unwrap();
        assert_eq!(token.access_token, "v1-token");
        let requests = fake.requests();
        assert_eq!(requests[0].path, "/api/auth");
        assert_eq!(
            requests[0].authorization, None,
            "the login carries no admin token"
        );
        let mut login = requests[0].json();
        let object = login.as_object_mut().unwrap();
        assert!(object.remove("query").unwrap().is_string());
        assert_eq!(
            login,
            json!({"type": "authCode", "accountName": "alice@solace.test", "accountSecret": "solace-test-password", "consent": true})
        );
        assert_eq!(requests[1].path, "/auth/token");
        assert_eq!(
            requests[1].content_type.as_deref(),
            Some("application/x-www-form-urlencoded")
        );
        assert!(requests[1].body.contains("code=v1-code"));
    }

    #[tokio::test]
    async fn disables_encrypt_on_append_and_requires_exact_readback() {
        let current = json!({"list":[{"id":"singleton","encryptionAtRest":{"@type":"Enabled","publicKey":"pk-1","headerProtection":"none","encryptOnAppend":true,"allowSpamTraining":false}}]});
        let required =
            json!({"list":[{"id":"singleton","encryptionAtRest":encryption_policy("pk-1")}]});
        let fake = FakeStalwart::scripted(vec![
            envelope("x:AccountSettings/get", current, "c1"),
            envelope(
                "x:AccountSettings/set",
                json!({"updated":{"singleton":null}}),
                "c1",
            ),
            envelope("x:AccountSettings/get", required.clone(), "c1"),
            envelope("x:AccountSettings/get", required, "c1"),
        ])
        .await;
        admin(&fake)
            .enable_encryption_at_rest("acct-1", "pk-1")
            .await
            .unwrap();
        assert_eq!(
            fake.requests()[1].json()["methodCalls"][0][1],
            json!({"accountId":"acct-1","update":{"singleton":{"encryptionAtRest":encryption_policy("pk-1")}}})
        );
        admin(&fake)
            .enable_encryption_at_rest("acct-1", "pk-1")
            .await
            .unwrap();
        assert_eq!(fake.requests().len(), 4);
    }

    #[tokio::test]
    async fn already_destroyed_accounts_and_owner_filtered_cleanup_are_safe() {
        let marker = managed_marker("opaque-owner");
        let active = activated_marker(&marker);
        let fake = FakeStalwart::scripted(vec![
            envelope("x:Account/set", json!({"notDestroyed":{"gone":{"type":"notFound"}}}), "c1"),
            envelope("x:Account/query", json!({"ids":["stage","active","unrelated"],"total":3}), "c1"),
            envelope("x:Account/get", json!({"list":[{"id":"stage","description":marker},{"id":"active","description":active},{"id":"unrelated","description":"Someone else's mailbox"}],"notFound":[]}), "c1"),
        ]).await;
        admin(&fake).delete_account("gone").await.unwrap();
        let owned = admin(&fake).managed_accounts(&marker).await.unwrap();
        assert_eq!(owned.len(), 2);
        assert_eq!(
            fake.requests()[1].json()["methodCalls"][0][1],
            json!({"filter":{"text":"opaque-owner"},"limit":1000,"calculateTotal":true})
        );
    }

    #[tokio::test]
    async fn destroying_an_absent_account_succeeds() {
        let fake = FakeStalwart::scripted(vec![
            envelope("x:Account/set", json!({"accountId": "admin-1"}), "c1"),
            envelope("x:Account/get", json!({"list": []}), "c1"),
            envelope(
                "x:Account/set",
                json!({"notDestroyed": {"acct-1": {"type": "forbidden"}}}),
                "c1",
            ),
            envelope("x:Account/set", json!({}), "c1"),
            envelope("x:Account/get", json!({"list": [{"id": "acct-1"}]}), "c1"),
        ])
        .await;
        admin(&fake).delete_account(" acct-1 ").await.unwrap();
        assert_eq!(
            fake.requests()[0].json()["methodCalls"][0],
            json!(["x:Account/set", {"destroy": ["acct-1"]}, "c1"])
        );
        let refused = admin(&fake).delete_account("acct-1").await.err().unwrap();
        assert_eq!(refused.to_string(), "Stalwart account deletion failed.");
        let unacknowledged = admin(&fake).delete_account("acct-1").await.err().unwrap();
        assert_eq!(
            unacknowledged.to_string(),
            "Stalwart account deletion was not acknowledged."
        );
    }

    #[test]
    fn malformed_envelopes_read_as_empty() {
        assert_eq!(
            parse_envelope(json!({"methodResponses": [["x:Domain/get", null, "c1"]]})),
            json!({})
        );
        assert_eq!(
            parse_envelope(json!({"methodResponses": [], "sessionState": "s", "uploadUrl": "u"})),
            json!({"methodResponses": [], "uploadUrl": "u"})
        );
        assert_eq!(parse_envelope(json!([1])), json!({}));
    }
    #[tokio::test]
    async fn matching_callback_without_settings_scope_is_rejected_without_mutation() {
        let fake = FakeStalwart::scripted(vec![
            envelope("x:OAuthClient/query",json!({"ids":["bridge"]}),"c1"),
            envelope("x:OAuthClient/get",json!({"list":[{"id":"bridge","clientId":"bridge","scopes":{"mail":true},"redirectUris":{"https://api.test/callback":true}}]}),"c1"),
        ]).await;
        assert!(
            admin(&fake)
                .ensure_oauth_redirect("bridge", "https://api.test/callback")
                .await
                .is_err()
        );
        assert_eq!(fake.requests().len(), 2);
    }

    #[test]
    fn key_warning_policy_requires_matching_bytes_and_valid_expiry() {
        let key = include_str!("../../../../../crates/solace-api-tests/fixtures/pgp/test1.asc");
        let fingerprint = public_key_fingerprint(key).unwrap();
        let valid = json!({"key":key,"warnings":["addressMismatch"],"expiresAt":null});
        assert!(validate_public_key(&valid, &fingerprint).is_ok());
        assert!(validate_public_key(&valid, "OTHER").is_err());
        for patch in [
            json!({"warnings":["expired"]}),
            json!({"warnings":["unknownFutureWarning"]}),
            json!({"expiresAt":"2020-01-01T00:00:00Z"}),
            json!({"expiresAt":"invalid"}),
        ] {
            let mut invalid = valid.clone();
            invalid
                .as_object_mut()
                .unwrap()
                .extend(patch.as_object().unwrap().clone());
            assert!(
                validate_public_key(&invalid, &fingerprint).is_err(),
                "{patch}"
            );
        }
    }

    #[tokio::test]
    async fn metadata_scan_pages_explicitly_and_refuses_a_changed_snapshot() {
        for changed in [false, true] {
            let fake = FakeStalwart::start(move |request| {
                let call = request.json()["methodCalls"][0].clone();
                let args = &call[1];
                let result = match call[0].as_str().unwrap() {
                    "x:Account/query" => {
                        let position = args["position"].as_u64().unwrap();
                        json!({"ids":(position..(position+100).min(101)).map(|id| format!("a{id}")).collect::<Vec<_>>(),"position":position,"total":101,"queryState":if changed && position>0 {"new"} else {"stable"}})
                    }
                    "x:Account/get" => json!({"list":args["ids"].as_array().unwrap().iter().map(|id| json!({"id":id,"description":"Solace managed mailbox v1:owner"})).collect::<Vec<_>>()}),
                    _ => return Reply::status(500),
                };
                envelope(call[0].as_str().unwrap(),result,"c1")
            }).await;
            let result = admin(&fake).managed_account_metadata().await;
            if changed {
                assert!(result.is_err());
            } else {
                assert_eq!(result.unwrap().len(), 101);
            }
        }
    }
    #[tokio::test]
    async fn abandoned_key_replacement_reads_only_owner_mailbox_totals_and_refuses_stored_mail() {
        let key = include_str!("../../../../../crates/solace-api-tests/fixtures/pgp/test1.asc");
        let foreign = include_str!("../../../../../crates/solace-api-tests/fixtures/pgp/test2.asc");
        let fake = FakeStalwart::scripted(vec![
            envelope("x:PublicKey/query", json!({"ids":["old"]}), "q"),
            envelope(
                "x:PublicKey/get",
                json!({"list":[{"id":"old","key":foreign}]}),
                "g",
            ),
            envelope(
                "Mailbox/get",
                json!({"list":[{"id":"inbox","totalEmails":1}]}),
                "empty",
            ),
        ])
        .await;
        assert!(
            admin(&fake)
                .with_owner_token("owner-only")
                .prepare_uncommitted_key("acct-1", key)
                .await
                .is_err()
        );
        let requests = fake.requests();
        assert_eq!(requests.len(), 3);
        assert!(
            requests
                .iter()
                .all(|request| request.authorization.as_deref() == Some("Bearer owner-only"))
        );
        assert_eq!(
            requests[2].json()["methodCalls"][0][1]["properties"],
            json!(["id", "totalEmails"])
        );
        assert!(!requests.iter().any(|request| matches!(
            request.first_method().as_str(),
            "Email/get" | "Email/query" | "Blob/get" | "x:PublicKey/set"
        )));
    }

    #[test]
    fn explicit_denials_and_replace_omission_both_refuse_receiving() {
        assert!(receiving_denied(
            &json!({"permissions":{"@type":"Merge","disabledPermissions":{"emailReceive":true}}})
        ));
        assert!(receiving_denied(
            &json!({"permissions":{"@type":"Replace","enabledPermissions":{"authenticate":true}}})
        ));
        assert!(!receiving_denied(
            &json!({"permissions":{"@type":"Replace","enabledPermissions":{"emailReceive":true}}})
        ));
        assert!(!receiving_denied(
            &json!({"permissions":{"@type":"Inherit"}})
        ));
    }
    #[test]
    fn shared_key_policy_vectors_match_the_migration_gate() {
        let fixture: Value = serde_json::from_str(include_str!(
            "../../../../../packages/calendar-core/test-fixtures/mail-key-policy.json"
        ))
        .unwrap();
        let now = crate::instant::parse_js_date(fixture["now"].as_str().unwrap()).unwrap();
        let armored = include_str!("../../../../../crates/solace-api-tests/fixtures/pgp/test1.asc");
        let fingerprint = public_key_fingerprint(armored).unwrap();
        for case in fixture["cases"].as_array().unwrap() {
            let key =
                json!({"key":armored,"warnings":case["warnings"],"expiresAt":case["expiresAt"]});
            assert_eq!(
                validate_public_key_at(&key, &fingerprint, now).is_ok(),
                case["usable"].as_bool().unwrap(),
                "{}",
                case["name"]
            );
            assert_eq!(
                public_key_near_expiry_at(&key, now),
                case["nearExpiry"].as_bool().unwrap(),
                "{}",
                case["name"]
            );
        }
    }
    #[tokio::test]
    async fn owner_login_and_exchange_refusals_remain_typed_without_hiding_retryable_statuses() {
        for token_exchange in [false, true] {
            for (status, error, rejected) in [
                (400, "invalid_grant", true),
                (400, "invalidGrant", true),
                (401, "", true),
                (403, "", true),
                (404, "", true),
                (429, "", false),
                (500, "", false),
                (400, "server_error", false),
            ] {
                let fake = FakeStalwart::start(move |request| {
                    if token_exchange && request.path == "/api/auth" {
                        return Reply::authenticated(request, "code-1");
                    }
                    if status == 400 {
                        Reply::problem(json!({"error":error}))
                    } else {
                        Reply::status(status)
                    }
                })
                .await;
                let result = admin(&fake)
                    .issue_oauth_access_token(
                        "alice@solace.test",
                        "synthetic-secret",
                        "solace-mail-bridge",
                        "http://localhost:4001/api/mail/oauth/stalwart/callback",
                        crate::mail::bridge::pkce(),
                    )
                    .await;
                assert_eq!(
                    matches!(result, Err(AdminError::OwnerAuthRefused)),
                    rejected,
                    "exchange={token_exchange} status={status}"
                );
            }
        }
    }
}
