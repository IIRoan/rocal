//! One bounded PostgreSQL connection serializes reporters without occupying user query or owner-operation slots.

use std::time::Duration;

use sea_orm::sqlx::{Connection, PgConnection, Row};
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};

use super::monitor::{Cycle, Health};
use crate::{error::AppError, state::AppState};

const GLOBAL_LOCK: i64 = 0x534f_4c41_4345_0013;

pub(super) struct Guard {
    connection: PgConnection,
}

fn unavailable() -> AppError {
    AppError::internal("Mail policy status unavailable")
}

pub(super) async fn try_lock(state: &AppState) -> Result<Option<Guard>, AppError> {
    let mut connection = tokio::time::timeout(
        Duration::from_secs(5),
        PgConnection::connect(&state.config.database_url),
    )
    .await
    .map_err(|_| unavailable())?
    .map_err(|_| unavailable())?;
    let acquired: bool = tokio::time::timeout(
        Duration::from_secs(1),
        sea_orm::sqlx::query_scalar("SELECT pg_try_advisory_lock($1)")
            .bind(GLOBAL_LOCK)
            .fetch_one(&mut connection),
    )
    .await
    .map_err(|_| unavailable())?
    .map_err(|_| unavailable())?;
    Ok(acquired.then_some(Guard { connection }))
}

pub(super) async fn now(guard: &mut Guard) -> Result<i64, AppError> {
    tokio::time::timeout(
        Duration::from_secs(5),
        sea_orm::sqlx::query_scalar(
            "SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint",
        )
        .fetch_one(&mut guard.connection),
    )
    .await
    .map_err(|_| unavailable())?
    .map_err(|_| unavailable())
}

pub(super) async fn load(guard: &mut Guard) -> Result<Cycle, AppError> {
    let row = tokio::time::timeout(Duration::from_secs(5), sea_orm::sqlx::query("SELECT directory_cursor, cycle_near_expiry, cycle_drift, near_expiry, drift, incomplete, last_pass_at, next_pass_at, last_cycle_at FROM mail_policy_monitor WHERE singleton = true").fetch_optional(&mut guard.connection)).await.map_err(|_| unavailable())?.map_err(|_| unavailable())?;
    let Some(row) = row else {
        return Ok(Cycle::default());
    };
    Ok(Cycle {
        cursor: row.try_get("directory_cursor").map_err(|_| unavailable())?,
        cycle_near_expiry: row
            .try_get("cycle_near_expiry")
            .map_err(|_| unavailable())?,
        cycle_drift: row.try_get("cycle_drift").map_err(|_| unavailable())?,
        near_expiry: row.try_get("near_expiry").map_err(|_| unavailable())?,
        drift: row.try_get("drift").map_err(|_| unavailable())?,
        incomplete: row.try_get("incomplete").map_err(|_| unavailable())?,
        last_pass_at: row.try_get("last_pass_at").map_err(|_| unavailable())?,
        next_pass_at: row.try_get("next_pass_at").map_err(|_| unavailable())?,
        last_cycle_at: row.try_get("last_cycle_at").map_err(|_| unavailable())?,
    })
}

pub(super) async fn save(guard: &mut Guard, cycle: &Cycle) -> Result<(), AppError> {
    tokio::time::timeout(Duration::from_secs(5), sea_orm::sqlx::query("INSERT INTO mail_policy_monitor (singleton, directory_cursor, cycle_near_expiry, cycle_drift, near_expiry, drift, incomplete, last_pass_at, next_pass_at, last_cycle_at) VALUES (true,$1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (singleton) DO UPDATE SET directory_cursor=excluded.directory_cursor, cycle_near_expiry=excluded.cycle_near_expiry, cycle_drift=excluded.cycle_drift, near_expiry=excluded.near_expiry, drift=excluded.drift, incomplete=excluded.incomplete, last_pass_at=excluded.last_pass_at, next_pass_at=excluded.next_pass_at, last_cycle_at=excluded.last_cycle_at")
        .bind(&cycle.cursor).bind(cycle.cycle_near_expiry).bind(cycle.cycle_drift).bind(cycle.near_expiry).bind(cycle.drift).bind(cycle.incomplete).bind(cycle.last_pass_at).bind(cycle.next_pass_at).bind(cycle.last_cycle_at).execute(&mut guard.connection)).await.map_err(|_| unavailable())?.map_err(|_| unavailable())?;
    Ok(())
}

pub(super) async fn health(db: &DatabaseConnection) -> Result<Health, AppError> {
    let row = db.query_one_raw(Statement::from_string(DbBackend::Postgres, "SELECT directory_cursor, cycle_near_expiry, cycle_drift, near_expiry, drift, incomplete, last_pass_at, next_pass_at, last_cycle_at, floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now FROM mail_policy_monitor WHERE singleton = true")).await?;
    let Some(row) = row else {
        return Ok(Cycle::default().health(0));
    };
    let cycle = Cycle {
        cursor: row.try_get("", "directory_cursor")?,
        cycle_near_expiry: row.try_get("", "cycle_near_expiry")?,
        cycle_drift: row.try_get("", "cycle_drift")?,
        near_expiry: row.try_get("", "near_expiry")?,
        drift: row.try_get("", "drift")?,
        incomplete: row.try_get("", "incomplete")?,
        last_pass_at: row.try_get("", "last_pass_at")?,
        next_pass_at: row.try_get("", "next_pass_at")?,
        last_cycle_at: row.try_get("", "last_cycle_at")?,
    };
    Ok(cycle.health(row.try_get("", "now")?))
}
