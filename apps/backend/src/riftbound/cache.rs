use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

/// Public Riftbound data shared by every user for a few minutes, bounded by approximate bytes.
pub(super) struct TtlCache<V> {
    ttl: Duration,
    budget: usize,
    inner: Mutex<Inner<V>>,
}

struct Inner<V> {
    entries: HashMap<String, (Instant, usize, V)>,
    weight: usize,
}

impl<V: Clone> TtlCache<V> {
    pub(super) fn new(ttl: Duration, budget: usize) -> Self {
        Self {
            ttl,
            budget,
            inner: Mutex::new(Inner {
                entries: HashMap::new(),
                weight: 0,
            }),
        }
    }

    pub(super) fn get(&self, key: &str) -> Option<V> {
        let inner = self.inner.lock().ok()?;
        let (stored, _, value) = inner.entries.get(key)?;
        (stored.elapsed() < self.ttl).then(|| value.clone())
    }

    pub(super) fn insert(&self, key: String, weight: usize, value: V) {
        let Ok(mut inner) = self.inner.lock() else {
            return;
        };
        if let Some((_, old, _)) = inner.entries.remove(&key) {
            inner.weight -= old;
        }
        if inner.weight + weight > self.budget {
            let ttl = self.ttl;
            inner
                .entries
                .retain(|_, (stored, ..)| stored.elapsed() < ttl);
            inner.weight = inner.entries.values().map(|(_, weight, _)| weight).sum();
        }
        // ponytail: drops everything once live entries fill the budget; LRU eviction if that churns.
        if inner.weight + weight > self.budget {
            inner.entries.clear();
            inner.weight = 0;
        }
        if weight <= self.budget {
            inner.weight += weight;
            inner.entries.insert(key, (Instant::now(), weight, value));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entries_expire_and_never_exceed_the_budget() {
        let cache = TtlCache::new(Duration::from_secs(60), 10);
        cache.insert("a".into(), 6, 1);
        cache.insert("b".into(), 6, 2);
        assert_eq!((cache.get("a"), cache.get("b")), (None, Some(2)));
        cache.insert("huge".into(), 11, 3);
        assert_eq!(cache.get("huge"), None);
        let expired = TtlCache::new(Duration::ZERO, 10);
        expired.insert("a".into(), 1, 1);
        assert_eq!(expired.get("a"), None);
    }
}
