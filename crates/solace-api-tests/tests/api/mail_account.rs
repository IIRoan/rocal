//! `/api/mail/account*`, `/api/mail/config`, `/api/mail/keys/:email` and `/api/mail/oauth/access-token`: provisioning, vault backups, the key directory and mail tokens.

use serde_json::{Value, json};
use solace_api_tests::seed::fake_envelope;
use solace_api_tests::webauthn::SoftPasskey;
use solace_api_types::mail::{
    MailAccessToken, MailAccountStatus, MailBootstrapRequest, MailConfig, MailDirectoryKey,
    MailSignup, MailVaultBackup, MailVaultBackupRequest, MailVaultKdfParams,
};

use crate::helpers::{TestApp, TestUser, count, expect_unauthorized, expect_unknown_field, ok};
use crate::mail_support::{
    access_token, bootstrap, bootstrap_request, bridge_secret, kdf_params, mailbox, pgp_key,
    provision, provisioning_turn, row_json, stalwart_account, to_json,
};

const ENTRY_COUNT: &str = "SELECT count(*) FROM mail_directory_entry WHERE user_id = $1";

#[tokio::test]
async fn anonymous_callers_are_refused() {
    let app = TestApp::spawn().await;
    let mut anon = app.anonymous();
    expect_unauthorized(&ok(anon.get("/api/mail/account").await));
    expect_unauthorized(&ok(anon
        .post(
            "/api/mail/account/bootstrap",
            to_json(&bootstrap_request(0)),
        )
        .await));
    expect_unauthorized(&ok(anon.get("/api/mail/account/vault-backup").await));
    let update = MailVaultBackupRequest {
        vault_version: 1,
        encrypted_vault_b64: "dmF1bHQ=".into(),
        kdf: "argon2id".into(),
        kdf_params: kdf_params(),
        wrapped_secret: None,
        wrap_algorithm: None,
    };
    expect_unauthorized(&ok(anon
        .put("/api/mail/account/vault-backup", to_json(&update))
        .await));
    expect_unauthorized(&ok(anon.get("/api/mail/oauth/access-token").await));

    // Body validation runs before the session guard, so a malformed anonymous body gets the Zod answer.
    let malformed = ok(anon
        .put("/api/mail/account/vault-backup", json!({}))
        .await
        .and_then(|r| r.expect_error(400, "Validation Error", "Required")));
    assert_eq!(
        malformed["details"]["issues"][0]["path"],
        json!("vaultVersion")
    );
}

#[tokio::test]
async fn an_invited_account_is_approved_but_not_provisioned() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;

    let status: MailAccountStatus = ok(user
        .get("/api/mail/account")
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        status,
        MailAccountStatus {
            email: user.email.clone(),
            display_name: Some(user.name.clone()),
            provisioned: false,
            mailbox_approved: true,
        }
    );

    ok(user
        .get("/api/mail/account/vault-backup")
        .await
        .expect_error(
            404,
            "Not Found",
            "No encrypted vault backup was found for this mailbox.",
        ));
    let update = MailVaultBackupRequest {
        vault_version: 1,
        encrypted_vault_b64: "dmF1bHQ=".into(),
        kdf: "argon2id".into(),
        kdf_params: kdf_params(),
        wrapped_secret: None,
        wrap_algorithm: None,
    };
    ok(user
        .put("/api/mail/account/vault-backup", to_json(&update))
        .await
        .expect_error(
            404,
            "Not Found",
            "No encrypted vault backup was stored for that mailbox.",
        ));
    let token = ok(user.get("/api/mail/oauth/access-token").await.expect_error(
        400,
        "mail_token_error",
        "This Solace account does not have a provisioned mailbox yet.",
    ));
    assert!(token.get("requestId").is_none(), "{token}");
    assert_eq!(count(&app.db, ENTRY_COUNT, &user.id).await, 0);
}

#[tokio::test]
async fn bootstrap_provisions_an_encrypted_mailbox_linked_to_the_user() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let mut request = bootstrap_request(0);
    let fingerprint = request.fingerprint.clone();
    // Clients may send the fingerprint grouped and lowercased.
    request.fingerprint = fingerprint
        .to_lowercase()
        .as_bytes()
        .chunks(4)
        .map(|chunk| String::from_utf8_lossy(chunk).into_owned())
        .collect::<Vec<_>>()
        .join(" ");

    let signup = provision(&app, &mut user, &request).await;
    let account_id = signup.stalwart_account_id.0.clone();
    assert_eq!(signup.email, user.email);
    assert_eq!(signup.display_name.as_deref(), Some(user.name.as_str()));
    assert_eq!(
        signup.fingerprint, fingerprint,
        "normalized to the key's own"
    );
    assert!(signup.encryption_at_rest_enabled);
    assert!(!account_id.is_empty() && !signup.stalwart_public_key_id.is_empty());

    let (local_part, domain) = user.email.split_once('@').expect("email");
    let entry = row_json(
        &app.db,
        "SELECT to_jsonb(e) - 'id' - 'created_at' - 'updated_at' FROM mail_directory_entry e WHERE user_id = $1",
        &user.id,
    )
    .await;
    assert_eq!(
        entry,
        json!({
            "email": user.email,
            "local_part": local_part,
            "domain": domain,
            "display_name": user.name,
            "stalwart_account_id": account_id,
            "stalwart_domain_id": entry["stalwart_domain_id"],
            "stalwart_public_key_id": signup.stalwart_public_key_id,
            "public_key_armored": request.public_key_armored.trim(),
            "public_key_fingerprint": fingerprint,
            "key_algorithm": "openpgp",
            "source": "internal",
            "trust": "verified",
            "key_created_at": "2026-10-14T13:08:35",
            "user_id": user.id,
        })
    );
    assert!(entry["stalwart_domain_id"].is_string());
    let vault = row_json(
        &app.db,
        "SELECT to_jsonb(v) - 'id' - 'directory_entry_id' - 'created_at' - 'updated_at' FROM mail_vault_backup v \
         JOIN mail_directory_entry e ON e.id = v.directory_entry_id WHERE e.user_id = $1",
        &user.id,
    )
    .await;
    assert_eq!(
        vault,
        json!({
            "vault_version": 1,
            "encrypted_vault_b64": request.encrypted_vault_b64,
            "kdf": "argon2id",
            "kdf_salt_b64": request.kdf_params.salt_b64,
            "kdf_memory_kib": 65_536,
            "kdf_iterations": 3,
            "kdf_parallelism": 1,
            "wrapped_secret": request.wrapped_secret.clone().flatten(),
            "wrap_algorithm": "RSA-OAEP-256",
        })
    );

    let remote = stalwart_account(&app, &account_id)
        .await
        .expect("Stalwart account");
    assert_eq!(remote["name"], json!(local_part));
    assert_eq!(remote["emailAddress"], json!(user.email));
    assert_eq!(
        remote["encryptionAtRest"],
        json!({"@type": "Aes256", "publicKey": signup.stalwart_public_key_id, "encryptOnAppend": false, "allowSpamTraining": false}),
        "delivered mail is encrypted to the user's key"
    );

    let status: MailAccountStatus = ok(user.get("/api/mail/account").await.dto());
    assert!(status.provisioned && status.mailbox_approved);

    let key: MailDirectoryKey = ok(app
        .anonymous()
        .get(&format!("/api/mail/keys/{}", user.email.to_uppercase()))
        .await
        .and_then(|r| r.expect_status(200))
        .and_then(|r| r.dto()));
    assert_eq!(
        key,
        MailDirectoryKey {
            email: user.email.clone(),
            public_key_armored: request.public_key_armored.trim().to_owned(),
            fingerprint: fingerprint.clone(),
            source: "internal".into(),
            trust: "verified".into(),
        }
    );

    let again = ok(user
        .post(
            "/api/mail/account/bootstrap",
            to_json(&bootstrap_request(1)),
        )
        .await
        .expect_error(
            400,
            "Validation Error",
            "A mailbox has already been provisioned for this account.",
        ));
    assert_eq!(again["details"], json!({"field": "email"}));
    assert_eq!(count(&app.db, ENTRY_COUNT, &user.id).await, 1);
}

#[tokio::test]
async fn bootstrap_requires_a_vault_secret_sealed_to_the_account_key() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    for wrapped_secret in [None, Some(None), Some(Some("   ".to_owned()))] {
        let mut request = bootstrap_request(0);
        request.wrapped_secret = wrapped_secret.clone();
        let error = ok(user
            .post("/api/mail/account/bootstrap", to_json(&request))
            .await
            .expect_error(
                400,
                "Validation Error",
                "A vault secret sealed to your account key is required.",
            ));
        assert_eq!(
            error["details"],
            json!({"field": "wrappedSecret"}),
            "{wrapped_secret:?}"
        );
    }
    assert_eq!(count(&app.db, ENTRY_COUNT, &user.id).await, 0);
}

#[tokio::test]
async fn unapproved_accounts_cannot_bootstrap() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    sqlx::query("UPDATE \"user\" SET mailbox_approved_at = NULL WHERE id = $1")
        .bind(&user.id)
        .execute(&app.db)
        .await
        .expect("revoke approval");

    let status: MailAccountStatus = ok(user.get("/api/mail/account").await.dto());
    assert!(!status.mailbox_approved && !status.provisioned);

    let mut request = bootstrap_request(0);
    request.wrapped_secret = None;
    let error = ok(user
        .post("/api/mail/account/bootstrap", to_json(&request))
        .await
        .expect_error(
            403,
            "Forbidden",
            "This account is not approved for a mailbox yet.",
        ));
    assert!(error["requestId"].is_string(), "approval is checked first");
    assert_eq!(count(&app.db, ENTRY_COUNT, &user.id).await, 0);
}

#[tokio::test]
async fn bootstrap_rejects_invalid_bodies_with_the_zod_message() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let base = to_json(&bootstrap_request(0));
    let with = |patch: Value| {
        let mut body = base.clone();
        for (key, value) in patch.as_object().expect("patch").clone() {
            if key == "kdfParams" {
                for (inner, value) in value.as_object().expect("kdf patch").clone() {
                    body["kdfParams"][inner] = value;
                }
            } else {
                body[key] = value;
            }
        }
        body
    };
    let mut missing = base.clone();
    missing
        .as_object_mut()
        .expect("body")
        .remove("publicKeyArmored");
    let cases = [
        (missing, "Required", "publicKeyArmored"),
        (
            with(json!({"fingerprint": "ABCDEF"})),
            "String must contain at least 16 character(s)",
            "fingerprint",
        ),
        (
            with(json!({"vaultVersion": 11})),
            "Number must be less than or equal to 10",
            "vaultVersion",
        ),
        (
            with(json!({"vaultVersion": 1.5})),
            "Expected integer, received float",
            "vaultVersion",
        ),
        (
            with(json!({"encryptedVaultB64": ""})),
            "String must contain at least 1 character(s)",
            "encryptedVaultB64",
        ),
        (
            with(json!({"kdfParams": {"memoryKiB": 4096}})),
            "Number must be greater than or equal to 8192",
            "kdfParams.memoryKiB",
        ),
        (
            with(json!({"kdfParams": {"iterations": 5}})),
            "Number must be less than or equal to 4",
            "kdfParams.iterations",
        ),
        (
            with(json!({"kdfParams": {"parallelism": 0}})),
            "Number must be greater than or equal to 1",
            "kdfParams.parallelism",
        ),
        (
            with(json!({"kdfParams": {"pepper": "x"}})),
            "Unrecognized key(s) in object: 'pepper'",
            "kdfParams",
        ),
        (
            with(json!({"wrappedSecret": ""})),
            "String must contain at least 1 character(s)",
            "wrappedSecret",
        ),
        (
            with(json!({"wrapAlgorithm": 7})),
            "Expected string, received number",
            "wrapAlgorithm",
        ),
        (
            with(json!({"algorithm": "x".repeat(33)})),
            "String must contain at most 32 character(s)",
            "algorithm",
        ),
    ];
    for (body, message, path) in cases {
        let error = user
            .post("/api/mail/account/bootstrap", body)
            .await
            .expect_error(400, "Validation Error", message)
            .unwrap_or_else(|e| panic!("{path}: {e}"));
        assert_eq!(
            error["details"]["issues"][0]["path"],
            json!(path),
            "{error}"
        );
    }
    for forged in ["userId", "email", "displayName"] {
        let response = user
            .post(
                "/api/mail/account/bootstrap",
                with(json!({forged: "someone-else@solace.test"})),
            )
            .await;
        expect_unknown_field(&response, forged);
    }
    assert_eq!(count(&app.db, ENTRY_COUNT, &user.id).await, 0);
}

#[tokio::test]
async fn bootstrap_service_rules_reject_unusable_keys_and_vaults() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let (other_key, _) = pgp_key(1);
    type Change = fn(&mut MailBootstrapRequest, &str);
    let cases: [(Change, &str, &str); 8] = [
        (
            |r, _| r.kdf = "scrypt".into(),
            "Mail vault backups must use Argon2id.",
            "kdf",
        ),
        (
            |r, _| r.algorithm = "rsa".into(),
            "Only OpenPGP mailbox keys are supported by this demo.",
            "algorithm",
        ),
        (
            |r, _| r.created_at = "last tuesday".into(),
            "Key creation time must be a valid ISO date.",
            "createdAt",
        ),
        (
            |r, _| r.public_key_armored = "   ".into(),
            "A public key is required.",
            "publicKeyArmored",
        ),
        (
            |r, _| r.encrypted_vault_b64 = "  ".into(),
            "An encrypted vault backup is required.",
            "encryptedVaultB64",
        ),
        (
            |r, _| r.kdf_params.salt_b64 = " ".into(),
            "Vault salt is required.",
            "kdfParams.saltB64",
        ),
        (
            |r, _| r.public_key_armored = "not an OpenPGP key".into(),
            "The submitted public key could not be parsed as OpenPGP.",
            "publicKeyArmored",
        ),
        (
            |r, other| r.public_key_armored = other.to_owned(),
            "The submitted public-key fingerprint does not match the uploaded key.",
            "fingerprint",
        ),
    ];
    for (change, message, field) in cases {
        let mut request = bootstrap_request(0);
        change(&mut request, &other_key);
        let error = user
            .post("/api/mail/account/bootstrap", to_json(&request))
            .await
            .expect_error(400, "Validation Error", message)
            .unwrap_or_else(|e| panic!("{field}: {e}"));
        assert_eq!(error["details"], json!({"field": field}), "{message}");
    }
    assert_eq!(count(&app.db, ENTRY_COUNT, &user.id).await, 0);
}

#[tokio::test]
async fn an_incomplete_mailbox_is_repaired_by_a_second_bootstrap() {
    let app = TestApp::spawn().await;
    let mut owner = mailbox(&app).await;
    sqlx::query(
        "DELETE FROM mail_vault_backup WHERE directory_entry_id = \
         (SELECT id FROM mail_directory_entry WHERE user_id = $1)",
    )
    .bind(&owner.user.id)
    .execute(&app.db)
    .await
    .expect("drop the vault");
    ok(owner
        .user
        .get("/api/mail/account/vault-backup")
        .await
        .expect_error(
            404,
            "Not Found",
            "No encrypted vault backup was found for this mailbox.",
        ));

    let request = bootstrap_request(2);
    let turn = provisioning_turn().await;
    let repaired: MailSignup = ok(bootstrap(&mut owner.user, &request)
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    drop(turn);
    assert_eq!(
        repaired.stalwart_account_id, owner.signup.stalwart_account_id,
        "the Stalwart account is reused"
    );
    assert_eq!(repaired.fingerprint, request.fingerprint);
    assert_eq!(count(&app.db, ENTRY_COUNT, &owner.user.id).await, 1);

    let vault: MailVaultBackup = ok(owner.user.get("/api/mail/account/vault-backup").await.dto());
    assert_eq!(vault.encrypted_vault_b64, request.encrypted_vault_b64);
    let fingerprint: String = sqlx::query_scalar(
        "SELECT public_key_fingerprint FROM mail_directory_entry WHERE user_id = $1",
    )
    .bind(&owner.user.id)
    .fetch_one(&app.db)
    .await
    .expect("entry");
    assert_eq!(
        fingerprint, request.fingerprint,
        "the new key replaces the old"
    );
    let remote = stalwart_account(&app, owner.account_id())
        .await
        .expect("Stalwart account");
    assert_eq!(
        remote["encryptionAtRest"]["publicKey"],
        json!(repaired.stalwart_public_key_id)
    );
}

#[tokio::test]
async fn vault_backups_round_trip_and_keep_the_seal_unless_replaced() {
    let app = TestApp::spawn().await;
    let mut owner = mailbox(&app).await;
    let stored: MailVaultBackup = ok(owner
        .user
        .get("/api/mail/account/vault-backup")
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(stored.email, owner.user.email);
    assert_eq!(stored.vault_version, 1);
    let seal = stored.wrapped_secret.clone().expect("sealed at bootstrap");

    let mut update = MailVaultBackupRequest {
        vault_version: 2,
        encrypted_vault_b64: "  bmV3IHZhdWx0  ".into(),
        kdf: " ARGON2ID ".into(),
        kdf_params: kdf_params(),
        wrapped_secret: None,
        wrap_algorithm: None,
    };
    update.kdf_params.salt_b64 = format!(" {} ", update.kdf_params.salt_b64);
    let updated: MailVaultBackup = ok(owner
        .user
        .put("/api/mail/account/vault-backup", to_json(&update))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        updated,
        MailVaultBackup {
            email: owner.user.email.clone(),
            vault_version: 2,
            encrypted_vault_b64: "bmV3IHZhdWx0".into(),
            kdf: "argon2id".into(),
            kdf_params: MailVaultKdfParams {
                salt_b64: update.kdf_params.salt_b64.trim().to_owned(),
                ..update.kdf_params.clone()
            },
            wrapped_secret: Some(seal.clone()),
            wrap_algorithm: Some("RSA-OAEP-256".into()),
        },
        "an omitted seal is kept"
    );

    update.wrapped_secret = Some(None);
    update.wrap_algorithm = Some(None);
    let nulled: MailVaultBackup = ok(owner
        .user
        .put("/api/mail/account/vault-backup", to_json(&update))
        .await
        .dto());
    assert_eq!(
        (
            nulled.wrapped_secret.as_deref(),
            nulled.wrap_algorithm.as_deref()
        ),
        (Some(seal.as_str()), Some("RSA-OAEP-256")),
        "null never unseals a vault"
    );

    let new_seal = fake_envelope();
    update.wrapped_secret = Some(Some(new_seal.clone()));
    update.wrap_algorithm = Some(Some("AES-GCM-256".into()));
    let resealed: MailVaultBackup = ok(owner
        .user
        .put("/api/mail/account/vault-backup", to_json(&update))
        .await
        .dto());
    assert_eq!(resealed.wrapped_secret, Some(new_seal.clone()));
    let row: (i32, String, Option<String>, Option<String>) = sqlx::query_as(
        "SELECT v.vault_version, v.kdf, v.wrapped_secret, v.wrap_algorithm FROM mail_vault_backup v \
         JOIN mail_directory_entry e ON e.id = v.directory_entry_id WHERE e.user_id = $1",
    )
    .bind(&owner.user.id)
    .fetch_one(&app.db)
    .await
    .expect("vault row");
    assert_eq!(
        row,
        (
            2,
            "argon2id".into(),
            Some(new_seal),
            Some("AES-GCM-256".into())
        )
    );

    let mut bad = to_json(&update);
    bad["kdf"] = json!("pbkdf2");
    let error = ok(owner
        .user
        .put("/api/mail/account/vault-backup", bad)
        .await
        .expect_error(
            400,
            "Validation Error",
            "Mail vault backups must use Argon2id.",
        ));
    assert_eq!(error["details"], json!({"field": "kdf"}));
    let mut forged = to_json(&update);
    forged["userId"] = json!("someone-else");
    expect_unknown_field(
        &owner
            .user
            .put("/api/mail/account/vault-backup", forged)
            .await,
        "userId",
    );
    let mut forged = to_json(&update);
    forged["email"] = json!("someone-else@solace.test");
    expect_unknown_field(
        &owner
            .user
            .put("/api/mail/account/vault-backup", forged)
            .await,
        "email",
    );
}

#[tokio::test]
async fn mailboxes_resolve_by_owner_and_never_attach_to_another_account() {
    let app = TestApp::spawn().await;
    let mut owner = mailbox(&app).await;
    let mut other = app.user().await;

    let other_status: MailAccountStatus = ok(other.get("/api/mail/account").await.dto());
    assert!(
        !other_status.provisioned,
        "another user's mailbox is not theirs"
    );
    ok(other
        .get("/api/mail/account/vault-backup")
        .await
        .expect_status(404));

    // An unlinked directory entry carrying the user's address is attached on the next read.
    sqlx::query("UPDATE mail_directory_entry SET user_id = NULL WHERE user_id = $1")
        .bind(&owner.user.id)
        .execute(&app.db)
        .await
        .expect("unlink");
    let status: MailAccountStatus = ok(owner.user.get("/api/mail/account").await.dto());
    assert!(status.provisioned);
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM mail_directory_entry WHERE stalwart_account_id = $1 AND user_id IS NOT NULL",
            owner.account_id()
        )
        .await,
        1
    );
    assert_eq!(count(&app.db, ENTRY_COUNT, &owner.user.id).await, 1);

    // The owner's entry now claims the other user's address.
    let (local_part, _) = other.email.split_once('@').expect("email");
    sqlx::query("UPDATE mail_directory_entry SET email = $2, local_part = $3 WHERE user_id = $1")
        .bind(&owner.user.id)
        .bind(&other.email)
        .bind(local_part)
        .execute(&app.db)
        .await
        .expect("rename entry");
    let linked_elsewhere = "That mailbox is already linked to another Solace account.";
    for response in [
        other.get("/api/mail/account").await,
        other.get("/api/mail/account/vault-backup").await,
        other
            .post(
                "/api/mail/account/bootstrap",
                to_json(&bootstrap_request(3)),
            )
            .await,
    ] {
        let error = ok(response.expect_error(400, "Validation Error", linked_elsewhere));
        assert_eq!(error["details"], json!({"field": "email"}));
    }
    ok(other
        .get("/api/mail/oauth/access-token")
        .await
        .expect_error(400, "mail_token_error", linked_elsewhere));
    assert_eq!(count(&app.db, ENTRY_COUNT, &other.id).await, 0);

    let status: MailAccountStatus = ok(owner.user.get("/api/mail/account").await.dto());
    assert_eq!(
        (status.email.as_str(), status.provisioned),
        (other.email.as_str(), true),
        "the owner still resolves the entry by user id"
    );
    let key: MailDirectoryKey = ok(app
        .anonymous()
        .get(&format!("/api/mail/keys/{}", owner.user.email))
        .await
        .and_then(|r| r.expect_status(200))
        .and_then(|r| r.dto()));
    assert_eq!(
        key.email, other.email,
        "a login address without an entry falls back to its user's linked entry"
    );

    // The renamed entry no longer matches its bridge password; receipt polling would retry that failed login every 10 s.
    sqlx::query("DELETE FROM mail_directory_entry WHERE user_id = $1")
        .bind(&owner.user.id)
        .execute(&app.db)
        .await
        .expect("drop the renamed entry");
}

#[tokio::test]
async fn mail_tokens_are_stalwart_bearers_for_the_users_own_mailbox() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let turn = provisioning_turn().await;
    // No preset bridge password: the first mint logs in, is refused, sets the derived password and retries.
    let signup: MailSignup = ok(bootstrap(&mut user, &bootstrap_request(3))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    let account_id = signup.stalwart_account_id.0;

    let before = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("clock")
        .as_secs();
    let token: MailAccessToken = access_token(&mut user).await;
    drop(turn);
    assert!(!token.access_token.is_empty());
    assert!(token.expires_in > 60, "{token:?}");
    assert!(
        token.expires_at + 5 >= before + token.expires_in
            && token.expires_at <= before + token.expires_in + 300,
        "{token:?}"
    );
    let again = access_token(&mut user).await;
    assert_eq!(again, token, "a valid token is reused, not reminted");

    let stalwart = reqwest::Client::new();
    let session: Value = stalwart
        .get(format!("{}/jmap/session", app.env.stalwart_url))
        .bearer_auth(&token.access_token)
        .send()
        .await
        .expect("Stalwart session")
        .json()
        .await
        .expect("session JSON");
    assert_eq!(session["username"], json!(user.email));
    assert_eq!(
        session["accounts"]
            .as_object()
            .map(|a| a.keys().cloned().collect::<Vec<_>>()),
        Some(vec![account_id.clone()]),
        "the bearer opens only this mailbox"
    );

    // The bridge password is the HMAC derivation the next backend must reproduce exactly.
    let secret = bridge_secret(&app.env.mail_bridge_hmac_key, &user.id, &user.email);
    let basic: Value = stalwart
        .get(format!("{}/jmap/session", app.env.stalwart_url))
        .basic_auth(&user.email, Some(&secret))
        .send()
        .await
        .expect("Stalwart session")
        .json()
        .await
        .expect("session JSON");
    assert_eq!(basic["username"], json!(user.email), "{basic}");
}

#[tokio::test]
async fn passkey_step_up_gates_the_mail_token_but_not_the_proxy() {
    let app = TestApp::spawn().await;
    let mut owner = mailbox(&app).await;
    let mut passkey = register_passkey(&app, &mut owner.user).await;

    let mut password_session = signed_in(&app, &owner.user).await;
    let error = ok(password_session
        .get("/api/mail/oauth/access-token")
        .await
        .expect_error(403, "Forbidden", "Passkey verification required."));
    assert_eq!(
        error["details"],
        json!({"code": "PASSKEY_STEP_UP_REQUIRED"})
    );
    assert!(error.get("requestId").is_none(), "{error}");
    ok(password_session
        .get("/api/mail/account")
        .await
        .expect_status(403));

    // Pinned gap: the proxy mints from the bare session without the step-up check.
    let discovery = ok(password_session
        .get("/api/mail/jmap/.well-known/jmap")
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    assert_eq!(discovery["username"], json!(owner.user.email));

    let mut stepped_up = app.anonymous();
    ok(solace_api_tests::seed::passkey_sign_in(&mut stepped_up, &mut passkey, &app.origin).await);
    let token: MailAccessToken = ok(stepped_up
        .get("/api/mail/oauth/access-token")
        .await
        .and_then(|r| r.expect_status(200))
        .and_then(|r| r.dto()));
    assert!(!token.access_token.is_empty());
}

#[tokio::test]
async fn mail_config_is_public() {
    let app = TestApp::spawn().await;
    let config: MailConfig = ok(app
        .anonymous()
        .get("/api/mail/config")
        .await
        .and_then(|r| r.expect_status(200))
        .and_then(|r| r.dto()));
    assert_eq!(config.default_domain, app.env.mail_domain);
    assert_eq!(
        config.discovery_base_url,
        format!("{}/api/mail/jmap", app.base_url)
    );
    assert!(config.signup_enabled);
    assert_eq!(
        config.oauth.mail_token_endpoint,
        format!("{}/api/mail/oauth/access-token", app.base_url)
    );
    let limits = config.server_limits.expect("Stalwart limits");
    assert!(limits.max_blob_upload_bytes.unwrap_or_default() > 0);
    let roles: Vec<_> = limits
        .default_folders
        .unwrap_or_default()
        .into_iter()
        .map(|folder| folder.role)
        .collect();
    for role in ["inbox", "drafts", "sent", "trash"] {
        assert!(roles.iter().any(|r| r == role), "{role} in {roles:?}");
    }
}

#[tokio::test]
async fn unknown_addresses_have_no_directory_key() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let missing = "No internal public key was found for that email.";
    for path in [
        format!(
            "/api/mail/keys/nobody-{}@{}",
            crate::helpers::hex(4),
            app.env.mail_domain
        ),
        "/api/mail/keys/not-an-address".to_owned(),
        format!("/api/mail/keys/{}", user.email),
    ] {
        ok(app
            .anonymous()
            .get(&path)
            .await
            .and_then(|r| r.expect_error(404, "Not Found", missing)));
        ok(user
            .get(&path)
            .await
            .expect_error(404, "Not Found", missing));
    }
    ok(user
        .get("/api/mail/keys/someone@example.com")
        .await
        .expect_error(404, "Not Found", missing));
}

#[tokio::test]
async fn signed_in_callers_resolve_a_missing_directory_entry_from_stalwart() {
    let app = TestApp::spawn().await;
    let owner = mailbox(&app).await;
    let mut sender = app.user().await;
    let (armored, fingerprint) = pgp_key(owner_key_index(&owner.signup.fingerprint));
    sqlx::query("DELETE FROM mail_directory_entry WHERE user_id = $1")
        .bind(&owner.user.id)
        .execute(&app.db)
        .await
        .expect("drop the directory entry");
    let path = format!("/api/mail/keys/{}", owner.user.email);

    ok(app.anonymous().get(&path).await.and_then(|r| {
        r.expect_error(
            404,
            "Not Found",
            "No internal public key was found for that email.",
        )
    }));
    let key: MailDirectoryKey = ok(sender
        .get(&path)
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        key,
        MailDirectoryKey {
            email: owner.user.email.clone(),
            public_key_armored: armored.trim().to_owned(),
            fingerprint,
            source: "internal".into(),
            trust: "verified".into(),
        }
    );
}

#[tokio::test]
async fn deleting_the_account_removes_the_mailbox_from_stalwart() {
    let app = TestApp::spawn().await;
    let mut owner = mailbox(&app).await;
    let account_id = owner.account_id().to_owned();
    assert!(stalwart_account(&app, &account_id).await.is_some());

    ok(owner.user.delete("/api/account").await.expect_status(200));

    assert_eq!(count(&app.db, ENTRY_COUNT, &owner.user.id).await, 0);
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM mail_directory_entry WHERE stalwart_account_id = $1",
            &account_id
        )
        .await,
        0
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM mail_jmap_sync_state WHERE stalwart_account_id = $1",
            &account_id
        )
        .await,
        0
    );
    assert!(
        stalwart_account(&app, &account_id).await.is_none(),
        "the Stalwart account is destroyed"
    );
}

/// Which fixture key a fingerprint belongs to.
fn owner_key_index(fingerprint: &str) -> usize {
    (0..4)
        .find(|index| pgp_key(*index).1 == fingerprint)
        .expect("fixture fingerprint")
}

async fn register_passkey(app: &TestApp, user: &mut TestUser) -> SoftPasskey {
    let rp_id = url::Url::parse(&app.origin)
        .ok()
        .and_then(|url| url.host_str().map(str::to_owned))
        .unwrap_or_else(|| "localhost".into());
    let mut passkey = ok(SoftPasskey::new(&rp_id));
    let options = ok(user
        .get("/api/auth/passkey/generate-register-options")
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    let response = ok(passkey.register(&options, &app.origin));
    ok(user
        .post(
            "/api/auth/passkey/verify-registration",
            json!({"response": response, "name": "Suite passkey"}),
        )
        .await
        .expect_status(200));
    passkey
}

async fn signed_in(app: &TestApp, user: &TestUser) -> TestUser {
    let mut agent = app.anonymous();
    ok(agent
        .post(
            "/api/auth/sign-in/email",
            json!({"email": user.email, "password": user.password}),
        )
        .await
        .and_then(|r| r.expect_status(200)));
    TestUser {
        agent,
        id: user.id.clone(),
        email: user.email.clone(),
        password: user.password.clone(),
        name: user.name.clone(),
    }
}
