//! Shared bounded-cycle mail metadata monitoring; public health never controls mail acceptance.

use std::time::Duration;

use crate::{error::AppError, instant, state::AppState};

use super::{Report, monitor_store};

const PASS_INTERVAL_MS: i64 = 60 * 60 * 1000;
const RETRY_INTERVAL_MS: i64 = 5 * 60 * 1000;

pub const PASS_MAX_AGE_MS: i64 = 3 * 60 * 60 * 1000;
pub const CYCLE_MAX_AGE_MS: i64 = 7 * 24 * 60 * 60 * 1000;

#[derive(Clone, Debug, Default)]
pub(super) struct Cycle {
    pub cursor: Option<String>,
    pub cycle_near_expiry: bool,
    pub cycle_drift: bool,
    pub near_expiry: bool,
    pub drift: bool,
    pub incomplete: bool,
    pub last_pass_at: Option<i64>,
    pub next_pass_at: Option<i64>,
    pub last_cycle_at: Option<i64>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Health {
    pub policy: bool,
    pub expiry: bool,
}

impl Cycle {
    pub fn pass_due(&self, now: i64) -> bool {
        self.next_pass_at.is_none_or(|next| now >= next)
    }

    pub fn failed(&mut self, report: &mut Report, now: i64) {
        report.incomplete = true;
        report.cycle_complete = false;
        self.advance(report, now, now);
    }

    pub fn advance(&mut self, report: &Report, started: i64, now: i64) {
        self.last_pass_at = Some(now);
        self.incomplete = report.incomplete;
        self.next_pass_at = Some(if report.incomplete {
            now.saturating_add(RETRY_INTERVAL_MS)
        } else {
            started.saturating_add(PASS_INTERVAL_MS)
        });
        self.cursor = report.next_cursor.clone();
        self.cycle_near_expiry |= report.near_expiry > 0;
        self.cycle_drift |= report.drifted > 0;
        self.near_expiry |= self.cycle_near_expiry;
        self.drift |= self.cycle_drift;
        if report.cycle_complete {
            self.cursor = None;
            if !report.incomplete {
                self.last_cycle_at = Some(now);
                self.near_expiry = self.cycle_near_expiry;
                self.drift = self.cycle_drift;
            }
            self.cycle_near_expiry = false;
            self.cycle_drift = false;
        }
    }

    pub fn health(&self, now: i64) -> Health {
        let fresh = |stamp: Option<i64>, maximum| {
            stamp.is_some_and(|stamp| {
                now.checked_sub(stamp)
                    .is_some_and(|age| (0..=maximum).contains(&age))
            })
        };
        let complete = !self.incomplete
            && fresh(self.last_pass_at, PASS_MAX_AGE_MS)
            && fresh(self.last_cycle_at, CYCLE_MAX_AGE_MS);
        Health {
            policy: complete && !self.drift,
            expiry: complete && !self.near_expiry,
        }
    }
}

pub fn start(state: AppState) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(300));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
            if run_pass(&state).await.is_err() {
                tracing::error!("Mail metadata monitoring failed");
            }
        }
    })
}

pub async fn health(state: &AppState) -> Result<Health, AppError> {
    tokio::time::timeout(Duration::from_secs(2), monitor_store::health(&state.db))
        .await
        .map_err(|_| AppError::internal("Mail policy status unavailable"))?
}

pub async fn run_pass(state: &AppState) -> Result<(), AppError> {
    let Some(mut guard) = monitor_store::try_lock(state).await? else {
        return Ok(());
    };
    let mut cycle = monitor_store::load(&mut guard).await?;
    let started = monitor_store::now(&mut guard).await?;
    if !cycle.pass_due(started) {
        return Ok(());
    }
    let mut report = Report {
        next_cursor: cycle.cursor.clone(),
        ..Report::default()
    };
    let result = tokio::time::timeout(
        Duration::from_secs(600),
        super::run_into(state, instant::now(), &mut report),
    )
    .await;
    let now = monitor_store::now(&mut guard).await?;
    match result {
        Ok(Ok(())) => {
            cycle.advance(&report, started, now);
            tracing::info!(
                checked = report.checked,
                drifted = report.drifted,
                near_expiry = report.near_expiry,
                incomplete = report.incomplete,
                "Mail metadata maintenance completed"
            );
        }
        _ => cycle.failed(&mut report, now),
    }
    monitor_store::save(&mut guard, &cycle).await
}

#[cfg(test)]
#[path = "monitor_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "monitor_cleanup_tests.rs"]
mod cleanup_tests;
