use super::*;
use crate::db::scratch::ScratchDatabase;
use crate::integrations::stalwart::admin::managed_marker;
use crate::integrations::stalwart::fake::{FakeStalwart, Reply};
use crate::mail::service::tests::{mail_state, seed_mailbox};
use sea_orm::ConnectionTrait;
use serde_json::json;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

#[tokio::test]
async fn failed_stage_deletion_and_inventory_do_not_starve_directory_metadata_checks() {
    let database = ScratchDatabase::create().await;
    let expires = instant::iso(instant::now() + time::Duration::days(10));
    let inventory_failed = Arc::new(AtomicBool::new(false));
    let upstream = inventory_failed.clone();
    let fake = FakeStalwart::start(move |request| {
        if request.path == "/api/auth" { return Reply::authenticated(request, "code-1"); }
        if request.path == "/auth/token" { return Reply::json(json!({"access_token":"owner-only","expires_in":3600})); }
        let call = request.json()["methodCalls"][0].clone();
        let args = &call[1];
        let answer = match call[0].as_str().unwrap() {
            "x:Account/query" => {
                if upstream.load(Ordering::SeqCst) { return Reply::status(503); }
                json!({"ids":["bad-stage","good-stage"],"position":0,"total":2,"queryState":"s"})
            }
            "x:Account/get" => {
                let list: Vec<_> = args["ids"].as_array().unwrap().iter().map(|id| {
                    let id = id.as_str().unwrap();
                    if id == "acct-linked" { return json!({"id":id,"name":"alice","domainId":"domain-1"}); }
                    json!({"id":id,"emailAddress":format!("{id}@solace.test"),"description":managed_marker(id),"createdAt":"2020-01-01T00:00:00Z","permissions":{"@type":"Merge","disabledPermissions":{"emailReceive":true}},"credentials":{}})
                }).collect();
                json!({"list":list})
            }
            "x:Account/set" => {
                if let Some(ids) = args.get("destroy") {
                    if ids[0] == "bad-stage" { return Reply::status(500); }
                    json!({"destroyed":ids})
                } else {
                    let id = args["update"].as_object().unwrap().keys().next().unwrap();
                    json!({"updated":{id:null}})
                }
            }
            "x:OAuthClient/query" => json!({"ids":["client-1"]}),
            "x:OAuthClient/get" => json!({"list":[{"id":"client-1","clientId":"solace-mail-bridge","scopes":{"mail":true,"settings":true},"redirectUris":{"http://localhost:4001/api/mail/oauth/stalwart/callback":true}}]}),
            "Mailbox/get" => {
                assert_eq!(args["properties"], json!(["id","totalEmails"]));
                json!({"list":[{"id":"inbox","totalEmails":0}]})
            }
            "x:PublicKey/get" => json!({"list":[{"id":"key-1","key":include_str!("../../../../../crates/solace-api-tests/fixtures/pgp/test1.asc"),"warnings":[],"expiresAt":expires}]}),
            "x:AccountSettings/get" => json!({"list":[{"id":"singleton","encryptionAtRest":{"@type":"Enabled","publicKey":"key-1","headerProtection":"none","encryptOnAppend":false,"allowSpamTraining":false}}]}),
            _ => panic!("unexpected method"),
        };
        Reply::json(json!({"methodResponses":[[call[0],answer,call[2]]]}))
    }).await;
    let state = mail_state(&database, &fake).await;
    seed_mailbox(&state, "acct-linked").await;
    database.db.execute_unprepared("UPDATE mail_directory_entry SET stalwart_public_key_id='key-1',public_key_fingerprint='CDCE225F09515A0156BBECB7D0018F17DFF405AC'").await.unwrap();
    let report = super::super::run(&state, instant::now(), None)
        .await
        .unwrap();
    assert_eq!(report.staged_deleted, 1);
    assert_eq!(report.checked, 1);
    assert_eq!(report.near_expiry, 1);
    assert!(report.incomplete);
    assert_eq!(report.next_cursor.as_deref(), Some("entry-1"));
    let destroyed: Vec<_> = fake
        .requests()
        .iter()
        .filter_map(|request| request.json()["methodCalls"][0][1].get("destroy").cloned())
        .collect();
    assert_eq!(destroyed, vec![json!(["bad-stage"]), json!(["good-stage"])]);
    let mut cycle = Cycle::default();
    cycle.advance(&report, 1, 1);
    inventory_failed.store(true, Ordering::SeqCst);
    let report = super::super::run(&state, instant::now(), cycle.cursor.as_deref())
        .await
        .unwrap();
    assert_eq!(report.staged_deleted, 0);
    assert_eq!(report.checked, 1);
    assert_eq!(report.near_expiry, 1);
    assert!(report.incomplete);
    assert!(!fake.requests().iter().any(|request| matches!(
        request.first_method().as_str(),
        "Email/get" | "Email/query" | "Blob/get"
    )));
}
