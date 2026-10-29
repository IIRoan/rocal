//! `lib/event-constraints.ts`: the service-level reminder limit.

use crate::error::AppError;

/// Thirty days.
pub const MAX_REMINDER_MINUTES: i64 = 43_200;

/// `validateEventReminderMinutes`: a missing reminder passes through; otherwise 0 to 30 days.
pub fn validate_reminder_minutes(reminder: Option<f64>) -> Result<Option<f64>, AppError> {
    match reminder {
        Some(value) if value.is_nan() || value < 0.0 || value > MAX_REMINDER_MINUTES as f64 => {
            Err(AppError::field(
                format!("Reminder must be a number between 0 and {MAX_REMINDER_MINUTES} minutes"),
                "reminder",
            ))
        }
        other => Ok(other),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reminder_passes_missing_through() {
        assert_eq!(validate_reminder_minutes(None).unwrap(), None);
    }

    #[test]
    fn reminder_returns_the_number() {
        assert_eq!(validate_reminder_minutes(Some(15.0)).unwrap(), Some(15.0));
        assert_eq!(
            validate_reminder_minutes(Some(43_200.0)).unwrap(),
            Some(43_200.0)
        );
    }

    #[test]
    fn reminder_rejects_nan() {
        assert!(validate_reminder_minutes(Some(f64::NAN)).is_err());
    }

    #[test]
    fn reminder_rejects_negative() {
        assert!(validate_reminder_minutes(Some(-1.0)).is_err());
    }

    #[test]
    fn reminder_rejects_over_43200() {
        let error = validate_reminder_minutes(Some(43_201.0)).unwrap_err();
        assert_eq!(
            error.to_string(),
            "Reminder must be a number between 0 and 43200 minutes"
        );
    }
}
