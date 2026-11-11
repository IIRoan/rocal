//! Shared operational health is anonymous, bounded and independent from mail acceptance.

use serde_json::json;
use solace_api_tests::client::ResponseResult;

use crate::helpers::{TestApp, header, ok};

async fn app() -> TestApp {
    let app = TestApp::spawn_with_config(|_| {}).await;
    let url = app
        .env
        .database_url_for(app.db.connect_options().get_database().unwrap())
        .unwrap();
    let db = solace_server::db::connect(&url, 2).await.unwrap();
    solace_server::db::migrate(&db).await.unwrap();
    db.close().await.unwrap();
    app
}

#[tokio::test]
async fn metadata_health_reports_shared_pending_fresh_expiry_drift_and_failed_states() {
    let app = app().await;
    let mut agent = app.anonymous();
    for route in ["/api/health/mail-policy", "/api/health/mail-key-expiry"] {
        let response = ok(agent.get(route).await.expect_status(503));
        assert_eq!(ok(response.value()), json!({"status":"error"}));
        assert_eq!(header(&response, "cache-control"), Some("no-store"));
    }
    sqlx::query("UPDATE mail_policy_monitor SET incomplete=false, last_pass_at=floor(extract(epoch FROM clock_timestamp())*1000)::bigint, last_cycle_at=floor(extract(epoch FROM clock_timestamp())*1000)::bigint").execute(&app.db).await.unwrap();
    for route in ["/api/health/mail-policy", "/api/health/mail-key-expiry"] {
        assert_eq!(
            ok(agent.get(route).await.expect_status(200).value()),
            json!({"status":"ok"})
        );
    }
    sqlx::query("UPDATE mail_policy_monitor SET near_expiry=true")
        .execute(&app.db)
        .await
        .unwrap();
    agent
        .get("/api/health/mail-policy")
        .await
        .expect_status(200)
        .unwrap();
    agent
        .get("/api/health/mail-key-expiry")
        .await
        .expect_status(503)
        .unwrap();
    sqlx::query("UPDATE mail_policy_monitor SET incomplete=true")
        .execute(&app.db)
        .await
        .unwrap();
    for route in ["/api/health/mail-policy", "/api/health/mail-key-expiry"] {
        agent.get(route).await.expect_status(503).unwrap();
    }
    sqlx::query("UPDATE mail_policy_monitor SET incomplete=false")
        .execute(&app.db)
        .await
        .unwrap();
    agent
        .get("/api/health/mail-policy")
        .await
        .expect_status(200)
        .unwrap();
    agent
        .get("/api/health/mail-key-expiry")
        .await
        .expect_status(503)
        .unwrap();
    sqlx::query("UPDATE mail_policy_monitor SET near_expiry=false, drift=true, directory_cursor='opaque-orphan-check'")
        .execute(&app.db)
        .await
        .unwrap();
    let drift = ok(agent
        .get("/api/health/mail-policy")
        .await
        .expect_status(503));
    assert_eq!(ok(drift.value()), json!({"status":"error"}));
    agent
        .get("/api/health/mail-key-expiry")
        .await
        .expect_status(200)
        .unwrap();
    for mutation in [
        "drift=false,incomplete=true",
        "incomplete=false,last_pass_at=0",
        "last_pass_at=floor(extract(epoch FROM clock_timestamp())*1000)::bigint,last_cycle_at=0",
    ] {
        sqlx::query(&format!("UPDATE mail_policy_monitor SET {mutation}"))
            .execute(&app.db)
            .await
            .unwrap();
        for route in ["/api/health/mail-policy", "/api/health/mail-key-expiry"] {
            assert_eq!(
                ok(agent.get(route).await.expect_status(503).value()),
                json!({"status":"error"})
            );
        }
    }
    agent.get("/api/health").await.expect_status(200).unwrap();
    agent
        .get("/api/health/mail-jmap")
        .await
        .expect_status(200)
        .unwrap();
}

#[tokio::test]
async fn metadata_health_limits_each_route_separately_with_a_constant_response() {
    let app = app().await;
    let mut agent = app.anonymous();
    for route in ["/api/health/mail-policy", "/api/health/mail-key-expiry"] {
        for _ in 0..30 {
            agent.get(route).await.expect_status(503).unwrap();
        }
        let response = ok(agent.get(route).await.expect_status(429));
        assert_eq!(ok(response.value()), json!({"status":"error"}));
        assert_eq!(header(&response, "cache-control"), Some("no-store"));
    }
    app.anonymous()
        .get("/api/health/mail-policy")
        .await
        .expect_status(503)
        .unwrap();
    agent.get("/api/health").await.expect_status(200).unwrap();
}
