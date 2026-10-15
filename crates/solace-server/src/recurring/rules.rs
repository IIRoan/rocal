//! Rule inputs, checks and descriptions (`RecurrenceEngine`, `parseRecurringRuleInput`, `splitRecurringSeriesRule`).

use serde_json::Value;
use solace_api_types::recurring::RecurrenceRuleInput;

use crate::events::recurrence::{Frequency, Rule, parse_rule};
use crate::http::zod::js_number_string;
use crate::instant;

const MS_PER_DAY: f64 = 86_400_000.0;
const WEEKDAYS: [&str; 7] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/// A rule as the service read it: the engine's view, and the object it echoes and stores.
pub struct Parsed {
    pub rule: Rule,
    /// What `JSON.stringify` writes for the parsed rule; a text `until` became a date.
    pub json: Value,
    /// A rule object keeps `until` as text, which the description cannot format.
    until_is_text: bool,
}

fn js_date_json(ms: f64) -> Value {
    if ms.is_nan() {
        return Value::Null;
    }
    instant::from_unix_millis(ms as i64).map_or(Value::Null, |at| Value::String(instant::iso(at).0))
}

/// `parseRecurringRuleInput`: rule text is parsed leniently, rule objects are taken as validated.
pub fn parse_input(input: &RecurrenceRuleInput) -> Option<Parsed> {
    match input {
        RecurrenceRuleInput::Json(text) => {
            let rule = parse_rule(text)?;
            let mut json: Value = serde_json::from_str(text).ok()?;
            if let (Some(until), Some(object)) = (rule.until, json.as_object_mut()) {
                object.insert("until".into(), js_date_json(until));
            }
            Some(Parsed {
                rule,
                json,
                until_is_text: false,
            })
        }
        RecurrenceRuleInput::Rule(object) => {
            let json = serde_json::to_value(object).ok()?;
            Some(Parsed {
                rule: parse_rule(&json.to_string())?,
                json,
                until_is_text: object.until.as_deref().is_some_and(|u| !u.is_empty()),
            })
        }
    }
}

/// `toLocaleDateString()` in en-US, in the server's zone (UTC).
fn locale_date(ms: f64) -> String {
    match instant::from_unix_millis(ms as i64).filter(|_| ms.is_finite()) {
        Some(at) => format!("{}/{}/{}", u8::from(at.month()), at.day(), at.year()),
        None => "Invalid Date".into(),
    }
}

/// `getRecurrenceDescription`; `None` where JavaScript threw, on a rule object's text `until`.
pub fn describe(parsed: &Parsed) -> Option<String> {
    let rule = &parsed.rule;
    let unit = match rule.frequency {
        Frequency::Daily => ("Daily", "days"),
        Frequency::Weekly => ("Weekly", "weeks"),
        Frequency::Monthly => ("Monthly", "months"),
        Frequency::Yearly => ("Yearly", "years"),
    };
    let mut description = if rule.interval == 1.0 {
        unit.0.to_owned()
    } else {
        format!("Every {} {}", js_number_string(rule.interval), unit.1)
    };
    if let Some(days) = rule
        .by_week_day
        .as_ref()
        .filter(|days| rule.frequency == Frequency::Weekly && !days.is_empty())
    {
        let names: Vec<&str> = days
            .iter()
            .map(|day| {
                WEEKDAYS
                    .get(*day as usize)
                    .filter(|_| day.fract() == 0.0 && *day >= 0.0)
                    .copied()
                    .unwrap_or_default()
            })
            .collect();
        description.push_str(&format!(" on {}", names.join(", ")));
    }
    if let Some(count) = rule.count {
        description.push_str(&format!(", {} times", js_number_string(count)));
    } else if let Some(until) = rule.until {
        if parsed.until_is_text {
            return None;
        }
        description.push_str(&format!(", until {}", locale_date(until)));
    }
    Some(description)
}

/// `splitRecurringSeriesRule`: the stored rule ending the day before `split_ms`, or `None` when it is unreadable.
pub fn split_rule(recurrence: Option<&str>, split_ms: Option<i64>) -> Option<String> {
    let recurrence = recurrence.filter(|text| !text.is_empty())?;
    parse_rule(recurrence)?;
    let mut json: Value = serde_json::from_str(recurrence).ok()?;
    let until = split_ms.map_or(f64::NAN, |ms| ms as f64 - MS_PER_DAY);
    json.as_object_mut()?
        .insert("until".into(), js_date_json(until));
    Some(json.to_string())
}

#[cfg(test)]
mod tests {
    use crate::events::recurrence::validate_rule;
    use solace_api_types::recurring::RecurrenceRule;

    use super::*;

    fn text(rule: &str) -> Parsed {
        parse_input(&RecurrenceRuleInput::Json(rule.into())).unwrap()
    }

    #[test]
    fn rule_text_echoes_unknown_keys_and_dates_its_until() {
        let parsed = text(r#"{"frequency":"daily","interval":1,"foo":1,"until":"2099-01-01"}"#);
        assert_eq!(
            parsed.json.to_string(),
            r#"{"frequency":"daily","interval":1,"foo":1,"until":"2099-01-01T00:00:00.000Z"}"#
        );
        assert_eq!(
            text(r#"{"frequency":"daily","interval":1,"until":"nope"}"#).json["until"],
            Value::Null
        );
        assert!(parse_input(&RecurrenceRuleInput::Json("{}".into())).is_none());
    }

    #[test]
    fn rules_are_checked_like_the_engine() {
        assert_eq!(
            validate_rule(
                &text(r#"{"frequency":"weekly","interval":1,"byMonthDay":[1],"byMonth":[2]}"#).rule
            ),
            [
                "byMonthDay can only be used with monthly or yearly frequency",
                "byMonth can only be used with yearly frequency"
            ]
        );
        assert_eq!(
            validate_rule(
                &text(r#"{"frequency":"daily","interval":1000,"count":2,"until":"2099-01-01"}"#)
                    .rule
            ),
            [
                "Interval must be between 1 and 999",
                "Cannot specify both count and until date"
            ]
        );
        assert_eq!(
            validate_rule(&text(r#"{"frequency":"weekly","interval":1,"byWeekDay":[7]}"#).rule),
            ["byWeekDay must be an array of numbers 0-6 (Sunday-Saturday)"]
        );
        assert!(
            validate_rule(&text(r#"{"frequency":"daily","interval":1,"byWeekDay":[1,2]}"#).rule)
                .is_empty()
        );
    }

    #[test]
    fn descriptions_read_like_the_engine() {
        let describe_text = |rule: &str| describe(&text(rule));
        assert_eq!(
            describe_text(r#"{"frequency":"weekly","interval":2,"byWeekDay":[0,6],"count":3}"#)
                .as_deref(),
            Some("Every 2 weeks on Sun, Sat, 3 times")
        );
        assert_eq!(
            describe_text(
                r#"{"frequency":"weekly","interval":1,"until":"2099-12-01T00:00:00.000Z"}"#
            )
            .as_deref(),
            Some("Weekly, until 12/1/2099")
        );
        assert_eq!(
            describe_text(r#"{"frequency":"daily","interval":1,"until":"nope"}"#).as_deref(),
            Some("Daily, until Invalid Date")
        );
        let object = RecurrenceRule {
            frequency: "weekly".into(),
            interval: 1,
            count: None,
            until: Some("2099-12-01T00:00:00.000Z".into()),
            timezone: None,
            by_week_day: None,
            by_month_day: None,
            by_month: None,
        };
        let parsed = parse_input(&RecurrenceRuleInput::Rule(object)).unwrap();
        assert_eq!(
            describe(&parsed),
            None,
            "a text until on a rule object threw"
        );
    }

    #[test]
    fn splits_end_the_old_half_a_day_early() {
        let split = |rule: &str, at: Option<i64>| split_rule(Some(rule), at);
        assert_eq!(
            split(
                r#"{"frequency":"weekly","interval":1,"count":5}"#,
                instant::parse_js_date("2099-03-09T09:00:00.000Z")
            )
            .as_deref(),
            Some(
                r#"{"frequency":"weekly","interval":1,"count":5,"until":"2099-03-08T09:00:00.000Z"}"#
            )
        );
        assert_eq!(
            split(r#"{"until":"x","frequency":"daily","interval":1}"#, None).as_deref(),
            Some(r#"{"until":null,"frequency":"daily","interval":1}"#),
            "an unreadable split date stores a null until in place"
        );
        assert_eq!(split("{}", Some(0)), None);
        assert_eq!(split_rule(None, Some(0)), None);
    }
}
