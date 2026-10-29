//! Password hashes: `ak1:` + scrypt over the auth key clients derive, or Better Auth's legacy scrypt over the raw password (`hexSalt:hexKey`, N=16384 r=16 p=1, 64-byte key over the NFKC input), two hashes at a time.

use std::sync::LazyLock;

use base64::Engine;
use rand::RngExt;
use tokio::sync::Semaphore;
use unicode_normalization::UnicodeNormalization;

/// Each hash takes 32 MiB, so at most two run at once (the memory budget assumes this).
static HASHING: LazyLock<Semaphore> = LazyLock::new(|| Semaphore::new(2));

pub const MIN_LENGTH: usize = 8;
pub const MAX_LENGTH: usize = 128;

/// Mirrors `deriveAuthKey` in `@workspace/e2ee`; changing any of these locks every account out.
const AUTH_KEY_PREFIX: &str = "solace-ak1:";
const AUTH_KEY_SALT_PREFIX: &str = "solace-auth-key-v1:";
const AUTH_KEY_ITERATIONS: u32 = 600_000;
const AUTH_KEY_CHARS: usize = 43;
const STORED_AUTH_KEY_PREFIX: &str = "ak1:";

#[derive(Debug, thiserror::Error)]
#[error("password hashing failed")]
pub struct HashError;

/// A password field: the key current clients derive, or the raw password shipped binaries still send.
pub enum Presented<'a> {
    AuthKey(&'a str),
    Raw(&'a str),
}

impl<'a> Presented<'a> {
    pub fn of(value: &'a str) -> Self {
        match value.strip_prefix(AUTH_KEY_PREFIX) {
            Some(key)
                if key.len() == AUTH_KEY_CHARS
                    && key
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') =>
            {
                Self::AuthKey(value)
            }
            _ => Self::Raw(value),
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum Verdict {
    /// `rehash` replaces a legacy hash, which a raw password just proved.
    Match {
        rehash: Option<String>,
    },
    Mismatch,
    /// A legacy hash can only be checked against the raw password, so the client must send it once.
    UpgradeRequired,
}

/// Hashes the auth key in `presented`, deriving it first when a shipped binary sent the raw password.
pub async fn hash(presented: &str, email: &str) -> Result<String, HashError> {
    let (presented, email) = (presented.to_owned(), email.to_owned());
    run(move || hash_auth_key(&auth_key(&presented, &email)))
        .await?
        .ok_or(HashError)
}

/// Constant-time check of `presented` against a stored hash of either format.
pub async fn verify(stored: &str, presented: &str, email: &str) -> Result<Verdict, HashError> {
    let (stored, presented, email) = (stored.to_owned(), presented.to_owned(), email.to_owned());
    run(move || {
        if let Some(stored) = stored.strip_prefix(STORED_AUTH_KEY_PREFIX) {
            return if matches(stored, &auth_key(&presented, &email)) {
                Verdict::Match { rehash: None }
            } else {
                Verdict::Mismatch
            };
        }
        match Presented::of(&presented) {
            Presented::AuthKey(_) => Verdict::UpgradeRequired,
            Presented::Raw(raw) if matches(&stored, raw) => Verdict::Match {
                rehash: hash_auth_key(&derive_auth_key(raw, &email)),
            },
            Presented::Raw(_) => Verdict::Mismatch,
        }
    })
    .await
}

fn auth_key(presented: &str, email: &str) -> String {
    match Presented::of(presented) {
        Presented::AuthKey(key) => key.to_owned(),
        Presented::Raw(raw) => derive_auth_key(raw, email),
    }
}

/// PBKDF2-SHA-256 over the NFKC password, salted with the account's email.
fn derive_auth_key(password: &str, email: &str) -> String {
    let normalized: String = password.nfkc().collect();
    let salt = format!("{AUTH_KEY_SALT_PREFIX}{}", email.trim().to_lowercase());
    let key = pbkdf2::pbkdf2_hmac_array::<sha2::Sha256, 32>(
        normalized.as_bytes(),
        salt.as_bytes(),
        AUTH_KEY_ITERATIONS,
    );
    format!(
        "{AUTH_KEY_PREFIX}{}",
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(key)
    )
}

fn hash_auth_key(key: &str) -> Option<String> {
    let salt = hex::encode(rand::rng().random::<[u8; 16]>());
    derive(key, &salt)
        .map(|derived| format!("{STORED_AUTH_KEY_PREFIX}{salt}:{}", hex::encode(derived)))
}

fn matches(stored: &str, input: &str) -> bool {
    let Some((salt, key)) = stored.split_once(':') else {
        return false;
    };
    derive(input, salt).is_some_and(|derived| {
        bool::from(subtle::ConstantTimeEq::ct_eq(
            hex::encode(derived).as_bytes(),
            key.as_bytes(),
        ))
    })
}

/// The hex salt string itself is the scrypt salt, as `@better-auth/utils` uses it.
fn derive(input: &str, salt: &str) -> Option<[u8; 64]> {
    let normalized: String = input.nfkc().collect();
    let params = scrypt::Params::new(14, 16, 1).ok()?;
    let mut key = [0u8; 64];
    scrypt::scrypt(normalized.as_bytes(), salt.as_bytes(), &params, &mut key).ok()?;
    Some(key)
}

async fn run<T: Send + 'static>(work: impl FnOnce() -> T + Send + 'static) -> Result<T, HashError> {
    let _permit = HASHING.acquire().await.map_err(|_| HashError)?;
    tokio::task::spawn_blocking(work)
        .await
        .map_err(|_| HashError)
}

#[cfg(test)]
mod tests {
    use super::*;

    const EMAIL: &str = "person@solace.test";

    #[test]
    fn derives_the_same_auth_key_as_the_clients() {
        // The same vector is asserted in `@workspace/e2ee`'s auth-key test.
        assert_eq!(
            derive_auth_key("solace-test-pw-123", " Person@Solace.test "),
            "solace-ak1:RVi5JAJdWxgw6aLgvytG2Lm2kedP4CA38RkCO9mReJw"
        );
    }

    #[tokio::test]
    async fn auth_key_hashes_accept_the_key_and_the_raw_password() {
        let key = derive_auth_key("solace-test-password", EMAIL);
        let stored = hash(&key, EMAIL).await.unwrap();
        assert!(stored.starts_with(STORED_AUTH_KEY_PREFIX));
        let matched = Verdict::Match { rehash: None };
        assert_eq!(verify(&stored, &key, EMAIL).await.unwrap(), matched);
        assert_eq!(
            verify(&stored, "solace-test-password", EMAIL)
                .await
                .unwrap(),
            matched
        );
        let other = derive_auth_key("solace-test-wrong", EMAIL);
        assert_eq!(
            verify(&stored, &other, EMAIL).await.unwrap(),
            Verdict::Mismatch
        );
        assert_eq!(
            verify(&stored, "solace-test-wrong", EMAIL).await.unwrap(),
            Verdict::Mismatch
        );
    }

    #[tokio::test]
    async fn legacy_hashes_need_the_raw_password_once() {
        // Written by the TypeScript backend at sign-up for "solace-test-pw-123".
        let stored = "dd9606626dae5b0a239158deba3bd517:f7ceb36210bb220f924c0085423c00d4fd9cfc3bc6c0bdf8d0907357c7610cbd52744f7c0016cade759d4a39954470e3c7ee2aad0761b3103637fdae72e4d86a";
        let key = derive_auth_key("solace-test-pw-123", EMAIL);
        assert_eq!(
            verify(stored, &key, EMAIL).await.unwrap(),
            Verdict::UpgradeRequired
        );
        assert_eq!(
            verify(stored, "solace-test-pw-124", EMAIL).await.unwrap(),
            Verdict::Mismatch
        );
        let Verdict::Match {
            rehash: Some(rehash),
        } = verify(stored, "solace-test-pw-123", EMAIL).await.unwrap()
        else {
            panic!("a raw match rehashes");
        };
        assert_eq!(
            verify(&rehash, &key, EMAIL).await.unwrap(),
            Verdict::Match { rehash: None }
        );
        assert_eq!(
            verify("garbage", "x", EMAIL).await.unwrap(),
            Verdict::Mismatch
        );
    }

    #[test]
    fn only_well_formed_keys_count_as_auth_keys() {
        let key = derive_auth_key("x", EMAIL);
        assert!(matches!(Presented::of(&key), Presented::AuthKey(_)));
        assert!(matches!(
            Presented::of("solace-ak1:short"),
            Presented::Raw(_)
        ));
        assert!(matches!(
            Presented::of(&format!("{key}=")),
            Presented::Raw(_)
        ));
    }
}
