//! Refuses anything that is not a test resource: every test URL, database, bucket and secret must look like one.

use url::Url;

/// Prefix every test-environment secret and database password carries; production secrets never do.
pub const TEST_SECRET_PREFIX: &str = "solace-test-";
/// Prefix of every test database name.
pub const TEST_NAME_PREFIX: &str = "solace_test";
/// Prefix of every test bucket name (Railway appends a random suffix).
pub const TEST_BUCKET_PREFIX: &str = "solace-test-";

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum GuardError {
    #[error("{0} is not a valid URL")]
    InvalidUrl(&'static str),
    #[error("{0} points at a host that is not a test host")]
    NotTestHost(&'static str),
    #[error("{0} must name a solace_test* database")]
    NotTestDatabase(&'static str),
    #[error("{0} must carry a solace-test-* password")]
    NotTestPassword(&'static str),
    #[error("{0} must be a solace-test-* secret")]
    NotTestSecret(&'static str),
    #[error("{0} must name a solace-test-* bucket")]
    NotTestBucket(&'static str),
    #[error("{0} must be a .test mail domain")]
    NotTestMailDomain(&'static str),
}

/// Loopback, the container host, Railway private networking (scoped to one environment) and `*-test` Railway domains.
fn is_test_host(host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    matches!(
        host.as_str(),
        "localhost" | "127.0.0.1" | "[::1]" | "::1" | "host.containers.internal"
    ) || host.ends_with(".railway.internal")
        || host.ends_with("-test.up.railway.app")
}

/// An HTTP(S) URL of a test service: never a production API, web, mail or Railway production domain.
pub fn check_service_url(name: &'static str, value: &str) -> Result<(), GuardError> {
    let url = Url::parse(value).map_err(|_| GuardError::InvalidUrl(name))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(GuardError::InvalidUrl(name));
    }
    match url.host_str() {
        Some(host) if is_test_host(host) => Ok(()),
        _ => Err(GuardError::NotTestHost(name)),
    }
}

/// A Postgres URL of a test database: test host, `solace_test*` name and a `solace-test-*` password.
pub fn check_database_url(name: &'static str, value: &str) -> Result<(), GuardError> {
    let url = Url::parse(value).map_err(|_| GuardError::InvalidUrl(name))?;
    if !matches!(url.scheme(), "postgres" | "postgresql") {
        return Err(GuardError::InvalidUrl(name));
    }
    let host = url.host_str().unwrap_or_default();
    if !is_test_host(host) && !host.ends_with(".proxy.rlwy.net") {
        return Err(GuardError::NotTestHost(name));
    }
    if !url
        .path()
        .trim_start_matches('/')
        .starts_with(TEST_NAME_PREFIX)
    {
        return Err(GuardError::NotTestDatabase(name));
    }
    let password = percent_encoding::percent_decode_str(url.password().unwrap_or_default())
        .decode_utf8_lossy();
    if !password.starts_with(TEST_SECRET_PREFIX) {
        return Err(GuardError::NotTestPassword(name));
    }
    Ok(())
}

/// A secret minted for the test environment.
pub fn check_secret(name: &'static str, value: &str) -> Result<(), GuardError> {
    if value.starts_with(TEST_SECRET_PREFIX) && value.len() > TEST_SECRET_PREFIX.len() {
        Ok(())
    } else {
        Err(GuardError::NotTestSecret(name))
    }
}

/// A bucket created for the test environment.
pub fn check_bucket(name: &'static str, value: &str) -> Result<(), GuardError> {
    if value.starts_with(TEST_BUCKET_PREFIX) {
        Ok(())
    } else {
        Err(GuardError::NotTestBucket(name))
    }
}

/// A mail domain reserved for testing (RFC 2606), so no mailbox can be a real one.
pub fn check_mail_domain(name: &'static str, value: &str) -> Result<(), GuardError> {
    let domain = value.trim().trim_end_matches('.').to_ascii_lowercase();
    if domain == "test" || domain.ends_with(".test") {
        Ok(())
    } else {
        Err(GuardError::NotTestMailDomain(name))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn service_urls_allow_only_test_hosts() {
        for ok in [
            "http://127.0.0.1:4001",
            "http://localhost:58080/jmap",
            "http://solace-api.railway.internal:8080",
            "https://solace-api-rust-test.up.railway.app",
        ] {
            assert_eq!(check_service_url("URL", ok), Ok(()), "{ok}");
        }
        for bad in [
            "https://api.solace.onl",
            "https://solace.onl",
            "https://mail.solace.onl",
            "https://stalwart-mail-production.up.railway.app",
            "https://storage.railway.app",
            "https://example.com",
            "ftp://127.0.0.1",
            "not a url",
        ] {
            assert!(check_service_url("URL", bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn database_urls_need_test_host_name_and_password() {
        assert_eq!(
            check_database_url(
                "DB",
                "postgres://solace_test:solace-test-pg@127.0.0.1:55432/solace_test"
            ),
            Ok(())
        );
        assert_eq!(
            check_database_url(
                "DB",
                "postgresql://postgres:solace-test-x@ab.proxy.rlwy.net:123/solace_test_template"
            ),
            Ok(())
        );
        assert_eq!(
            check_database_url(
                "DB",
                "postgresql://postgres:random@ab.proxy.rlwy.net:123/railway"
            ),
            Err(GuardError::NotTestDatabase("DB"))
        );
        assert_eq!(
            check_database_url(
                "DB",
                "postgresql://postgres:random@ab.proxy.rlwy.net:123/solace_test"
            ),
            Err(GuardError::NotTestPassword("DB"))
        );
        assert_eq!(
            check_database_url(
                "DB",
                "postgresql://postgres:solace-test-x@db.example.com/solace_test"
            ),
            Err(GuardError::NotTestHost("DB"))
        );
    }

    #[test]
    fn secrets_buckets_and_domains_must_be_test_ones() {
        assert_eq!(check_secret("S", "solace-test-abc"), Ok(()));
        assert!(check_secret("S", "solace-test-").is_err());
        assert!(check_secret("S", "f00dbabe").is_err());
        assert_eq!(check_bucket("B", "solace-test-avatars-x1y2"), Ok(()));
        assert!(check_bucket("B", "profile-pictures-abc").is_err());
        assert_eq!(check_mail_domain("D", "solace.test"), Ok(()));
        assert!(check_mail_domain("D", "solace.onl").is_err());
    }
}
