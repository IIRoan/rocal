//! `lib/stalwart-admin.ts`: Stalwart's registry (`x:` methods) with the provisioning token, through the backend gate; it never reads mailbox data.

use reqwest::{Client, RequestBuilder};
use serde_json::{Map, Value, json};
use thiserror::Error;

use super::gate::StalwartGate;
use crate::state::AppState;
use crate::telemetry;

/// The registry capabilities; mail capabilities are never requested with the provisioning token.
const USING: [&str; 2] = ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"];
const WEBHOOK_ID: &str = "solace-inbound-mail";

#[derive(Debug, Error)]
pub enum AdminError {
    #[error("Stalwart request failed.")]
    Http(#[from] reqwest::Error),
    #[error("Stalwart returned a response that is not JSON.")]
    NotJson,
    #[error("Stalwart admin JMAP request failed with status {0}.")]
    Status(u16),
    #[error("Stalwart JMAP response did not include {0}.")]
    MissingMethod(String),
    #[error("{0}")]
    Failed(String),
}

pub struct CreatedAccount {
    pub account_id: String,
    /// False when an existing remote mailbox was adopted instead of created.
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
                    "credentials": {},
                    "encryptionAtRest": {"@type": "Disabled"},
                    "memberGroupIds": {},
                    "name": local_part,
                    "domainId": domain_id,
                    "permissions": {"@type": "Inherit"},
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
        let account_id = match created_id {
            Some(id) => Some(id.to_owned()),
            None => recovered_account_id(refused),
        }
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

    async fn find_account_by_email_address(
        &self,
        email: &str,
        domain_id: &str,
    ) -> Result<Option<Value>, AdminError> {
        let email = email.trim().to_lowercase();
        let ids = self
            .ids(
                "x:Account/query",
                json!({"filter": {"domainId": domain_id}}),
            )
            .await?;
        if ids.is_empty() {
            return Ok(None);
        }
        Ok(self
            .list("x:Account/get", ids)
            .await?
            .into_iter()
            .find(|account| {
                str_field(account, "emailAddress").map(|a| a.trim().to_lowercase())
                    == Some(email.clone())
            }))
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

    /// The public key Stalwart holds for an address of one of its domains.
    pub async fn resolve_mailbox_public_key(
        &self,
        email: &str,
    ) -> Result<Option<MailboxKey>, AdminError> {
        let email = email.trim().to_lowercase();
        let Some((local_part, domain_name)) = email
            .rsplit_once('@')
            .filter(|(local, domain)| !local.is_empty() && !domain.is_empty())
        else {
            return Ok(None);
        };
        let Ok(domain_id) = self.resolve_domain_by_name(domain_name).await else {
            return Ok(None);
        };
        let account = match self.find_account_by_mailbox(local_part, &domain_id).await? {
            Some(account) => Some(account),
            None => {
                self.find_account_by_email_address(&email, &domain_id)
                    .await?
            }
        };
        let Some(account_id) = account
            .as_ref()
            .and_then(|account| str_field(account, "id"))
            .filter(|id| !id.is_empty())
        else {
            return Ok(None);
        };
        let keys = self.public_keys(account_id).await?;
        let Some(key) = keys
            .iter()
            .find(|key| key_matches_email(key, &email))
            .or(keys.first())
        else {
            return Ok(None);
        };
        let armored = str_field(key, "key").map(str::trim).unwrap_or_default();
        if str_field(key, "id").is_none_or(str::is_empty) || armored.is_empty() {
            return Ok(None);
        }
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

    pub async fn ensure_oauth_client(
        &self,
        client_id: &str,
        redirect_uri: &str,
        description: Option<&str>,
    ) -> Result<(), AdminError> {
        let ids = self.ids("x:OAuthClient/query", json!({})).await?;
        if !ids.is_empty() {
            let clients = self.list("x:OAuthClient/get", ids).await?;
            if let Some(existing) = clients
                .iter()
                .find(|client| str_field(client, "clientId") == Some(client_id))
            {
                let mut redirect_uris = existing
                    .get("redirectUris")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                let uri = json!(redirect_uri);
                let stored_description = existing.get("description").unwrap_or(&Value::Null);
                if redirect_uris.contains(&uri) && *stored_description == json!(description) {
                    return Ok(());
                }
                let mut next: Vec<Value> = Vec::with_capacity(redirect_uris.len() + 1);
                redirect_uris.push(uri);
                for value in redirect_uris {
                    if !next.contains(&value) {
                        next.push(value);
                    }
                }
                let id = existing.get("id").cloned().unwrap_or(Value::Null);
                let mut update = Map::new();
                update.insert(
                    id.as_str().unwrap_or_default().to_owned(),
                    json!({"redirectUris": next, "description": description}),
                );
                self.call("x:OAuthClient/set", json!({"update": update}), "c1")
                    .await?;
                return Ok(());
            }
        }
        self.call(
            "x:OAuthClient/set",
            json!({"create": {"client1": {
                "clientId": client_id,
                "redirectUris": [redirect_uri],
                "description": description,
            }}}),
            "c1",
        )
        .await?;
        Ok(())
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
        let response = self
            .post("/api/auth")
            .json(&json!({
                "type": "authCode",
                "accountName": account_name,
                "accountSecret": account_secret,
                "clientId": client_id,
                "redirectUri": redirect_uri,
                "codeChallenge": pkce.challenge,
                "codeChallengeMethod": "S256",
            }))
            .send()
            .await?;
        let status = response.status();
        let payload = json_or_null(response).await;
        if !status.is_success() || !truthy(&payload) {
            return Err(AdminError::Failed(format!(
                "Stalwart mailbox login failed with status {}.",
                status.as_u16()
            )));
        }
        let code = (str_field(&payload, "type") == Some("authenticated"))
            .then(|| str_field(&payload, "clientCode").or(str_field(&payload, "client_code")))
            .flatten()
            .ok_or_else(|| AdminError::Failed("Stalwart mailbox login was rejected.".into()))?;
        let response = self
            .post("/auth/token")
            .form(&[
                ("grant_type", "authorization_code"),
                ("client_id", client_id),
                ("redirect_uri", redirect_uri),
                ("code", code),
                ("code_verifier", &pkce.verifier),
            ])
            .send()
            .await?;
        let status = response.status();
        let payload = json_or_null(response).await;
        match str_field(&payload, "access_token").filter(|token| !token.is_empty()) {
            Some(access_token) if status.is_success() => Ok(OAuthToken {
                access_token: access_token.to_owned(),
                expires_in: payload.get("expires_in").and_then(Value::as_u64),
                expires_at: payload.get("expires_at").and_then(Value::as_u64),
            }),
            _ => Err(AdminError::Failed(
                str_field(&payload, "error")
                    .filter(|error| !error.is_empty())
                    .unwrap_or("Stalwart mailbox token exchange failed.")
                    .to_owned(),
            )),
        }
    }

    pub async fn register_public_key(
        &self,
        account_id: &str,
        email: &str,
        public_key_armored: &str,
        description: Option<&str>,
    ) -> Result<String, AdminError> {
        let email = email.trim().to_lowercase();
        let result = self
            .call(
                "x:PublicKey/set",
                json!({"accountId": account_id, "create": {"pk1": {
                    "description": description,
                    "key": public_key_armored,
                    "emailAddresses": {&email: true},
                }}}),
                "c1",
            )
            .await?;
        if let Some(id) = result
            .pointer("/created/pk1/id")
            .and_then(Value::as_str)
            .filter(|id| !id.is_empty())
        {
            return Ok(id.to_owned());
        }
        let refused = result.pointer("/notCreated/pk1");
        if let Some(id) = self
            .recover_public_key(account_id, &email, public_key_armored, description, refused)
            .await?
        {
            return Ok(id);
        }
        Err(AdminError::Failed(format!(
            "Stalwart public-key registration failed: {}",
            description_of(refused).unwrap_or("Unknown error")
        )))
    }

    async fn public_keys(&self, account_id: &str) -> Result<Vec<Value>, AdminError> {
        let ids = self
            .ids(
                "x:PublicKey/query",
                json!({"filter": {"accountId": account_id}}),
            )
            .await?;
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        self.list("x:PublicKey/get", ids).await
    }

    /// Adopts the account's key for this address, else its first key, and overwrites it with the new one.
    async fn recover_public_key(
        &self,
        account_id: &str,
        email: &str,
        public_key_armored: &str,
        description: Option<&str>,
        refused: Option<&Value>,
    ) -> Result<Option<String>, AdminError> {
        let keys = self.public_keys(account_id).await?;
        let matching = keys.iter().find(|key| key_matches_email(key, email));
        let key = match matching {
            Some(key) => Some(key),
            None => keys
                .first()
                .filter(|key| str_field(key, "id").is_some())
                .inspect(|key| {
                    tracing::warn!(
                        account_id,
                        recipient_ref = telemetry::log_ref(email),
                        existing_public_key_id = str_field(key, "id"),
                        "Adopting the first Stalwart public key for mailbox recovery"
                    );
                }),
        };
        let Some(key_id) = key
            .and_then(|key| str_field(key, "id"))
            .filter(|id| !id.is_empty())
        else {
            return Ok(None);
        };
        tracing::warn!(
            account_id,
            recipient_ref = telemetry::log_ref(email),
            existing_public_key_id = key_id,
            error_type = refused.and_then(|error| str_field(error, "type")),
            "Stalwart registerPublicKey reported an existing remote key; attempting recovery"
        );
        let result = self
            .call(
                "x:PublicKey/set",
                json!({"accountId": account_id, "update": {key_id: {
                    "description": description,
                    "key": public_key_armored,
                    "emailAddresses": {email: true},
                }}}),
                "c1",
            )
            .await?;
        acknowledged(
            &result,
            key_id,
            "Stalwart public-key update failed during recovery.",
            "Stalwart public-key update was not acknowledged during recovery.",
        )?;
        Ok(Some(key_id.to_owned()))
    }

    /// Encrypts delivered mail to the key at rest, never on append and without spam training.
    pub async fn enable_encryption_at_rest(
        &self,
        account_id: &str,
        public_key_id: &str,
    ) -> Result<(), AdminError> {
        let account = self.account(account_id).await?;
        let current = account.get("encryptionAtRest").unwrap_or(&Value::Null);
        if str_field(current, "@type") == Some("Aes256")
            && str_field(current, "publicKey") == Some(public_key_id)
            && current.get("encryptOnAppend") != Some(&Value::Bool(true))
            && current.get("allowSpamTraining") != Some(&Value::Bool(true))
        {
            return Ok(());
        }
        let result = self
            .call(
                "x:AccountSettings/set",
                json!({"accountId": account_id, "update": {"singleton": {"encryptionAtRest": {
                    "@type": "Aes256",
                    "publicKey": public_key_id,
                    "encryptOnAppend": false,
                    "allowSpamTraining": false,
                }}}}),
                "c1",
            )
            .await?;
        acknowledged(
            &result,
            "singleton",
            "Stalwart encryption-at-rest update failed.",
            "Stalwart encryption-at-rest update was not acknowledged.",
        )
    }

    /// Creates or updates the signed mail-ingest webhook by URL, removes duplicates, then reloads Stalwart's settings.
    pub async fn ensure_mail_ingest_webhook(
        &self,
        url: &str,
        secret: &str,
    ) -> Result<(), AdminError> {
        let ids = self
            .call("x:WebHook/query", json!({}), "q1")
            .await?
            .get("ids")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let wanted = url.trim_end_matches('/');
        let mut existing: Option<String> = None;
        let mut duplicates: Vec<String> = Vec::new();
        if !ids.is_empty() {
            let hooks = list_of(
                &self
                    .call("x:WebHook/get", json!({"ids": ids}), "g1")
                    .await?,
            );
            for hook in &hooks {
                let (Some(id), Some(hook_url)) = (
                    str_field(hook, "id").filter(|id| !id.is_empty()),
                    str_field(hook, "url"),
                ) else {
                    continue;
                };
                if hook_url.trim_end_matches('/') != wanted {
                    continue;
                }
                match &existing {
                    None => existing = Some(id.to_owned()),
                    Some(kept) if kept != id => duplicates.push(id.to_owned()),
                    Some(_) => {}
                }
            }
        }
        if existing.is_none() && ids.contains(&json!(WEBHOOK_ID)) {
            existing = Some(WEBHOOK_ID.to_owned());
        }
        let payload = json!({
            "url": url,
            "enable": true,
            "events": {"message-ingest.ham": true},
            "eventsPolicy": "include",
            "level": "info",
            "throttle": 1000,
            "timeout": 30_000,
            "discardAfter": 300_000,
            "allowInvalidCerts": false,
            "lossy": false,
            "httpHeaders": {"X-Solace-Source": "solace-mail-ingest"},
            "httpAuth": {"@type": "Unauthenticated"},
            "signatureKey": {"@type": "Value", "secret": secret},
        });
        let mut entry = Map::new();
        entry.insert(
            existing.clone().unwrap_or_else(|| WEBHOOK_ID.to_owned()),
            payload,
        );
        let operation = if existing.is_some() {
            "update"
        } else {
            "create"
        };
        let result = self
            .call("x:WebHook/set", json!({operation: entry}), "s1")
            .await?;
        let create_error = result.pointer(&format!("/notCreated/{WEBHOOK_ID}"));
        let update_error = existing
            .as_deref()
            .and_then(|id| result.get("notUpdated")?.get(id));
        let errors = [create_error, update_error];
        if errors.iter().flatten().any(|error| truthy(error)) {
            return Err(AdminError::Failed(
                errors
                    .into_iter()
                    .find_map(description_of)
                    .unwrap_or("Stalwart mail ingest webhook update failed.")
                    .to_owned(),
            ));
        }
        if !duplicates.is_empty() {
            let result = self
                .call("x:WebHook/set", json!({"destroy": duplicates}), "d1")
                .await?;
            if let Some(error) = result
                .get("notDestroyed")
                .and_then(Value::as_object)
                .and_then(|refused| refused.values().next())
                .filter(|error| truthy(error))
            {
                return Err(AdminError::Failed(
                    description_of(Some(error))
                        .unwrap_or("Stalwart duplicate mail ingest webhook cleanup failed.")
                        .to_owned(),
                ));
            }
        }
        self.call(
            "x:Action/set",
            json!({"create": {"reload": {"@type": "ReloadSettings"}}}),
            "r1",
        )
        .await?;
        tracing::info!(
            webhook_ref = telemetry::log_ref(existing.as_deref().unwrap_or(WEBHOOK_ID)),
            "Ensured Stalwart mail ingest webhook"
        );
        Ok(())
    }
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
                Some("Alice Example"),
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
                json!({"list": [{"id": "acct-existing", "name": "alice", "domainId": "domain-1", "emailAddress": "alice@solace.onl"}]}),
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
                Some("Alice Example"),
            )
            .await
            .unwrap();
        assert_eq!(account.account_id, "acct-existing");
        assert!(!account.created);
        let requests = fake.requests();
        assert_eq!(
            requests[1].json()["methodCalls"][0],
            json!(["x:Account/set", {"create": {"user1": {
                "@type": "User", "aliases": {}, "credentials": {},
                "encryptionAtRest": {"@type": "Disabled"}, "memberGroupIds": {},
                "name": "alice", "domainId": "domain-1", "permissions": {"@type": "Inherit"},
                "quotas": {}, "roles": {"@type": "User"}, "description": "Alice Example",
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
                json!({"list": [{"id": "acct-existing", "name": "alice", "domainId": "domain-1", "credentials": {
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
                Some("Alice Example"),
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
    async fn accepts_client_code_auth_responses() {
        let fake = FakeStalwart::scripted(vec![
            Reply::json(json!({"type": "authenticated", "client_code": "client-code-1"})),
            Reply::json(json!({"access_token": "access-token-1", "expires_in": 3600})),
        ])
        .await;
        let pkce = crate::mail::bridge::Pkce {
            verifier: "verifier-1".into(),
            challenge: "challenge-1".into(),
        };
        let token = admin(&fake)
            .issue_oauth_access_token(
                "alice@solace.onl",
                "StrongPassw0rd!",
                "solace-mail-bridge",
                "https://api.solace.test/api/mail/oauth/callback",
                pkce,
            )
            .await
            .unwrap();
        assert_eq!(
            (
                token.access_token.as_str(),
                token.expires_in,
                token.expires_at
            ),
            ("access-token-1", Some(3600), None)
        );
        let requests = fake.requests();
        assert_eq!(requests[0].path, "/api/auth");
        assert_eq!(
            requests[0].authorization, None,
            "the login carries no admin token"
        );
        assert_eq!(
            requests[0].json(),
            json!({"type": "authCode", "accountName": "alice@solace.onl", "accountSecret": "StrongPassw0rd!",
                "clientId": "solace-mail-bridge", "redirectUri": "https://api.solace.test/api/mail/oauth/callback",
                "codeChallenge": "challenge-1", "codeChallengeMethod": "S256"})
        );
        assert_eq!(requests[1].path, "/auth/token");
        assert_eq!(
            requests[1].content_type.as_deref(),
            Some("application/x-www-form-urlencoded")
        );
        assert!(
            requests[1].body.contains("code=client-code-1"),
            "{}",
            requests[1].body
        );
        assert!(requests[1].body.contains("code_verifier=verifier-1"));
    }

    #[tokio::test]
    async fn disables_encrypt_on_append_when_already_enabled() {
        let fake = FakeStalwart::scripted(vec![
            envelope(
                "x:Account/get",
                json!({"list": [{"id": "acct-1", "name": "alice", "domainId": "domain-1", "encryptionAtRest": {
                    "@type": "Aes256", "publicKey": "pk-1", "encryptOnAppend": true, "allowSpamTraining": false,
                }}]}),
                "c1",
            ),
            envelope("x:AccountSettings/set", json!({"updated": {"singleton": null}}), "c1"),
            envelope(
                "x:Account/get",
                json!({"list": [{"id": "acct-1", "encryptionAtRest": {
                    "@type": "Aes256", "publicKey": "pk-1", "encryptOnAppend": false, "allowSpamTraining": false,
                }}]}),
                "c1",
            ),
        ])
        .await;
        admin(&fake)
            .enable_encryption_at_rest("acct-1", "pk-1")
            .await
            .unwrap();
        assert_eq!(
            fake.requests()[1].json()["methodCalls"][0],
            json!(["x:AccountSettings/set", {"accountId": "acct-1", "update": {"singleton": {"encryptionAtRest": {
                "@type": "Aes256", "publicKey": "pk-1", "encryptOnAppend": false, "allowSpamTraining": false,
            }}}}, "c1"])
        );
        admin(&fake)
            .enable_encryption_at_rest("acct-1", "pk-1")
            .await
            .unwrap();
        assert_eq!(
            fake.requests().len(),
            3,
            "an account already set up is left alone"
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

    #[tokio::test]
    async fn creates_the_ingest_webhook_and_reloads_settings() {
        let fake = FakeStalwart::scripted(vec![
            envelope("x:WebHook/query", json!({"ids": []}), "q1"),
            envelope(
                "x:WebHook/set",
                json!({"created": {"solace-inbound-mail": {"id": "hook-1"}}}),
                "s1",
            ),
            envelope(
                "x:Action/set",
                json!({"created": {"reload": {"id": "reload-1"}}}),
                "r1",
            ),
        ])
        .await;
        admin(&fake)
            .ensure_mail_ingest_webhook(
                "https://api.solace.onl/api/internal/stalwart/webhook",
                "shared-secret",
            )
            .await
            .unwrap();
        let requests = fake.requests();
        assert_eq!(requests.len(), 3);
        let hook = &requests[1].json()["methodCalls"][0][1]["create"]["solace-inbound-mail"];
        assert_eq!(
            hook["url"],
            json!("https://api.solace.onl/api/internal/stalwart/webhook")
        );
        assert_eq!(hook["events"], json!({"message-ingest.ham": true}));
        assert_eq!(
            hook["httpHeaders"],
            json!({"X-Solace-Source": "solace-mail-ingest"})
        );
        assert_eq!(
            hook["signatureKey"],
            json!({"@type": "Value", "secret": "shared-secret"})
        );
        assert_eq!(
            requests[2].json()["methodCalls"][0],
            json!(["x:Action/set", {"create": {"reload": {"@type": "ReloadSettings"}}}, "r1"])
        );
    }

    #[tokio::test]
    async fn updates_the_webhook_by_url_and_removes_duplicates() {
        let url = "https://api.solace.onl/api/internal/stalwart/webhook";
        let fake = FakeStalwart::scripted(vec![
            envelope(
                "x:WebHook/query",
                json!({"ids": ["hook-1", "hook-2"]}),
                "q1",
            ),
            envelope(
                "x:WebHook/get",
                json!({"list": [{"id": "hook-1", "url": url}, {"id": "hook-2", "url": url}]}),
                "g1",
            ),
            envelope("x:WebHook/set", json!({"updated": {"hook-1": null}}), "s1"),
            envelope("x:WebHook/set", json!({"destroyed": ["hook-2"]}), "d1"),
            envelope(
                "x:Action/set",
                json!({"created": {"reload": {"id": "reload-1"}}}),
                "r1",
            ),
        ])
        .await;
        admin(&fake)
            .ensure_mail_ingest_webhook(&format!("{url}/"), "shared-secret")
            .await
            .unwrap();
        let requests = fake.requests();
        let update = &requests[2].json()["methodCalls"][0];
        assert_eq!(update[0], json!("x:WebHook/set"));
        assert_eq!(
            update[1]["update"]["hook-1"]["url"],
            json!(format!("{url}/"))
        );
        assert_eq!(update[2], json!("s1"));
        assert_eq!(
            requests[3].json()["methodCalls"][0],
            json!(["x:WebHook/set", {"destroy": ["hook-2"]}, "d1"])
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
}
