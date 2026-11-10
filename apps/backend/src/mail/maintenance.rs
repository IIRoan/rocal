//! Bounded metadata checks and removal of attributable, denied mailbox stages with no committed directory entry.

use serde_json::Value;

use super::{bridge, queries, service};
use crate::error::AppError;
use crate::instant;
use crate::integrations::stalwart::admin::{Admin, AdminError, managed_marker, receiving_denied};
use crate::state::AppState;

pub mod monitor;
mod monitor_store;

pub const STAGED_RETENTION_HOURS: i64 = 24;

#[derive(Default, Debug)]
pub struct Report {
    pub staged_deleted: u64,
    pub checked: u64,
    pub drifted: u64,
    pub near_expiry: u64,
    pub incomplete: bool,
    next_cursor: Option<String>,
    cycle_complete: bool,
}

enum CheckFailure {
    Drift,
    Unavailable,
    ExpiredKey,
}

impl From<AdminError> for CheckFailure {
    fn from(error: AdminError) -> Self {
        match error {
            AdminError::PolicyDrift | AdminError::LoginRejected | AdminError::OwnerAuthRefused => {
                Self::Drift
            }
            AdminError::ExpiredKey => Self::ExpiredKey,
            _ => Self::Unavailable,
        }
    }
}
impl From<sea_orm::DbErr> for CheckFailure {
    fn from(_: sea_orm::DbErr) -> Self {
        Self::Unavailable
    }
}

pub fn start(state: AppState) -> tokio::task::JoinHandle<()> {
    monitor::start(state)
}

fn marker_owner<'a>(account: &'a Value, prefix: &str) -> Option<&'a str> {
    account["description"]
        .as_str()?
        .strip_prefix(prefix)
        .filter(|owner| {
            !owner.is_empty()
                && owner.len() <= 200
                && owner
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
        })
}

fn owner_id(account: &Value) -> Option<&str> {
    marker_owner(account, "Solace managed mailbox v1:")
}

fn orphan_candidate(account: &Value, cutoff: i64) -> bool {
    if marker_owner(account, "Solace activated mailbox v1:").is_some() {
        return true;
    }
    owner_id(account).is_some()
        && !(receiving_denied(account)
            && account["createdAt"]
                .as_str()
                .and_then(instant::parse_js_date)
                .is_some_and(|created| created >= cutoff))
}

fn old_denied_stage(account: &Value, cutoff: i64) -> bool {
    owner_id(account).is_some()
        && receiving_denied(account)
        && account["createdAt"]
            .as_str()
            .and_then(instant::parse_js_date)
            .is_some_and(|created| created < cutoff)
}

#[cfg(test)]
async fn run(
    state: &AppState,
    now: time::PrimitiveDateTime,
    cursor: Option<&str>,
) -> Result<Report, AppError> {
    let mut report = Report {
        next_cursor: cursor.map(str::to_owned),
        ..Report::default()
    };
    run_into(state, now, &mut report).await?;
    Ok(report)
}

pub(super) async fn run_into(
    state: &AppState,
    now: time::PrimitiveDateTime,
    report: &mut Report,
) -> Result<(), AppError> {
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(590);
    if !matches!(
        tokio::time::timeout(
            std::time::Duration::from_secs(120),
            cleanup_stages(state, now, report)
        )
        .await,
        Ok(Ok(()))
    ) {
        report.incomplete = true;
    }
    let cursor = report.next_cursor.clone();
    let admin = Admin::new(state);
    let entries = queries::maintenance_entries(&state.db, cursor.as_deref()).await?;
    report.cycle_complete = entries.len() <= 100;
    for entry in entries.into_iter().take(100) {
        if tokio::time::Instant::now() >= deadline {
            report.incomplete = true;
            report.cycle_complete = false;
            break;
        }
        let Some(user_id) = entry.user_id.as_deref() else {
            report.next_cursor = Some(entry.id.clone());
            continue;
        };
        let Some(_lock) = queries::try_maintenance_lock(state, user_id).await? else {
            report.incomplete = true;
            report.cycle_complete = false;
            break;
        };
        let mut near_expiry = false;
        let checked = async {
            let Some(current) = queries::entry_by_user(&state.db, user_id).await? else {
                return Ok::<_, CheckFailure>(());
            };
            if current.id != entry.id {
                return Ok(());
            }
            admin
                .verify_account_binding(
                    &current.stalwart_account_id,
                    &current.local_part,
                    &current.stalwart_domain_id,
                )
                .await?;
            let secret = bridge::secret(
                state.config.mail_bridge_hmac_key.as_deref(),
                user_id,
                &current.email,
            )
            .map_err(|_| CheckFailure::Unavailable)?;
            let token = service::owner_token(state, &admin, &current.email, &secret).await?;
            let owner = admin.with_owner_token(&token.access_token);
            let key_id = current
                .stalwart_public_key_id
                .as_deref()
                .ok_or(CheckFailure::Drift)?;
            near_expiry = owner
                .verify_mailbox_key(
                    &current.stalwart_account_id,
                    key_id,
                    &current.public_key_fingerprint,
                )
                .await?;
            owner
                .verify_encryption_at_rest(&current.stalwart_account_id, key_id)
                .await?;
            Ok(())
        }
        .await;
        report.checked += 1;
        report.near_expiry += u64::from(near_expiry);
        match checked {
            Err(CheckFailure::Drift) => report.drifted += 1,
            Err(CheckFailure::ExpiredKey) => {
                report.drifted += 1;
                report.near_expiry += 1;
            }
            Err(CheckFailure::Unavailable) => {
                report.incomplete = true;
                report.cycle_complete = false;
                break;
            }
            Ok(()) => {}
        }
        report.next_cursor = Some(entry.id.clone());
    }
    Ok(())
}

async fn cleanup_stages(
    state: &AppState,
    now: time::PrimitiveDateTime,
    report: &mut Report,
) -> Result<(), AppError> {
    let admin = Admin::new(state);
    let cutoff = instant::unix_millis(now - time::Duration::hours(STAGED_RETENTION_HOURS));
    let accounts = admin
        .managed_account_metadata()
        .await
        .map_err(|_| AppError::internal("Mail metadata scan failed"))?;
    let ids: Vec<String> = accounts
        .iter()
        .filter_map(|account| account["id"].as_str().map(str::to_owned))
        .collect();
    if ids.len() != accounts.len() {
        report.incomplete = true;
    }
    let known = queries::directory_account_ids(&state.db, &ids).await?;
    let candidates: Vec<_> = accounts
        .iter()
        .filter(|account| old_denied_stage(account, cutoff))
        .collect();
    report.incomplete |= candidates.len() > 100;
    let mut orphans: std::collections::HashSet<&str> = accounts
        .iter()
        .filter(|account| orphan_candidate(account, cutoff))
        .filter_map(|account| account["id"].as_str())
        .filter(|id| !known.contains(*id))
        .collect();
    report.drifted += orphans.len() as u64;
    for account in candidates.into_iter().take(100) {
        match cleanup_stage(state, &admin, account, cutoff, report).await {
            Ok(true) => {
                if account["id"].as_str().is_some_and(|id| orphans.remove(id)) {
                    report.drifted -= 1;
                }
            }
            Ok(false) => {}
            Err(_) => report.incomplete = true,
        }
    }
    Ok(())
}

async fn cleanup_stage(
    state: &AppState,
    admin: &Admin<'_>,
    account: &Value,
    cutoff: i64,
    report: &mut Report,
) -> Result<bool, AppError> {
    let (Some(owner), Some(account_id)) = (owner_id(account), account["id"].as_str()) else {
        report.incomplete = true;
        return Ok(false);
    };
    let Some(_lock) = queries::try_maintenance_lock(state, owner).await? else {
        report.incomplete = true;
        return Ok(false);
    };
    if queries::entry_by_account(&state.db, account_id)
        .await?
        .is_some()
    {
        return Ok(false);
    }
    let latest = admin
        .managed_stage(account_id, &managed_marker(owner))
        .await
        .map_err(|_| AppError::internal("Mail staged account readback failed"))?;
    if !latest
        .as_ref()
        .is_some_and(|account| old_denied_stage(account, cutoff))
    {
        return Ok(false);
    }
    let Some(email) = latest
        .as_ref()
        .and_then(|account| account["emailAddress"].as_str())
    else {
        report.incomplete = true;
        return Ok(false);
    };
    let secret = bridge::secret(state.config.mail_bridge_hmac_key.as_deref(), owner, email)
        .map_err(AppError::internal)?;
    let empty = async {
        admin.set_account_password(account_id, &secret).await?;
        let token = service::owner_token(state, admin, email, &secret).await?;
        admin
            .with_owner_token(&token.access_token)
            .mailbox_is_empty(account_id)
            .await
    }
    .await;
    match empty {
        Ok(true) => {}
        Ok(false) => return Ok(false),
        Err(_) => {
            report.incomplete = true;
            return Ok(false);
        }
    }
    admin
        .delete_account(account_id)
        .await
        .map_err(|_| AppError::internal("Mail staged account cleanup failed"))?;
    report.staged_deleted += 1;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::scratch::ScratchDatabase;
    use crate::integrations::stalwart::fake::{FakeStalwart, Reply};
    use crate::mail::service::tests::{OWNER, mail_state, seed_mailbox};
    use serde_json::json;
    use std::sync::Mutex;
    use std::time::Duration;

    #[tokio::test]
    async fn cleanup_removes_only_old_denied_uncommitted_attributed_stages() {
        let database = ScratchDatabase::create().await;
        let records = Mutex::new(vec![
            json!({"id":"old-stage","emailAddress":"alice@solace.test","description":managed_marker(OWNER),"createdAt":"2020-01-01T00:00:00Z","permissions":{"@type":"Merge","disabledPermissions":{"emailReceive":true}}}),
            json!({"id":"acct-linked","name":"alice","domainId":"domain-1","description":managed_marker(OWNER),"createdAt":"2020-01-01T00:00:00Z","permissions":{"@type":"Merge","disabledPermissions":{"emailReceive":true}}}),
            json!({"id":"recent","description":managed_marker(OWNER),"createdAt":"2100-01-01T00:00:00Z","permissions":{"@type":"Merge","disabledPermissions":{"emailReceive":true}}}),
            json!({"id":"active","description":managed_marker(OWNER),"createdAt":"2020-01-01T00:00:00Z","permissions":{"@type":"Inherit"}}),
            json!({"id":"quarantined","description":format!("Solace activated mailbox v1:{OWNER}"),"createdAt":"2020-01-01T00:00:00Z","permissions":{"@type":"Merge","disabledPermissions":{"emailReceive":true}}}),
            json!({"id":"foreign","description":"Other mailbox","createdAt":"2020-01-01T00:00:00Z","permissions":{"@type":"Merge","disabledPermissions":{"emailReceive":true}}}),
        ]);
        let fake = FakeStalwart::start(move |request| {
            if request.path == "/api/auth" { return Reply::authenticated(request, "code-1"); }
            if request.path == "/auth/token" { return Reply::json(json!({"access_token":"owner-only","expires_in":3600})); }
            let call=request.json()["methodCalls"][0].clone();
            let mut records=records.lock().unwrap();
            let args=&call[1];
            let answer=match call[0].as_str().unwrap() {
                "x:Account/query" => json!({"ids":records.iter().map(|account|account["id"].clone()).collect::<Vec<_>>(),"position":0,"total":records.len(),"queryState":"s"}),
                "x:Account/get" => json!({"list":records.iter().filter(|account|args["ids"].as_array().unwrap().contains(&account["id"])).cloned().collect::<Vec<_>>()}),
                "x:Account/set" if args.get("destroy").is_some() => { let ids=args["destroy"].as_array().unwrap(); records.retain(|account|!ids.contains(&account["id"])); json!({"destroyed":ids}) }
                "x:Account/set" => json!({"updated":{"old-stage":null}}),
                "x:OAuthClient/query" => json!({"ids":["client-1"]}),
                "x:OAuthClient/get" => json!({"list":[{"id":"client-1","clientId":"solace-mail-bridge","scopes":{"mail":true,"settings":true},"redirectUris":{"http://localhost:4001/api/mail/oauth/stalwart/callback":true}}]}),
                "Mailbox/get" => { assert_eq!(request.authorization.as_deref(), Some("Bearer owner-only")); json!({"list":[{"id":"inbox","totalEmails":0}]}) },
                _ => return Reply::status(500),
            };
            Reply::json(json!({"methodResponses":[[call[0],answer,call[2]]]}))
        }).await;
        let state = mail_state(&database, &fake).await;
        seed_mailbox(&state, "acct-linked").await;
        let report = run(&state, instant::now(), None).await.unwrap();
        assert_eq!(report.staged_deleted, 1);
        assert_eq!(report.checked, 1);
        assert_eq!(report.drifted, 3);
        assert!(!report.incomplete);
        let destroyed: Vec<_> = fake
            .requests()
            .iter()
            .filter_map(|request| request.json()["methodCalls"][0][1].get("destroy").cloned())
            .collect();
        assert_eq!(destroyed, vec![json!(["old-stage"])]);
        assert!(!fake.requests().iter().any(|request| matches!(
            request.first_method().as_str(),
            "Email/get" | "Email/query" | "Blob/get"
        )));
    }
    #[tokio::test]
    async fn advisory_guards_serialize_independent_states_without_occupying_the_query_pool() {
        let database = ScratchDatabase::create().await;
        let fake = FakeStalwart::start(|_| Reply::status(500)).await;
        let state = mail_state(&database, &fake).await;
        let pool = crate::db::connect(&database.url, 1).await.unwrap();
        let state = AppState::new(state.config.as_ref().clone(), pool).unwrap();
        let other = AppState::new(state.config.as_ref().clone(), state.db.clone()).unwrap();
        let guard = queries::acquire_provisioning_lock(&state, OWNER)
            .await
            .unwrap();
        assert!(queries::mailbox_approved(&state.db, OWNER).await.unwrap());
        let mut waiting = tokio::spawn(async move {
            let _guard = queries::acquire_provisioning_lock(&other, OWNER)
                .await
                .unwrap();
        });
        assert!(
            tokio::time::timeout(Duration::from_millis(50), &mut waiting)
                .await
                .is_err()
        );
        drop(guard);
        tokio::time::timeout(Duration::from_secs(2), waiting)
            .await
            .unwrap()
            .unwrap();
    }
    #[tokio::test]
    async fn a_busy_user_does_not_take_a_maintenance_slot_or_block_other_users() {
        let database = ScratchDatabase::create().await;
        let fake = FakeStalwart::start(|_| Reply::status(500)).await;
        let state = mail_state(&database, &fake).await;
        let guard = queries::acquire_provisioning_lock(&state, OWNER)
            .await
            .unwrap();
        assert!(
            queries::try_maintenance_lock(&state, OWNER)
                .await
                .unwrap()
                .is_none()
        );
        let other = queries::acquire_provisioning_lock(&state, "other-user")
            .await
            .unwrap();
        drop(other);
        let began = std::time::Instant::now();
        let error = match queries::acquire_provisioning_lock(&state, OWNER).await {
            Ok(_) => panic!("same-account lock should time out"),
            Err(error) => error,
        };
        assert!(matches!(
            error,
            AppError::Upstream {
                status: axum::http::StatusCode::SERVICE_UNAVAILABLE,
                ..
            }
        ));
        assert!(began.elapsed() < Duration::from_secs(7));
        drop(guard);
    }
    #[tokio::test]
    async fn maintenance_cursor_is_stable_across_deletes_and_later_inserts() {
        use sea_orm::ConnectionTrait;
        let database = ScratchDatabase::create().await;
        database.db.execute_unprepared("INSERT INTO mail_directory_entry (id,email,local_part,domain,stalwart_account_id,stalwart_domain_id,public_key_armored,public_key_fingerprint,created_at,updated_at) SELECT 'p'||lpad(i::text,3,'0'), 'page-'||i||'@solace.test', 'page-'||i, 'solace.test','account-'||i,'domain-test','synthetic-key','SYNTHETIC',now(),now() FROM generate_series(0,110) AS i").await.unwrap();
        let first = queries::maintenance_entries(&database.db, None)
            .await
            .unwrap();
        assert_eq!(first.len(), 101);
        assert_eq!(first.first().unwrap().id, "p000");
        database
            .db
            .execute_unprepared("DELETE FROM mail_directory_entry WHERE id = 'p100'")
            .await
            .unwrap();
        let next = queries::maintenance_entries(&database.db, Some("p100"))
            .await
            .unwrap();
        assert_eq!(next.len(), 10);
        assert_eq!(next.first().unwrap().id, "p101");
        assert_eq!(next.last().unwrap().id, "p110");
        assert_eq!(
            queries::maintenance_entries(&database.db, None)
                .await
                .unwrap()
                .first()
                .unwrap()
                .id,
            "p000"
        );
    }
    #[tokio::test]
    async fn inventory_reports_owned_orphans_without_owner_tokens_and_ignores_recent_stages() {
        use sea_orm::ConnectionTrait;
        let database = ScratchDatabase::empty().await;
        crate::db::migrate(&database.db).await.unwrap();
        database.db.execute_unprepared("INSERT INTO mail_directory_entry (id,email,local_part,domain,stalwart_account_id,stalwart_domain_id,public_key_armored,public_key_fingerprint,created_at,updated_at) VALUES ('known-entry','known@solace.test','known','solace.test','known-account','domain-1','synthetic-key','SYNTHETIC',now(),now())").await.unwrap();
        let records = json!([
            {"id":"activated-orphan","description":"Solace activated mailbox v1:MixedCase-Owner_1","createdAt":"2100-01-01T00:00:00Z","permissions":{"@type":"Inherit"}},
            {"id":"managed-orphan","description":"Solace managed mailbox v1:Legacy-Owner_2","createdAt":"2020-01-01T00:00:00Z","permissions":{"@type":"Inherit"}},
            {"id":"recent-stage","description":"Solace managed mailbox v1:Recent-Owner_3","createdAt":"2100-01-01T00:00:00Z","permissions":{"@type":"Merge","disabledPermissions":{"emailReceive":true}}},
            {"id":"known-account","description":"Solace activated mailbox v1:Known-Owner_4","createdAt":"2020-01-01T00:00:00Z","permissions":{"@type":"Inherit"}}
        ]);
        let fake = FakeStalwart::start(move |request| {
            let call = request.json()["methodCalls"][0].clone();
            let answer = match call[0].as_str().unwrap() {
                "x:Account/query" => json!({"ids":["activated-orphan","managed-orphan","recent-stage","known-account"],"position":0,"total":4,"queryState":"s"}),
                "x:Account/get" => json!({"list":records}),
                _ => panic!("orphan detection must not authenticate owners or access content"),
            };
            Reply::json(json!({"methodResponses":[[call[0],answer,call[2]]]}))
        }).await;
        let state = mail_state(&database, &fake).await;
        let report = run(&state, instant::now(), None).await.unwrap();
        assert_eq!(report.drifted, 2);
        assert_eq!(report.staged_deleted, 0);
        assert_eq!(report.checked, 0);
        assert!(!report.incomplete);
        assert_eq!(fake.requests().len(), 2);
        let mut ids: Vec<_> = (0..1000).map(|index| format!("unknown-{index}")).collect();
        ids.push("known-account".into());
        assert_eq!(
            queries::directory_account_ids(&database.db, &ids)
                .await
                .unwrap(),
            std::collections::HashSet::from(["known-account".into()])
        );
        assert!(
            queries::directory_account_ids(&database.db, &vec!["bounded".into(); 10_001])
                .await
                .is_err()
        );
    }
}
