//! `lib/event-constraints.ts`: the service-level length and reminder limits, counted in UTF-16 units like JavaScript.

use crate::error::AppError;
use crate::http::zod::{js_length, js_trim};

pub const TITLE_MAX_LENGTH: usize = 255;
pub const DESCRIPTION_MAX_LENGTH: usize = 1000;
pub const LOCATION_MAX_LENGTH: usize = 255;
/// Thirty days.
pub const MAX_REMINDER_MINUTES: i64 = 43_200;

pub fn validate_title_length(title: Option<&str>) -> Result<(), AppError> {
    if title.is_some_and(|title| js_length(js_trim(title)) > TITLE_MAX_LENGTH) {
        return Err(AppError::field(
            format!("Title cannot exceed {TITLE_MAX_LENGTH} characters"),
            "title",
        ));
    }
    Ok(())
}

pub fn validate_description_length(description: Option<&str>) -> Result<(), AppError> {
    if description.is_some_and(|description| js_length(description) > DESCRIPTION_MAX_LENGTH) {
        return Err(AppError::field(
            format!("Description cannot exceed {DESCRIPTION_MAX_LENGTH} characters"),
            "description",
        ));
    }
    Ok(())
}

pub fn validate_location_length(location: Option<&str>) -> Result<(), AppError> {
    if location.is_some_and(|location| js_length(location) > LOCATION_MAX_LENGTH) {
        return Err(AppError::field(
            format!("Location cannot exceed {LOCATION_MAX_LENGTH} characters"),
            "location",
        ));
    }
    Ok(())
}

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
    fn title_length_accepts_missing_and_empty() {
        assert!(validate_title_length(None).is_ok());
        assert!(validate_title_length(Some("")).is_ok());
    }

    #[test]
    fn title_length_accepts_255() {
        assert!(validate_title_length(Some(&"a".repeat(255))).is_ok());
    }

    #[test]
    fn title_length_rejects_over_255() {
        let error = validate_title_length(Some(&"a".repeat(256))).unwrap_err();
        assert_eq!(error.to_string(), "Title cannot exceed 255 characters");
    }

    #[test]
    fn title_length_counts_trimmed_text() {
        assert!(validate_title_length(Some(&format!("  {}  ", "a".repeat(255)))).is_ok());
    }

    #[test]
    fn description_length_accepts_missing_and_empty() {
        assert!(validate_description_length(None).is_ok());
        assert!(validate_description_length(Some("")).is_ok());
    }

    #[test]
    fn description_length_rejects_over_1000() {
        assert!(validate_description_length(Some(&"a".repeat(1000))).is_ok());
        let error = validate_description_length(Some(&"a".repeat(1001))).unwrap_err();
        assert_eq!(
            error.to_string(),
            "Description cannot exceed 1000 characters"
        );
    }

    #[test]
    fn location_length_accepts_255() {
        assert!(validate_location_length(Some(&"a".repeat(255))).is_ok());
    }

    #[test]
    fn location_length_rejects_over_255() {
        let error = validate_location_length(Some(&"a".repeat(256))).unwrap_err();
        assert_eq!(error.to_string(), "Location cannot exceed 255 characters");
    }

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
