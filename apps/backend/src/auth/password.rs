//! Better Auth's scrypt passwords (`hexSalt:hexKey`, N=16384 r=16 p=1, 64-byte key over the NFKC password), two hashes at a time.

use std::sync::LazyLock;

use rand::RngExt;
use tokio::sync::Semaphore;
use unicode_normalization::UnicodeNormalization;

/// Each hash takes 32 MiB, so at most two run at once (the memory budget assumes this).
static HASHING: LazyLock<Semaphore> = LazyLock::new(|| Semaphore::new(2));

pub const MIN_LENGTH: usize = 8;
pub const MAX_LENGTH: usize = 128;

#[derive(Debug, thiserror::Error)]
#[error("password hashing failed")]
pub struct HashError;

pub async fn hash(password: &str) -> Result<String, HashError> {
    let password = password.to_owned();
    run(move || {
        let salt = hex::encode(rand::rng().random::<[u8; 16]>());
        derive(&password, &salt).map(|key| format!("{salt}:{}", hex::encode(key)))
    })
    .await?
    .ok_or(HashError)
}

/// Constant-time check of `password` against a stored `hexSalt:hexKey`.
pub async fn verify(stored: &str, password: &str) -> Result<bool, HashError> {
    let (stored, password) = (stored.to_owned(), password.to_owned());
    run(move || {
        let (salt, key) = stored.split_once(':')?;
        let derived = hex::encode(derive(&password, salt)?);
        Some(bool::from(subtle::ConstantTimeEq::ct_eq(
            derived.as_bytes(),
            key.as_bytes(),
        )))
    })
    .await
    .map(|matched| matched.unwrap_or(false))
}

/// The hex salt string itself is the scrypt salt, as `@better-auth/utils` uses it.
fn derive(password: &str, salt: &str) -> Option<[u8; 64]> {
    let normalized: String = password.nfkc().collect();
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

    #[tokio::test]
    async fn hashes_verify_and_match_the_better_auth_format() {
        let stored = hash("solace-test-password").await.unwrap();
        let (salt, key) = stored.split_once(':').unwrap();
        assert_eq!((salt.len(), key.len()), (32, 128));
        assert!(verify(&stored, "solace-test-password").await.unwrap());
        assert!(!verify(&stored, "solace-test-wrong").await.unwrap());
        assert!(!verify("garbage", "x").await.unwrap());
    }

    #[tokio::test]
    async fn typescript_hashes_verify() {
        // Written by the TypeScript backend at sign-up for "solace-test-pw-123".
        let stored = "dd9606626dae5b0a239158deba3bd517:f7ceb36210bb220f924c0085423c00d4fd9cfc3bc6c0bdf8d0907357c7610cbd52744f7c0016cade759d4a39954470e3c7ee2aad0761b3103637fdae72e4d86a";
        assert!(verify(stored, "solace-test-pw-123").await.unwrap());
        assert!(!verify(stored, "solace-test-pw-124").await.unwrap());
    }
}
