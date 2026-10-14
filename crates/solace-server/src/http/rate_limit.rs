//! `enforceRateLimit` from `lib/rate-limit.ts`: fixed windows in memory, per store and key, bounded and pruned.

use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

use crate::error::AppError;

/// Bounds every store so a flood of distinct keys cannot grow memory without limit.
const MAX_KEYS_PER_STORE: usize = 50_000;

#[derive(Clone, Copy)]
pub struct Limit {
    pub requests: u32,
    pub window: Duration,
}

struct Entry {
    count: u32,
    reset: Instant,
}

#[derive(Default)]
struct Store {
    entries: HashMap<String, Entry>,
    last_cleanup: Option<Instant>,
}

static STORES: LazyLock<Mutex<HashMap<&'static str, Store>>> = LazyLock::new(Default::default);

/// Counts one request; over the limit it is `RateLimitError` with the seconds until the window resets.
pub fn enforce(store: &'static str, key: &str, limit: Limit) -> Result<(), AppError> {
    let now = Instant::now();
    let mut stores = STORES
        .lock()
        .map_err(|_| AppError::internal("rate limit store poisoned"))?;
    let store = stores.entry(store).or_default();
    if store
        .last_cleanup
        .is_none_or(|last| now.duration_since(last) > limit.window)
    {
        store.entries.retain(|_, entry| entry.reset >= now);
        store.last_cleanup = Some(now);
    }
    let window_start = now.checked_sub(limit.window);
    match store.entries.get_mut(key) {
        Some(entry) if window_start.is_none_or(|start| entry.reset >= start) => {
            if entry.count >= limit.requests {
                let retry_after = entry
                    .reset
                    .saturating_duration_since(now)
                    .as_millis()
                    .div_ceil(1000);
                let retry_after = u64::try_from(retry_after).unwrap_or(u64::MAX);
                return Err(AppError::RateLimited {
                    message: format!("Rate limit exceeded. Try again in {retry_after} seconds."),
                    retry_after,
                });
            }
            entry.count += 1;
        }
        _ => {
            if store.entries.len() >= MAX_KEYS_PER_STORE {
                store.entries.retain(|_, entry| entry.reset >= now);
            }
            if store.entries.len() < MAX_KEYS_PER_STORE {
                store.entries.insert(
                    key.to_owned(),
                    Entry {
                        count: 1,
                        reset: now + limit.window,
                    },
                );
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn requests_past_the_limit_wait_for_the_window() {
        let limit = Limit {
            requests: 2,
            window: Duration::from_secs(60),
        };
        assert!(enforce("test-store", "a", limit).is_ok());
        assert!(enforce("test-store", "a", limit).is_ok());
        match enforce("test-store", "a", limit) {
            Err(AppError::RateLimited {
                retry_after,
                message,
            }) => {
                assert!((59..=60).contains(&retry_after), "{retry_after}");
                assert!(message.starts_with("Rate limit exceeded. Try again in "));
            }
            other => panic!("expected a rate limit, got {other:?}"),
        }
        assert!(
            enforce("test-store", "b", limit).is_ok(),
            "keys are separate"
        );
    }
}
