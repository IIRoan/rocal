//! The linked Stalwart account, removed through the registry with the provisioning token; the full admin client joins with the mail sub-step.

use axum::http::StatusCode;
use serde_json::{Value, json};
use thiserror::Error;

use crate::db::entities::mail_directory_entry;
use crate::error::AppError;
use crate::state::AppState;
use crate::telemetry;

const USING: [&str; 2] = ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"];

#[derive(Debug, Error)]
pub enum AdminError {
    #[error("Stalwart admin JMAP request failed: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Stalwart admin JMAP request failed with status {0}.")]
    Status(u16),
    #[error("Stalwart JMAP response did not include {0}.")]
    MissingMethod(&'static str),
    #[error("Stalwart account deletion requires a non-empty account id.")]
    EmptyAccountId,
    #[error("Stalwart account deletion failed.")]
    NotDestroyed,
    #[error("Stalwart account deletion was not acknowledged.")]
    Unacknowledged,
    #[error("Stalwart account was not found.")]
    AccountNotFound,
}

pub struct Admin<'a> {
    state: &'a AppState,
}

impl<'a> Admin<'a> {
    pub fn new(state: &'a AppState) -> Self {
        Self { state }
    }

    /// One method call; a body that is not a JMAP envelope counts as missing the method, as `parseStalwartJmapEnvelope` did.
    async fn call(&self, method: &'static str, arguments: Value) -> Result<Value, AdminError> {
        let url = format!(
            "{}/jmap/",
            self.state.config.stalwart_base_url.trim_end_matches('/')
        );
        let request = self
            .state
            .http
            .post(&url)
            .bearer_auth(self.state.config.stalwart_provision_token.trim())
            .json(&json!({"using": USING, "methodCalls": [[method, arguments, "c1"]]}));
        let response = self.state.stalwart_gate.apply(request, &url).send().await?;
        if !response.status().is_success() {
            return Err(AdminError::Status(response.status().as_u16()));
        }
        let envelope: Value = response.json().await?;
        envelope
            .get("methodResponses")
            .and_then(Value::as_array)
            .and_then(|responses| {
                responses
                    .iter()
                    .find(|r| r.get(0).and_then(Value::as_str) == Some(method))
            })
            .and_then(|r| r.get(1))
            .cloned()
            .ok_or(AdminError::MissingMethod(method))
    }

    async fn account(&self, account_id: &str) -> Result<Option<Value>, AdminError> {
        let result = self
            .call("x:Account/get", json!({"ids": [account_id]}))
            .await?;
        Ok(result.pointer("/list/0").cloned())
    }

    /// The account holding `local_part` in the domain, confirmed against its stored name and domain.
    pub async fn resolve_account_id_by_mailbox(
        &self,
        local_part: &str,
        domain_id: &str,
    ) -> Result<Option<String>, AdminError> {
        let local_part = local_part.trim().to_lowercase();
        let result = self
            .call(
                "x:Account/query",
                json!({"filter": {"name": local_part, "domainId": domain_id}}),
            )
            .await?;
        let Some(id) = result.pointer("/ids/0").and_then(Value::as_str) else {
            return Ok(None);
        };
        let account = self.account(id).await?.ok_or(AdminError::AccountNotFound)?;
        let field = |name: &str| account.get(name).and_then(Value::as_str);
        let matches = field("name").map(|name| name.trim().to_lowercase()) == Some(local_part)
            && field("domainId") == Some(domain_id);
        Ok(matches.then(|| field("id").unwrap_or(id).to_owned()))
    }

    pub async fn delete_account(&self, account_id: &str) -> Result<(), AdminError> {
        let account_id = account_id.trim();
        if account_id.is_empty() {
            return Err(AdminError::EmptyAccountId);
        }
        let result = self
            .call("x:Account/set", json!({"destroy": [account_id]}))
            .await?;
        if result
            .get("notDestroyed")
            .and_then(|refused| refused.get(account_id))
            .is_some_and(|error| !error.is_null())
        {
            return Err(AdminError::NotDestroyed);
        }
        let destroyed = result
            .get("destroyed")
            .and_then(Value::as_array)
            .is_some_and(|ids| ids.iter().any(|id| id.as_str() == Some(account_id)));
        if destroyed || self.account(account_id).await?.is_none() {
            return Ok(());
        }
        Err(AdminError::Unacknowledged)
    }
}

/// `purgeLinkedStalwartMailbox`: the linked account, then whatever account still holds the mailbox name.
pub async fn purge(
    state: &AppState,
    mailbox: &mail_directory_entry::Model,
) -> Result<(), AppError> {
    let admin = Admin::new(state);
    let outcome = async {
        let linked = mailbox.stalwart_account_id.trim();
        if !linked.is_empty() {
            admin.delete_account(linked).await?;
        }
        if let Some(remote) = admin
            .resolve_account_id_by_mailbox(&mailbox.local_part, &mailbox.stalwart_domain_id)
            .await?
        {
            let remote = remote.trim();
            if !remote.is_empty() && remote != linked {
                admin.delete_account(remote).await?;
            }
        }
        Ok::<_, AdminError>(())
    }
    .await;
    outcome.map_err(|error| {
        tracing::error!(
            recipient_ref = telemetry::log_ref(&mailbox.email),
            stalwart_account_id = mailbox.stalwart_account_id,
            error = %telemetry::redact_pii(&error.to_string()),
            "Failed to delete linked Stalwart account during Solace account deletion"
        );
        AppError::Upstream {
            status: StatusCode::SERVICE_UNAVAILABLE,
            message: "Could not delete the linked Stalwart mailbox. Try again in a moment.".into(),
        }
    })
}
