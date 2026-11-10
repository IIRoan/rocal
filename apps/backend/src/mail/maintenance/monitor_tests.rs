use super::*;
use crate::db::scratch::ScratchDatabase;
use crate::integrations::stalwart::fake::{FakeStalwart, Reply};
use crate::mail::service::tests::mail_state;
use serde_json::json;

const NOW: i64 = 1_800_000_000_000;

fn complete() -> Report {
    Report {
        cycle_complete: true,
        ..Report::default()
    }
}

#[test]
fn pending_stale_failed_and_future_stamps_never_report_healthy() {
    let mut cycle = Cycle::default();
    assert_eq!(
        cycle.health(NOW),
        Health {
            policy: false,
            expiry: false
        }
    );
    assert!(cycle.pass_due(NOW));
    cycle.advance(&complete(), NOW, NOW);
    assert!(!cycle.pass_due(NOW + PASS_INTERVAL_MS - 1));
    assert!(cycle.pass_due(NOW + PASS_INTERVAL_MS));
    assert_eq!(
        cycle.health(NOW),
        Health {
            policy: true,
            expiry: true
        }
    );
    assert!(!cycle.health(NOW + PASS_MAX_AGE_MS + 1).policy);
    assert!(!cycle.health(NOW - 1).policy);
    cycle.last_pass_at = Some(NOW + CYCLE_MAX_AGE_MS + 1);
    assert!(!cycle.health(NOW + CYCLE_MAX_AGE_MS + 1).policy);
    cycle.failed(&mut Report::default(), NOW);
    assert!(!cycle.health(NOW).policy);
    assert!(!cycle.health(NOW).expiry);
}

#[test]
fn warnings_and_drift_remain_independent_and_latched_until_a_complete_clean_cycle() {
    let mut cycle = Cycle::default();
    cycle.advance(&complete(), NOW, NOW);
    cycle.advance(
        &Report {
            near_expiry: 1,
            next_cursor: Some("opaque-100".into()),
            ..Report::default()
        },
        NOW + 1,
        NOW + 1,
    );
    assert_eq!(
        cycle.health(NOW + 1),
        Health {
            policy: true,
            expiry: false
        }
    );
    cycle.advance(
        &Report {
            drifted: 1,
            incomplete: true,
            next_cursor: cycle.cursor.clone(),
            ..Report::default()
        },
        NOW + 2,
        NOW + 2,
    );
    assert_eq!(cycle.cursor.as_deref(), Some("opaque-100"));
    assert!(cycle.drift && cycle.near_expiry);
    cycle.advance(&complete(), NOW + 3, NOW + 3);
    assert_eq!(
        cycle.health(NOW + 3),
        Health {
            policy: false,
            expiry: false
        }
    );
    cycle.advance(
        &Report {
            next_cursor: Some("opaque-100".into()),
            ..Report::default()
        },
        NOW + 4,
        NOW + 4,
    );
    assert_eq!(
        cycle.health(NOW + 4),
        Health {
            policy: false,
            expiry: false
        }
    );
    cycle.advance(&complete(), NOW + 5, NOW + 5);
    assert_eq!(
        cycle.health(NOW + 5),
        Health {
            policy: true,
            expiry: true
        }
    );
    assert_eq!(cycle.cursor, None);
}

#[test]
fn partial_first_cycle_and_incomplete_end_do_not_clear_pending() {
    let mut cycle = Cycle::default();
    cycle.advance(
        &Report {
            next_cursor: Some("opaque-100".into()),
            ..Report::default()
        },
        NOW,
        NOW,
    );
    assert_eq!(cycle.last_cycle_at, None);
    assert!(!cycle.health(NOW).policy);
    cycle.advance(
        &Report {
            cycle_complete: true,
            incomplete: true,
            ..Report::default()
        },
        NOW + 1,
        NOW + 1,
    );
    assert_eq!(cycle.last_cycle_at, None);
    cycle.advance(&complete(), NOW + 2, NOW + 2);
    assert!(cycle.health(NOW + 2).policy);
}

#[tokio::test]
async fn reporters_share_one_row_and_global_lock_outside_owner_slots() {
    let database = ScratchDatabase::empty().await;
    crate::db::migrate(&database.db).await.unwrap();
    let fake = FakeStalwart::start(|_| Reply::json(json!({}))).await;
    let state = mail_state(&database, &fake).await;
    let other_pool = crate::db::connect(&database.url, 1).await.unwrap();
    let other = AppState::new(state.config.as_ref().clone(), other_pool).unwrap();
    let permit = state.mail_cache.maintenance_slots.acquire().await.unwrap();
    let mut first = monitor_store::try_lock(&state).await.unwrap().unwrap();
    assert!(monitor_store::try_lock(&other).await.unwrap().is_none());
    let now = monitor_store::now(&mut first).await.unwrap();
    let mut cycle = monitor_store::load(&mut first).await.unwrap();
    assert!(!cycle.health(now).policy);
    cycle.advance(&complete(), now, now);
    monitor_store::save(&mut first, &cycle).await.unwrap();
    assert_eq!(
        health(&other).await.unwrap(),
        Health {
            policy: true,
            expiry: true
        }
    );
    cycle.advance(
        &Report {
            near_expiry: 1,
            next_cursor: Some("opaque-100".into()),
            ..Report::default()
        },
        now,
        now,
    );
    monitor_store::save(&mut first, &cycle).await.unwrap();
    assert_eq!(
        health(&other).await.unwrap(),
        Health {
            policy: true,
            expiry: false
        }
    );
    drop(first);
    let mut next = monitor_store::try_lock(&other).await.unwrap().unwrap();
    assert_eq!(
        monitor_store::load(&mut next)
            .await
            .unwrap()
            .cursor
            .as_deref(),
        Some("opaque-100")
    );
    drop(next);
    drop(permit);
    run_pass(&other).await.unwrap();
    assert!(
        fake.requests().is_empty(),
        "replicas do not restart a fresh hourly pass"
    );
}

#[tokio::test]
async fn a_busy_directory_entry_is_not_skipped_by_the_resume_cursor() {
    let database = ScratchDatabase::create().await;
    let fake = FakeStalwart::start(|request| {
        assert_eq!(request.first_method(), "x:Account/query");
        Reply::json(json!({"methodResponses":[["x:Account/query",{"ids":[],"position":0,"total":0,"queryState":"s"},"c1"]]}))
    }).await;
    let state = mail_state(&database, &fake).await;
    crate::mail::service::tests::seed_mailbox(&state, "acct-locked").await;
    let _owner =
        crate::mail::queries::acquire_provisioning_lock(&state, crate::mail::service::tests::OWNER)
            .await
            .unwrap();
    let report = super::super::run(&state, instant::now(), None)
        .await
        .unwrap();
    assert!(report.incomplete);
    assert!(!report.cycle_complete);
    assert_eq!(report.next_cursor, None);
    assert_eq!(report.checked, 0);
    assert_eq!(fake.requests().len(), 1);
}

#[test]
fn successful_cadence_uses_start_time_and_failures_retry_after_five_minutes() {
    let mut cycle = Cycle::default();
    let duration = 120_000;
    cycle.advance(&complete(), NOW, NOW + duration);
    assert_eq!(cycle.last_pass_at, Some(NOW + duration));
    assert!(!cycle.pass_due(NOW + PASS_INTERVAL_MS - 1));
    assert!(cycle.pass_due(NOW + PASS_INTERVAL_MS));
    cycle.advance(
        &complete(),
        NOW + PASS_INTERVAL_MS,
        NOW + PASS_INTERVAL_MS + duration,
    );
    assert!(cycle.health(NOW + 2 * PASS_INTERVAL_MS).policy);
    assert!(cycle.pass_due(NOW + 2 * PASS_INTERVAL_MS));
    cycle.failed(&mut Report::default(), NOW + 2 * PASS_INTERVAL_MS);
    assert!(!cycle.pass_due(NOW + 2 * PASS_INTERVAL_MS + RETRY_INTERVAL_MS - 1));
    assert!(cycle.pass_due(NOW + 2 * PASS_INTERVAL_MS + RETRY_INTERVAL_MS));
    cycle.advance(
        &Report {
            incomplete: true,
            ..Report::default()
        },
        NOW,
        NOW + duration,
    );
    assert_eq!(cycle.next_pass_at, Some(NOW + duration + RETRY_INTERVAL_MS));
}

#[tokio::test]
async fn verified_middle_key_drift_advances_and_checks_later_expiring_keys() {
    use sea_orm::ConnectionTrait;
    let database = ScratchDatabase::create().await;
    let expires = instant::iso(instant::now() + time::Duration::days(10));
    let unavailable = std::sync::Arc::new(std::sync::atomic::AtomicU8::new(0));
    let upstream = unavailable.clone();
    let fake = FakeStalwart::start(move |request| {
        if request.path == "/api/auth" {
            if request.json()["accountName"] == "mail1@solace.test" {
                match upstream.load(std::sync::atomic::Ordering::SeqCst) {
                    4 => return Reply::status(401),
                    5 => return Reply::status(429),
                    6 => return Reply::problem(json!({"error":"invalid_grant"})),
                    _ => {}
                }
            }
            return Reply::authenticated(request, "code-1");
        }
        if request.path == "/auth/token" { return Reply::json(json!({"access_token":"owner-only","expires_in":3600})); }
        let call = request.json()["methodCalls"][0].clone();
        let args = &call[1];
        let account = args["accountId"].as_str().unwrap_or_default();
        let suffix = account.strip_prefix("acct-").unwrap_or_default();
        let answer = match call[0].as_str().unwrap() {
            "x:Account/query" => json!({"ids":[],"position":0,"total":0,"queryState":"s"}),
            "x:Account/get" => {
                let id = args["ids"][0].as_str().unwrap();
                json!({"list":[{"id":id,"name":id.replace("acct-","mail"),"domainId":"domain-1"}]})
            }
            "x:OAuthClient/query" => json!({"ids":["client-1"]}),
            "x:OAuthClient/get" => json!({"list":[{"id":"client-1","clientId":"solace-mail-bridge","scopes":{"mail":true,"settings":true},"redirectUris":{"http://localhost:4001/api/mail/oauth/stalwart/callback":true}}]}),
            "x:PublicKey/get" => {
                if suffix == "1" && upstream.load(std::sync::atomic::Ordering::SeqCst) == 1 { return Reply::status(503); }
                assert_eq!(request.authorization.as_deref(), Some("Bearer owner-only"));
                json!({"list":[{"id":format!("key-{suffix}"),"key":include_str!("../../../../../crates/solace-api-tests/fixtures/pgp/test1.asc"),"warnings":if suffix=="1" && upstream.load(std::sync::atomic::Ordering::SeqCst) < 2 {json!(["weakRsa"])} else {json!([])},"expiresAt":if suffix=="2" { if upstream.load(std::sync::atomic::Ordering::SeqCst) == 3 {json!("2020-01-01T00:00:00Z")} else {json!(expires)} } else {json!(null)}}]})
            }
            "x:AccountSettings/get" => json!({"list":[{"id":"singleton","encryptionAtRest":{"@type":"Enabled","publicKey":format!("key-{suffix}"),"headerProtection":"none","encryptOnAppend":false,"allowSpamTraining":false}}]}),
            _ => panic!("unexpected method"),
        };
        Reply::json(json!({"methodResponses":[[call[0],answer,call[2]]]}))
    }).await;
    let state = mail_state(&database, &fake).await;
    database.db.execute_unprepared("INSERT INTO \"user\" (id,name,email,email_verified,created_at,updated_at) SELECT 'owner'||i,'Synthetic','owner'||i||'@solace.test',true,now(),now() FROM generate_series(0,2) AS i; INSERT INTO mail_directory_entry (id,email,local_part,domain,stalwart_account_id,stalwart_domain_id,stalwart_public_key_id,public_key_armored,public_key_fingerprint,user_id,created_at,updated_at) SELECT 'entry-'||i,'mail'||i||'@solace.test','mail'||i,'solace.test','acct-'||i,'domain-1','key-'||i,'synthetic-key','CDCE225F09515A0156BBECB7D0018F17DFF405AC','owner'||i,now(),now() FROM generate_series(0,2) AS i").await.unwrap();
    let report = super::super::run(&state, instant::now(), None)
        .await
        .unwrap();
    assert_eq!(report.checked, 3);
    assert_eq!(report.drifted, 1);
    assert_eq!(report.near_expiry, 1);
    assert!(report.cycle_complete && !report.incomplete);
    assert_eq!(report.next_cursor.as_deref(), Some("entry-2"));
    let mut cycle = Cycle::default();
    cycle.advance(&report, NOW, NOW);
    assert_eq!(
        cycle.health(NOW),
        Health {
            policy: false,
            expiry: false
        }
    );
    assert!(!fake.requests().iter().any(|request| matches!(
        request.first_method().as_str(),
        "Email/get" | "Email/query" | "Blob/get"
    )));
    unavailable.store(1, std::sync::atomic::Ordering::SeqCst);
    let before = fake.requests().len();
    let report = super::super::run(&state, instant::now(), None)
        .await
        .unwrap();
    assert!(report.incomplete && !report.cycle_complete);
    assert_eq!(report.checked, 2);
    assert_eq!(report.drifted, 0);
    assert_eq!(report.next_cursor.as_deref(), Some("entry-0"));
    assert!(
        !fake.requests()[before..]
            .iter()
            .any(|request| request.json()["methodCalls"][0][1]["accountId"] == "acct-2")
    );
    unavailable.store(2, std::sync::atomic::Ordering::SeqCst);
    let report = super::super::run(&state, instant::now(), None)
        .await
        .unwrap();
    let mut cycle = Cycle::default();
    cycle.advance(&report, NOW, NOW);
    assert_eq!(
        cycle.health(NOW),
        Health {
            policy: true,
            expiry: false
        }
    );
    unavailable.store(3, std::sync::atomic::Ordering::SeqCst);
    let expired = super::super::run(&state, instant::now(), None)
        .await
        .unwrap();
    assert_eq!(expired.drifted, 1);
    assert_eq!(expired.near_expiry, 1);
    assert!(expired.cycle_complete && !expired.incomplete);
    cycle.advance(&expired, NOW + 1, NOW + 1);
    assert_eq!(
        cycle.health(NOW + 1),
        Health {
            policy: false,
            expiry: false
        }
    );
    for mode in [4, 6] {
        unavailable.store(mode, std::sync::atomic::Ordering::SeqCst);
        let report = super::super::run(&state, instant::now(), None)
            .await
            .unwrap();
        assert_eq!(report.checked, 3);
        assert_eq!(report.drifted, 1);
        assert_eq!(report.near_expiry, 1);
        assert_eq!(report.next_cursor.as_deref(), Some("entry-2"));
        assert!(report.cycle_complete && !report.incomplete);
    }
    unavailable.store(5, std::sync::atomic::Ordering::SeqCst);
    let report = super::super::run(&state, instant::now(), None)
        .await
        .unwrap();
    assert_eq!(report.checked, 2);
    assert_eq!(report.drifted, 0);
    assert_eq!(report.next_cursor.as_deref(), Some("entry-0"));
    assert!(report.incomplete && !report.cycle_complete);
}

#[tokio::test(start_paused = true)]
async fn a_timed_out_pass_keeps_completed_observations_and_the_last_checked_cursor() {
    let mut report = Report::default();
    let result = tokio::time::timeout(Duration::from_secs(600), async {
        report.checked = 1;
        report.near_expiry = 1;
        report.next_cursor = Some("checked-entry".into());
        report.cycle_complete = true;
        tokio::time::sleep(Duration::from_secs(601)).await;
        report.next_cursor = Some("unchecked-entry".into());
    })
    .await;
    assert!(result.is_err());
    let mut cycle = Cycle::default();
    cycle.failed(&mut report, NOW);
    assert_eq!(cycle.cursor.as_deref(), Some("checked-entry"));
    assert!(cycle.near_expiry && cycle.incomplete);
    assert_eq!(cycle.last_cycle_at, None);
    assert_eq!(cycle.next_pass_at, Some(NOW + RETRY_INTERVAL_MS));
}

#[test]
fn an_incomplete_directory_end_wraps_without_clearing_latched_findings_or_freshness() {
    let mut cycle = Cycle {
        cursor: Some("entry-last".into()),
        near_expiry: true,
        drift: true,
        last_cycle_at: Some(NOW - 1),
        ..Cycle::default()
    };
    for pass in 0..3 {
        cycle.advance(
            &Report {
                next_cursor: Some("entry-last".into()),
                cycle_complete: true,
                incomplete: true,
                ..Report::default()
            },
            NOW + pass,
            NOW + pass,
        );
        assert_eq!(cycle.cursor, None);
        assert_eq!(cycle.last_cycle_at, Some(NOW - 1));
        assert!(cycle.near_expiry && cycle.drift && cycle.incomplete);
        assert!(!cycle.health(NOW + pass).policy);
        assert!(!cycle.health(NOW + pass).expiry);
    }
    cycle.advance(&complete(), NOW + 4, NOW + 4);
    assert_eq!(cycle.last_cycle_at, Some(NOW + 4));
    assert_eq!(
        cycle.health(NOW + 4),
        Health {
            policy: true,
            expiry: true
        }
    );
}
