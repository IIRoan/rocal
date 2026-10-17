//! `NotificationCalculator` from `lib/notification-calculator.ts`: when a reminder fires, and its wall-clock time in the event's zone.

use crate::instant::resolve_timezone;

/// JavaScript's `Date` range: anything beyond it is an invalid date.
const MAX_TIME_MS: i64 = 8_640_000_000_000_000;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum CalculatorError {
    #[error("Invalid event start time")]
    InvalidStart,
    #[error("Minutes before must be a non-negative integer")]
    InvalidMinutes,
    #[error("Invalid date provided")]
    InvalidDate,
    #[error("Invalid time zone")]
    InvalidTimeZone,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Schedule {
    pub notification_time_ms: i64,
    /// `YYYY-MM-DDTHH:mm:ss` in `notification_timezone`.
    pub notification_date_local: String,
    pub notification_timezone: String,
}

fn valid(ms: i64) -> bool {
    ms.abs() <= MAX_TIME_MS
}

/// `roundToMinute`: seconds and milliseconds dropped (the servers run in UTC, so local and UTC minutes agree).
pub fn round_to_minute(ms: i64) -> Result<i64, CalculatorError> {
    if !valid(ms) {
        return Err(CalculatorError::InvalidDate);
    }
    Ok(ms - ms.rem_euclid(60_000))
}

pub fn calculate_notification_time(
    start_ms: i64,
    minutes_before: f64,
) -> Result<i64, CalculatorError> {
    if !valid(start_ms) {
        return Err(CalculatorError::InvalidStart);
    }
    if minutes_before.fract() != 0.0 || !minutes_before.is_finite() || minutes_before < 0.0 {
        return Err(CalculatorError::InvalidMinutes);
    }
    // Lead times are capped at 30 days upstream, so the product fits easily.
    round_to_minute(start_ms - (minutes_before as i64) * 60_000)
}

/// `formatLocalDateTime` with the `sv-SE` formatter: an ISO-like local date-time without offset.
pub fn format_local_datetime(ms: i64, timezone: &str) -> Result<String, CalculatorError> {
    if !valid(ms) {
        return Err(CalculatorError::InvalidDate);
    }
    let zone = crate::instant::time_zone(&resolve_timezone(Some(timezone)))
        .ok_or(CalculatorError::InvalidTimeZone)?;
    let timestamp =
        jiff::Timestamp::from_millisecond(ms).map_err(|_| CalculatorError::InvalidDate)?;
    Ok(zone
        .to_datetime(timestamp)
        .strftime("%Y-%m-%dT%H:%M:%S")
        .to_string())
}

pub fn build_schedule(
    start_ms: i64,
    minutes_before: f64,
    timezone: Option<&str>,
) -> Result<Schedule, CalculatorError> {
    let notification_time_ms = calculate_notification_time(start_ms, minutes_before)?;
    let notification_timezone = resolve_timezone(timezone);
    Ok(Schedule {
        notification_date_local: format_local_datetime(
            notification_time_ms,
            &notification_timezone,
        )?,
        notification_time_ms,
        notification_timezone,
    })
}

pub fn is_event_in_future(start_ms: i64, now_ms: i64) -> bool {
    valid(start_ms) && valid(now_ms) && start_ms > now_ms
}

/// `scheduleUpcomingReminder`: none for a past event; a lead time already past fires on the next minute, the first one `chk_notification_time_future` accepts.
pub fn schedule_upcoming_reminder(
    start_ms: i64,
    minutes_before: f64,
    timezone: Option<&str>,
    now_ms: i64,
) -> Result<Option<Schedule>, CalculatorError> {
    if !is_event_in_future(start_ms, now_ms) {
        return Ok(None);
    }
    let schedule = build_schedule(start_ms, minutes_before, timezone)?;
    if schedule.notification_time_ms > now_ms {
        return Ok(Some(schedule));
    }
    let notification_time_ms = round_to_minute(now_ms)? + 60_000;
    Ok(Some(Schedule {
        notification_date_local: format_local_datetime(
            notification_time_ms,
            &schedule.notification_timezone,
        )?,
        notification_time_ms,
        notification_timezone: schedule.notification_timezone,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ms(iso: &str) -> i64 {
        iso.parse::<jiff::Timestamp>().unwrap().as_millisecond()
    }

    #[test]
    fn notification_time_is_start_minus_lead_rounded_to_the_minute() {
        assert_eq!(
            calculate_notification_time(ms("2026-03-01T10:15:42.123Z"), 15.0),
            Ok(ms("2026-03-01T10:00:00Z"))
        );
    }

    #[test]
    fn calculation_rejects_an_invalid_start() {
        assert_eq!(
            calculate_notification_time(MAX_TIME_MS + 1, 15.0),
            Err(CalculatorError::InvalidStart)
        );
    }

    #[test]
    fn calculation_rejects_negative_or_fractional_minutes() {
        let start = ms("2026-03-01T10:00:00Z");
        for minutes in [-1.0, 1.5, f64::NAN] {
            assert_eq!(
                calculate_notification_time(start, minutes),
                Err(CalculatorError::InvalidMinutes),
                "{minutes}"
            );
        }
    }

    #[test]
    fn rounding_drops_seconds_and_milliseconds() {
        assert_eq!(
            round_to_minute(ms("2026-03-01T10:15:59.999Z")),
            Ok(ms("2026-03-01T10:15:00Z"))
        );
        assert_eq!(
            round_to_minute(ms("1969-12-31T23:59:30Z")),
            Ok(ms("1969-12-31T23:59:00Z"))
        );
    }

    #[test]
    fn rounding_rejects_invalid_instants() {
        assert_eq!(
            round_to_minute(-MAX_TIME_MS - 1),
            Err(CalculatorError::InvalidDate)
        );
    }

    #[test]
    fn local_datetime_formats_in_the_zone() {
        let at = ms("2026-01-15T09:05:07Z");
        assert_eq!(
            format_local_datetime(at, "UTC").unwrap(),
            "2026-01-15T09:05:07"
        );
        assert_eq!(
            format_local_datetime(at, "Europe/Amsterdam").unwrap(),
            "2026-01-15T10:05:07"
        );
    }

    #[test]
    fn local_formatting_rejects_invalid_instants() {
        assert_eq!(
            format_local_datetime(MAX_TIME_MS + 1, "UTC"),
            Err(CalculatorError::InvalidDate)
        );
    }

    #[test]
    fn schedule_trims_the_timezone() {
        let schedule = build_schedule(ms("2026-01-15T09:30:00Z"), 30.0, Some("  UTC  ")).unwrap();
        assert_eq!(schedule.notification_timezone, "UTC");
        assert_eq!(schedule.notification_date_local, "2026-01-15T09:00:00");
    }

    #[test]
    fn blank_timezone_falls_back_to_amsterdam() {
        let schedule = build_schedule(ms("2026-01-15T09:30:00Z"), 0.0, Some("   ")).unwrap();
        assert_eq!(schedule.notification_timezone, "Europe/Amsterdam");
        assert_eq!(schedule.notification_date_local, "2026-01-15T10:30:00");
    }

    #[test]
    fn future_check_is_strict() {
        let now = ms("2026-01-15T09:30:00Z");
        assert!(is_event_in_future(now + 1, now));
        assert!(!is_event_in_future(now, now));
    }

    #[test]
    fn future_check_is_false_for_invalid_instants() {
        assert!(!is_event_in_future(MAX_TIME_MS + 1, 0));
        assert!(!is_event_in_future(1, MAX_TIME_MS + 1));
    }

    #[test]
    fn an_overdue_lead_time_fires_on_the_next_minute() {
        for now in [ms("2026-01-15T09:30:42Z"), ms("2026-01-15T09:30:00Z")] {
            let schedule =
                schedule_upcoming_reminder(ms("2026-01-15T09:40:00Z"), 30.0, Some("UTC"), now)
                    .unwrap()
                    .unwrap();
            assert_eq!(schedule.notification_time_ms, ms("2026-01-15T09:31:00Z"));
            assert!(
                schedule.notification_time_ms > now,
                "after the row's created_at"
            );
            assert_eq!(schedule.notification_date_local, "2026-01-15T09:31:00");
        }
        let now = ms("2026-01-15T09:30:42Z");
        assert_eq!(
            schedule_upcoming_reminder(now - 1, 5.0, None, now),
            Ok(None)
        );
    }
}
