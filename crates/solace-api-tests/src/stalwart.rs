//! The test Stalwart's provisioning key: the registry-scoped API key the backend provisions with.

use serde_json::{Value, json};

use crate::env::TestEnv;
use crate::{Error, Result};

/// The capabilities of Stalwart's registry methods (`x:`).
pub const REGISTRY: [&str; 2] = ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"];

/// Stalwart reveals a key once and allows five per account, so the key is cached and only re-minted when it stops working.
pub async fn provision_key(env: &TestEnv) -> Result<String> {
    let host = url_host_port(&env.stalwart_url);
    // Shared by every checkout and worktree, so one checkout never revokes the key another backend runs with.
    let data_dir = match std::env::var("XDG_DATA_HOME") {
        Ok(path) => std::path::PathBuf::from(path),
        Err(_) => std::path::PathBuf::from(
            std::env::var("HOME").map_err(|_| Error::Unexpected("HOME is not set".into()))?,
        )
        .join(".local/share"),
    };
    let cache = data_dir.join(format!("solace-test-tools/provision-keys/{host}"));
    if let Ok(key) = std::fs::read_to_string(&cache) {
        let mut request = reqwest::Client::new()
            .get(format!("{}/jmap/session", env.stalwart_url))
            .bearer_auth(key.trim());
        if let Some(gate) = &env.stalwart_gate_key {
            request = request.header("X-Solace-Gate", gate);
        }
        if request.send().await?.status().is_success() {
            return Ok(key.trim().to_owned());
        }
    }
    let key = mint_provision_key(env).await?;
    if let Some(dir) = cache.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(&cache, &key)?;
    Ok(key)
}

pub fn url_host_port(url: &str) -> String {
    url.split("://")
        .nth(1)
        .unwrap_or(url)
        .split('/')
        .next()
        .unwrap_or_default()
        .replace([':', '.'], "_")
}

async fn mint_provision_key(env: &TestEnv) -> Result<String> {
    let response = admin_jmap(
        env,
        &REGISTRY,
        json!([
            ["x:Account/query", {"filter": {"name": "solace-provisioner"}}, "q"]
        ]),
    )
    .await?;
    let account_id = response["methodResponses"][0][1]["ids"][0]
        .as_str()
        .ok_or_else(|| {
            Error::Unexpected(
                "solace-provisioner account missing; is the test plan applied?".into(),
            )
        })?
        .to_owned();
    let create = json!(["x:ApiKey/set", {
        "accountId": account_id,
        "create": {"k": {"description": "solace-test-provision", "permissions": {"@type": "Inherit"}}}
    }, "s"]);
    let response = admin_jmap(env, &REGISTRY, json!([create.clone()])).await?;
    if let Some(secret) = response["methodResponses"][0][1]["created"]["k"]["secret"].as_str() {
        return Ok(secret.to_owned());
    }
    // Only at the five-key quota are old keys revoked, since running backends may still hold them.
    if response["methodResponses"][0][1]["notCreated"]["k"]["type"] != json!("overQuota") {
        return Err(Error::Unexpected(format!(
            "API key not created: {response}"
        )));
    }
    let existing = admin_jmap(
        env,
        &REGISTRY,
        json!([["x:ApiKey/query", {"accountId": account_id}, "q"]]),
    )
    .await?;
    let existing = existing["methodResponses"][0][1]["ids"].clone();
    let response = admin_jmap(
        env,
        &REGISTRY,
        json!([["x:ApiKey/set", {"accountId": account_id, "destroy": existing}, "d"], create]),
    )
    .await?;
    response["methodResponses"][1][1]["created"]["k"]["secret"]
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| Error::Unexpected(format!("API key not created: {response}")))
}

/// Admin JMAP on the test Stalwart, for setup and inspection only.
pub async fn admin_jmap(env: &TestEnv, using: &[&str], method_calls: Value) -> Result<Value> {
    let mut request = reqwest::Client::new()
        .post(format!("{}/jmap/", env.stalwart_url))
        .basic_auth("admin", Some(&env.stalwart_admin_password));
    if let Some(key) = &env.stalwart_gate_key {
        request = request.header("X-Solace-Gate", key);
    }
    let response = request
        .json(&json!({"using": using, "methodCalls": method_calls}))
        .send()
        .await?
        .error_for_status()?;
    Ok(response.json().await?)
}
