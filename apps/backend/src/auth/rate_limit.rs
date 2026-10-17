//! Better Auth's rate limits with Solace's rules (`auth-rate-limit.ts`): one atomic Postgres upsert per request, keyed by an HMAC of `ip|path`.

use std::net::IpAddr;
use std::sync::atomic::{AtomicI64, Ordering};

use axum::http::HeaderMap;
use hmac::{KeyInit, Mac};
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, FromQueryResult, Statement};

use crate::http::client_ip::TRUSTED_HEADERS;
use crate::instant;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rule {
    pub window: i64,
    pub max: i64,
}

const DEFAULT: Rule = Rule {
    window: 60,
    max: 100,
};

const fn rule(window: i64, max: i64) -> Option<Rule> {
    Some(Rule { window, max })
}

/// Per-path rules relative to `/api/auth`; `None` disables limiting (session checks write nothing).
const RULES: [(&str, Option<Rule>); 19] = [
    ("/get-session", None),
    ("/sign-in/*", rule(60, 5)),
    ("/sign-up/*", rule(3600, 5)),
    ("/passkey/generate-authenticate-options", rule(60, 10)),
    ("/passkey/verify-authentication", rule(60, 10)),
    ("/passkey/generate-register-options", rule(60, 10)),
    ("/passkey/verify-registration", rule(60, 10)),
    ("/one-time-token/verify", rule(60, 10)),
    ("/request-password-reset", rule(900, 3)),
    ("/forget-password", rule(900, 3)),
    ("/reset-password", rule(900, 5)),
    ("/reset-password/*", rule(900, 10)),
    ("/send-verification-email", rule(900, 3)),
    ("/verify-email", rule(900, 10)),
    ("/change-password", rule(900, 5)),
    ("/change-email", rule(900, 3)),
    ("/verify-password", rule(900, 5)),
    ("/delete-user", rule(900, 3)),
    ("/delete-user/callback", rule(900, 5)),
];

/// Better Auth's built-in stricter defaults, which Solace's rules override where both match.
fn special_rule(path: &str) -> Option<Rule> {
    if ["/sign-in", "/sign-up", "/change-password", "/change-email"]
        .iter()
        .any(|prefix| path.starts_with(prefix))
    {
        return Some(Rule { window: 10, max: 3 });
    }
    (path == "/request-password-reset"
        || path == "/send-verification-email"
        || path.starts_with("/forget-password"))
    .then_some(Rule { window: 60, max: 3 })
}

/// The rule for `path`, or `None` when the path is not limited.
pub fn rule_for(path: &str) -> Option<Rule> {
    let custom = RULES.iter().find(|(pattern, _)| matches(pattern, path));
    match custom {
        Some((_, rule)) => *rule,
        None => Some(special_rule(path).unwrap_or(DEFAULT)),
    }
}

/// `wildcardMatch` with `/` as separator: `*` stands for one path segment.
fn matches(pattern: &str, path: &str) -> bool {
    let (pattern, path): (Vec<&str>, Vec<&str>) =
        (pattern.split('/').collect(), path.split('/').collect());
    pattern.len() == path.len()
        && pattern
            .iter()
            .zip(&path)
            .all(|(expected, actual)| *expected == "*" && !actual.is_empty() || expected == actual)
}

/// Better Auth's `getIP`: a header holding exactly one address (IPv6 cut to its /64), loopback outside production.
pub fn client_key_ip(headers: &HeaderMap, is_production: bool) -> String {
    for name in TRUSTED_HEADERS {
        let Some(value) = headers.get(name).and_then(|v| v.to_str().ok()) else {
            continue;
        };
        let entries: Vec<&str> = value
            .split(',')
            .map(str::trim)
            .filter(|e| !e.is_empty())
            .collect();
        if let [single] = entries.as_slice()
            && let Ok(address) = single.parse::<IpAddr>()
        {
            return normalize(address);
        }
    }
    if is_production {
        "no-trusted-ip".into()
    } else {
        "127.0.0.1".into()
    }
}

fn normalize(address: IpAddr) -> String {
    match address {
        IpAddr::V4(v4) => v4.to_string(),
        IpAddr::V6(v6) => match v6.to_ipv4_mapped() {
            Some(v4) => v4.to_string(),
            None => {
                let [a, b, c, d, ..] = v6.segments();
                format!("{a:04x}:{b:04x}:{c:04x}:{d:04x}:0000:0000:0000:0000")
            }
        },
    }
}

/// Better Auth keys contain the client IP, so only a keyed HMAC of them is stored.
pub fn hashed_key(secret: &str, ip: &str, path: &str) -> String {
    let mut mac = <hmac::Hmac<sha2::Sha256> as KeyInit>::new_from_slice(secret.as_bytes())
        .unwrap_or_else(|_| unreachable!("HMAC accepts keys of any length"));
    mac.update(format!("{ip}|{path}").as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

#[derive(FromQueryResult)]
struct Counter {
    count: i32,
    last_request: i64,
}

static LAST_PRUNE_MS: AtomicI64 = AtomicI64::new(0);
const PRUNE_INTERVAL_MS: i64 = 5 * 60_000;
const LONGEST_WINDOW_SECONDS: i64 = 3600;

/// Counts the request; `Some(retry_after_seconds)` when it is over the limit.
pub async fn consume(
    db: &DatabaseConnection,
    key: &str,
    rule: Rule,
) -> Result<Option<i64>, sea_orm::DbErr> {
    let now = instant::unix_millis(instant::now());
    let window_start = now - rule.window * 1000;
    // In ON CONFLICT … SET, column references are the pre-update values.
    let row = Counter::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Postgres,
        r#"INSERT INTO "rate_limit" ("key", "count", "last_request") VALUES ($1, 1, $2)
           ON CONFLICT ("key") DO UPDATE SET
             "count" = CASE WHEN "rate_limit"."last_request" <= $3 THEN 1 ELSE LEAST("rate_limit"."count" + 1, $4) END,
             "last_request" = CASE WHEN "rate_limit"."last_request" <= $3 OR "rate_limit"."count" < $5 THEN $2 ELSE "rate_limit"."last_request" END
           RETURNING "count", "last_request""#,
        [
            key.into(),
            now.into(),
            window_start.into(),
            i32::try_from(rule.max + 1).unwrap_or(i32::MAX).into(),
            i32::try_from(rule.max).unwrap_or(i32::MAX).into(),
        ],
    ))
    .one(db)
    .await?;
    prune(db, now).await;
    Ok(row.and_then(|row| {
        (i64::from(row.count) > rule.max).then(|| {
            let retry_ms = row.last_request + rule.window * 1000 - now;
            (retry_ms + 999).div_euclid(1000).max(1)
        })
    }))
}

/// Deletes rows older than the longest window, at most every five minutes; a failure is only logged.
async fn prune(db: &DatabaseConnection, now: i64) {
    let last = LAST_PRUNE_MS.load(Ordering::Relaxed);
    if now - last < PRUNE_INTERVAL_MS
        || LAST_PRUNE_MS
            .compare_exchange(last, now, Ordering::Relaxed, Ordering::Relaxed)
            .is_err()
    {
        return;
    }
    let cutoff = now - LONGEST_WINDOW_SECONDS * 1000;
    let deleted = db
        .execute_raw(Statement::from_sql_and_values(
            DbBackend::Postgres,
            r#"DELETE FROM "rate_limit" WHERE "last_request" < $1"#,
            [cutoff.into()],
        ))
        .await;
    if deleted.is_err() {
        tracing::warn!("Failed to prune auth rate limit rows");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credential_and_recovery_paths_have_strict_rules() {
        for path in [
            "/sign-in/email",
            "/sign-up/email",
            "/passkey/verify-authentication",
            "/passkey/generate-authenticate-options",
            "/request-password-reset",
            "/reset-password",
            "/send-verification-email",
            "/verify-email",
        ] {
            assert!(rule_for(path).is_some_and(|rule| rule.max <= 10), "{path}");
        }
        assert_eq!(rule_for("/get-session"), None);
        assert_eq!(rule_for("/list-sessions"), Some(DEFAULT));
        assert_eq!(
            rule_for("/reset-password/abc"),
            Some(Rule {
                window: 900,
                max: 10
            })
        );
    }

    #[test]
    fn keys_use_a_slash_64_and_are_hmaced() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", "2001:db8:1:2:3:4:5:6".parse().unwrap());
        assert_eq!(
            client_key_ip(&headers, true),
            "2001:0db8:0001:0002:0000:0000:0000:0000"
        );
        headers.insert("x-forwarded-for", "203.0.113.7, 10.0.0.1".parse().unwrap());
        assert_eq!(
            client_key_ip(&headers, true),
            "no-trusted-ip",
            "a list is not one address"
        );
        assert_eq!(client_key_ip(&headers, false), "127.0.0.1");
        let key = hashed_key("secret", "203.0.113.7", "/sign-in/email");
        assert_eq!(key.len(), 64);
        assert!(!key.contains("203.0.113.7"));
    }
}
