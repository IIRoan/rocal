//! node-ical 0.26's parser (`ical.js`): lines into the object tree parse-ics reads, with its merging and date handling, minus the quirks Rust fixes.

use std::collections::{BTreeMap, HashMap};
use std::sync::LazyLock;

use regex_lite::Regex;

use super::zones::strip_quotes;
use super::{js, pattern, rrule, vtimezone, zones};
use crate::http::zod::{js_number, js_number_string};

static LINE: LazyLock<Regex> = LazyLock::new(|| {
    pattern(
        r#"^([-0-9A-Za-z_]+)((?:;[-0-9A-Za-z_]+=(?:"[^"]*"|[^":;]+))*):([^\n\r\x{2028}\x{2029}]*)$"#,
    )
});
static DATE_ONLY: LazyLock<Regex> = LazyLock::new(|| pattern(r"^(\d{4})(\d{2})(\d{2})"));
static DATE_TIME: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$"));
static EIGHT_DIGITS: LazyLock<Regex> = LazyLock::new(|| pattern(r"^\d{8}$"));
static X_NAME: LazyLock<Regex> = LazyLock::new(|| pattern(r"X-[-0-9A-Za-z_]+"));
static DURATION_PART: LazyLock<Regex> = LazyLock::new(|| pattern(r"-?\d{1,10}[WDHMS]"));
static MILLIS: LazyLock<Regex> = LazyLock::new(|| pattern(r"\.\d{3}"));
static UNTIL: LazyLock<Regex> = LazyLock::new(|| pattern(r"UNTIL=(\d{8})(T\d{6})?(Z)?"));
static UNTIL_DATE_TIME: LazyLock<Regex> = LazyLock::new(|| pattern(r"UNTIL=\d{8}T\d{6}Z?"));
static UNTIL_LOCAL: LazyLock<Regex> = LazyLock::new(|| pattern(r"UNTIL=\d{8}T\d{6}"));

/// Set on a component whose RRULE could not be read, so only that event fails instead of the whole feed.
pub const RRULE_ERROR: &str = "\u{0}rrule-error";

/// A JavaScript `Date` with node-ical's `tz` and `dateOnly` metadata; `ms` is `None` for an invalid date.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct JsDate {
    pub ms: Option<i64>,
    pub tz: Option<String>,
    pub date_only: bool,
}

/// The values node-ical stores; absent keys are JavaScript's `undefined`.
#[derive(Debug, Clone)]
pub enum Val {
    Str(String),
    Num(f64),
    Bool(bool),
    /// `{ params, val }`, a property with parameters.
    Param(Box<Obj>, String),
    Date(JsDate),
    List(Vec<Val>),
    Obj(Box<Obj>),
    Rrule(Box<rrule::Options>),
}

impl Val {
    pub fn truthy(&self) -> bool {
        match self {
            Val::Str(text) => !text.is_empty(),
            Val::Num(number) => *number != 0.0 && !number.is_nan(),
            Val::Bool(flag) => *flag,
            _ => true,
        }
    }

    /// `String(value)`.
    pub fn js_string(&self) -> String {
        match self {
            Val::Str(text) => text.clone(),
            Val::Num(number) if number.is_infinite() => if *number > 0.0 {
                "Infinity"
            } else {
                "-Infinity"
            }
            .into(),
            Val::Num(number) => js_number_string(*number),
            Val::Bool(flag) => flag.to_string(),
            Val::Date(date) => date
                .ms
                .map_or_else(|| "Invalid Date".into(), js::iso_string),
            Val::List(items) => items
                .iter()
                .map(Val::js_string)
                .collect::<Vec<_>>()
                .join(","),
            Val::Param(..) | Val::Obj(_) | Val::Rrule(_) => "[object Object]".into(),
        }
    }

    pub fn as_obj(&self) -> Option<&Obj> {
        match self {
            Val::Obj(obj) => Some(obj),
            _ => None,
        }
    }

    fn finite(value: Option<&Val>) -> f64 {
        match value {
            Some(Val::Num(number)) if number.is_finite() => *number,
            _ => 0.0,
        }
    }
}

/// A JavaScript object: array-index keys first in numeric order, then the others in insertion order.
#[derive(Debug, Clone, Default)]
pub struct Obj {
    indexed: BTreeMap<u32, Val>,
    named: Vec<(String, Option<Val>)>,
    positions: HashMap<String, usize>,
}

fn array_index(key: &str) -> Option<u32> {
    let canonical =
        key == "0" || (!key.starts_with('0') && key.bytes().all(|b| b.is_ascii_digit()));
    key.parse::<u32>()
        .ok()
        .filter(|index| canonical && !key.is_empty() && *index != u32::MAX)
}

impl Obj {
    pub fn with_type(kind: &str) -> Self {
        let mut obj = Self::default();
        obj.set("type", Val::Str(kind.to_owned()));
        obj
    }

    pub fn get(&self, key: &str) -> Option<&Val> {
        match array_index(key) {
            Some(index) => self.indexed.get(&index),
            None => self
                .positions
                .get(key)
                .and_then(|&at| self.named[at].1.as_ref()),
        }
    }

    fn get_mut(&mut self, key: &str) -> Option<&mut Val> {
        match array_index(key) {
            Some(index) => self.indexed.get_mut(&index),
            None => self
                .positions
                .get(key)
                .and_then(|&at| self.named[at].1.as_mut()),
        }
    }

    pub fn set(&mut self, key: &str, val: Val) {
        if let Some(index) = array_index(key) {
            self.indexed.insert(index, val);
        } else if let Some(&at) = self.positions.get(key) {
            self.named[at].1 = Some(val);
        } else {
            self.positions.insert(key.to_owned(), self.named.len());
            self.named.push((key.to_owned(), Some(val)));
        }
    }

    fn remove(&mut self, key: &str) -> Option<Val> {
        match array_index(key) {
            Some(index) => self.indexed.remove(&index),
            None => {
                let at = self.positions.remove(key)?;
                self.named[at].1.take()
            }
        }
    }

    pub fn entries(&self) -> impl Iterator<Item = (String, &Val)> {
        self.indexed
            .iter()
            .map(|(index, val)| (index.to_string(), val))
            .chain(
                self.named
                    .iter()
                    .filter_map(|(key, val)| val.as_ref().map(|val| (key.clone(), val))),
            )
    }

    pub fn values(&self) -> impl Iterator<Item = &Val> {
        self.entries().map(|(_, val)| val)
    }

    fn is_empty(&self) -> bool {
        self.values().next().is_none()
    }

    pub fn kind(&self) -> Option<&str> {
        match self.get("type") {
            Some(Val::Str(kind)) => Some(kind),
            _ => None,
        }
    }

    fn date(&self, key: &str) -> Option<&JsDate> {
        match self.get(key) {
            Some(Val::Date(date)) => Some(date),
            _ => None,
        }
    }
}

/// RFC 5545 text unescaping, in node-ical's order.
fn text(value: &str) -> String {
    let unescaped = value
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\n", "\n")
        .replace("\\N", "\n")
        .replace("\\\\", "\\");
    strip_quotes(&unescaped).to_owned()
}

fn parse_value(value: &str) -> Val {
    match value {
        "TRUE" => Val::Bool(true),
        "FALSE" => Val::Bool(false),
        _ => {
            let number = js_number(value);
            if number.is_nan() {
                Val::Str(strip_quotes(value).to_owned())
            } else {
                Val::Num(number)
            }
        }
    }
}

fn parse_parameters(parameters: &[String]) -> Obj {
    let mut out = Obj::default();
    for element in parameters {
        if let Some((key, value)) = element.split_once('=') {
            out.set(key, parse_value(value));
        }
    }
    out
}

fn store_value(curr: &mut Obj, name: &str, value: Val) {
    match curr.get_mut(name) {
        Some(Val::List(items)) => items.push(value),
        Some(current) => {
            let previous = std::mem::replace(current, Val::Bool(false));
            *current = Val::List(vec![previous, value]);
        }
        None => curr.set(name, value),
    }
}

fn store_parameter(curr: &mut Obj, name: &str, value: &str, parameters: &[String]) {
    let plain = parameters.is_empty()
        || (parameters.len() == 1
            && (parameters[0] == "CHARSET=utf-8" || parameters[0] == "VALUE=TEXT"));
    let data = if plain {
        Val::Str(text(value))
    } else {
        Val::Param(Box::new(parse_parameters(parameters)), text(value))
    };
    store_value(curr, name, data);
}

fn is_date_only(value: &str, parameters: &[String]) -> bool {
    (parameters.iter().any(|p| p == "VALUE=DATE")
        && !parameters.iter().any(|p| p == "VALUE=DATE-TIME"))
        || EIGHT_DIGITS.is_match(value)
}

fn number(captures: &regex_lite::Captures<'_>, index: usize) -> i64 {
    captures
        .get(index)
        .and_then(|m| m.as_str().parse().ok())
        .unwrap_or(0)
}

/// The file's VTIMEZONE with this (quote-stripped) TZID, wherever in the file it stands.
fn find_vtimezone<'a>(zones: &'a [FileZone], tzid: &str) -> Option<&'a FileZone> {
    zones.iter().find(|zone| {
        let ids: Vec<String> = match zone.component.get("tzid") {
            Some(Val::List(items)) => items.iter().map(Val::js_string).collect(),
            Some(other) => vec![other.js_string()],
            None => vec!["undefined".into()],
        };
        ids.iter().any(|id| strip_quotes(id) == tzid)
    })
}

/// `resolveVTimezoneToIana`: the zone whose offsets match the STANDARD/DAYLIGHT rules in force in `year`.
fn resolve_vtimezone(vtimezone: &Obj, year: i64) -> (Option<String>, Option<String>) {
    let blocks = |kind: &str| -> Vec<&Obj> {
        vtimezone
            .values()
            .filter_map(Val::as_obj)
            .filter(|block| block.kind() == Some(kind))
            .collect()
    };
    let minutes = |kind: &str| {
        applicable_block(blocks(kind), year)
            .and_then(|block| block.get("tzoffsetto"))
            .filter(|offset| offset.truthy())
            .and_then(|offset| zones::offset_label_to_minutes(&offset.js_string()))
    };
    zones::vtimezone_zone(minutes("STANDARD"), minutes("DAYLIGHT"), year)
}

/// `pickApplicableBlock`: the newest rule whose DTSTART year is not after `year`, else the oldest.
fn applicable_block(mut blocks: Vec<&Obj>, year: i64) -> Option<&Obj> {
    let block_year = |block: &Obj| {
        block
            .date("start")
            .and_then(|start| start.ms)
            .map_or(0, |ms| js::fields(ms).year)
    };
    if blocks.len() <= 1 {
        return blocks.pop();
    }
    blocks.sort_by_key(|block| std::cmp::Reverse(block_year(block)));
    blocks
        .iter()
        .find(|block| block_year(block) <= year)
        .or(blocks.last())
        .copied()
}

/// `getDateKey`: the calendar date a RECURRENCE-ID falls on, in its own zone.
fn date_key(date: &JsDate) -> Result<String, String> {
    let invalid = || "Invalid Date".to_owned();
    if date.date_only {
        return Ok(match date.ms {
            Some(ms) => {
                let f = js::fields(ms);
                format!("{}-{:02}-{:02}", f.year, f.month, f.day)
            }
            None => "NaN-NaN-NaN".into(),
        });
    }
    if let (Some(tz), Some(ms)) = (date.tz.as_deref().filter(|tz| !tz.is_empty()), date.ms) {
        let info = zones::resolve_tzid(tz);
        if let Some(day) = info
            .iana
            .or(info.offset)
            .and_then(|zone| zones::lookup(&zone))
            .and_then(|zone| zones::plain_date_in(&zone, ms))
        {
            return Ok(day);
        }
    }
    let iso = js::iso_string(date.ms.ok_or_else(invalid)?);
    Ok(iso.chars().take(10).collect())
}

/// A TZID written as a UTC offset (`+0100`, which `parseParameters` reads as the number 100): the offset and the fixed zone to file it under.
fn offset_tzid(parameters: &[String]) -> Option<(String, String)> {
    let raw = strip_quotes(
        parameters
            .iter()
            .rev()
            .find_map(|p| p.strip_prefix("TZID="))?,
    );
    if !raw.starts_with(['+', '-']) {
        return None;
    }
    let info = zones::resolve_tzid(raw);
    let offset = info.offset?;
    Some((offset.clone(), info.etc.unwrap_or(offset)))
}

/// `new Date(value)`.
fn time_value(value: Option<&Val>) -> Option<i64> {
    match value? {
        Val::Date(date) => date.ms,
        Val::Num(number) if number.is_finite() => js::clip(number.trunc() as i64),
        Val::Bool(flag) => Some(i64::from(*flag)),
        Val::Str(text) => js::parse_date_string(text),
        Val::List(_) => js::parse_date_string(&value?.js_string()),
        _ => None,
    }
}

/// `cloneDateWithMeta(source, newTime = source)`: an explicit `undefined` falls back to `source` too.
fn clone_date_meta(source: Option<&Val>, new_time: Option<Option<i64>>) -> JsDate {
    let (tz, date_only) = match source {
        Some(Val::Date(date)) => (date.tz.clone().filter(|tz| !tz.is_empty()), date.date_only),
        _ => (None, false),
    };
    JsDate {
        ms: new_time.unwrap_or_else(|| time_value(source)),
        tz,
        date_only,
    }
}

/// `tzUtil.utcAdd`: `undefined` unless `date` is a `Date`.
fn utc_add(date: Option<Option<i64>>, amount: i64, unit_ms: i64) -> Option<Option<i64>> {
    date.map(|ms| {
        ms.and_then(|ms| {
            let sum = i128::from(ms) + i128::from(amount) * i128::from(unit_ms);
            i64::try_from(sum).ok().and_then(js::clip)
        })
    })
}

/// A VTIMEZONE of the file, with its STANDARD and DAYLIGHT parts read for evaluation.
struct FileZone {
    component: Obj,
    parts: Vec<vtimezone::Observance>,
}

/// The STANDARD and DAYLIGHT parts of a VTIMEZONE as the evaluator reads them; a part without readable offsets is left out.
fn observances(component: &Obj) -> Vec<vtimezone::Observance> {
    let civil = |ms: i64| {
        jiff::Timestamp::from_millisecond(ms)
            .ok()
            .map(|at| jiff::tz::TimeZone::UTC.to_datetime(at))
    };
    let texts = |value: Option<&Val>| -> Vec<String> {
        match value {
            Some(Val::Str(text) | Val::Param(_, text)) => vec![text.clone()],
            Some(Val::List(items)) => items
                .iter()
                .filter_map(|item| match item {
                    Val::Str(text) | Val::Param(_, text) => Some(text.clone()),
                    _ => None,
                })
                .collect(),
            _ => Vec::new(),
        }
    };
    component
        .values()
        .filter_map(Val::as_obj)
        .filter_map(|block| {
            let daylight = match block.kind()? {
                "DAYLIGHT" => true,
                "STANDARD" => false,
                _ => return None,
            };
            let offset = |key: &str| {
                let minutes = zones::offset_label_to_minutes(&block.get(key)?.js_string())?;
                jiff::tz::Offset::from_seconds(i32::try_from(minutes * 60).ok()?).ok()
            };
            let rule = texts(block.get("rrule"))
                .first()
                .and_then(|line| line.split_once(':'))
                .map(|(_, rule)| rule.to_owned());
            let dates = texts(block.get("rdate"))
                .iter()
                .flat_map(|text| text.split(','))
                .filter_map(|date| vtimezone::basic_date_time(date).map(|(at, _)| at))
                .collect();
            Some(vtimezone::Observance {
                daylight,
                start: block.date("start")?.ms.and_then(civil)?,
                from: offset("tzoffsetfrom")?,
                to: offset("tzoffsetto")?,
                rule,
                dates,
            })
        })
        .collect()
}

/// The file's VTIMEZONEs, read ahead so a TZID can name one defined further down.
fn file_zones(content: &str) -> Vec<FileZone> {
    let mut captured = String::from("BEGIN:VCALENDAR\n");
    let mut inside = false;
    for line in content.split('\n').map(|line| line.trim_end_matches('\r')) {
        inside |= line == "BEGIN:VTIMEZONE";
        if inside {
            captured.push_str(line);
            captured.push('\n');
        }
        inside &= line != "END:VTIMEZONE";
    }
    captured.push_str("END:VCALENDAR\n");
    let Ok(root) = read(&captured, None, Vec::new()) else {
        return Vec::new();
    };
    root.values()
        .filter_map(Val::as_obj)
        .filter(|component| component.kind() == Some("VTIMEZONE"))
        .map(|component| FileZone {
            parts: observances(component),
            component: component.clone(),
        })
        .collect()
}

pub struct Reader {
    stack: Vec<Obj>,
    next_id: u64,
    zones: Vec<FileZone>,
    /// Where floating times are read when the calendar names no zone: the user's.
    floating_zone: Option<String>,
}

/// node-ical's `parseICS`: the root object, or the message of the error that aborted the whole feed.
pub fn parse(content: &str, user_timezone: &str) -> Result<Obj, String> {
    let zones = if content.contains("BEGIN:VTIMEZONE") {
        file_zones(content)
    } else {
        Vec::new()
    };
    read(content, Some(user_timezone), zones)
}

fn read(content: &str, user_timezone: Option<&str>, zones: Vec<FileZone>) -> Result<Obj, String> {
    let lines: Vec<&str> = content
        .split('\n')
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
        .collect();
    let mut reader = Reader {
        stack: Vec::new(),
        next_id: 0,
        zones,
        floating_zone: super::normalize_timezone(user_timezone)
            .filter(|zone| zones::lookup(zone).is_some()),
    };
    let mut ctx = Obj::default();
    let mut index = 0;
    while index < lines.len() {
        let mut line = lines[index].to_owned();
        while lines
            .get(index + 1)
            .is_some_and(|next| next.starts_with([' ', '\t']))
        {
            line.push_str(&lines[index + 1][1..]);
            index += 1;
        }
        index += 1;
        if line.contains("TZID=") && !line.contains("\"(") {
            line = line.replace('"', "");
        }
        let Some(captures) = LINE.captures(&line) else {
            continue;
        };
        let name = captures.get(1).map_or("", |m| m.as_str()).to_owned();
        let parameters: Vec<String> = captures
            .get(2)
            .map(|m| m.as_str())
            .filter(|p| !p.is_empty())
            .map(|p| p.split(';').skip(1).map(str::to_owned).collect())
            .unwrap_or_default();
        let value = captures.get(3).map_or("", |m| m.as_str()).to_owned();
        ctx = reader.handle(&name, &value, parameters, ctx, &line)?;
    }
    ctx.remove("type");
    ctx.remove("params");
    Ok(ctx)
}

impl Reader {
    fn handle(
        &mut self,
        name: &str,
        value: &str,
        mut parameters: Vec<String>,
        mut curr: Obj,
        line: &str,
    ) -> Result<Obj, String> {
        let stored = match name {
            "BEGIN" => {
                self.stack.push(curr);
                return Ok(Obj::with_type(value));
            }
            "END" => return self.end(value, curr),
            "SUMMARY" => "summary",
            "DESCRIPTION" => "description",
            "URL" => "url",
            "UID" => "uid",
            "LOCATION" => "location",
            "CLASS" => "class",
            "TRANSP" => "transparency",
            "PERCENT-COMPLETE" => "completion",
            "DTSTART" => {
                // A repeated DTSTART is ignored (node-ical failed the whole feed on it).
                if curr.get("start").is_some() {
                    return Ok(curr);
                }
                self.date_parameter(&mut curr, "start", value, &mut parameters)?;
                let kind = if is_date_only(value, &parameters) {
                    "date"
                } else {
                    "date-time"
                };
                store_value(&mut curr, "datetype", Val::Str(kind.into()));
                return Ok(curr);
            }
            "DTEND" | "DUE" => {
                let key = if name == "DTEND" { "end" } else { "due" };
                if curr.get(key).is_some() {
                    return Ok(curr);
                }
                self.date_parameter(&mut curr, key, value, &mut parameters)?;
                return Ok(curr);
            }
            "COMPLETED" | "DTSTAMP" | "CREATED" | "LAST-MODIFIED" | "RECURRENCE-ID" => {
                let key = match name {
                    "COMPLETED" => "completed",
                    "DTSTAMP" => "dtstamp",
                    "CREATED" => "created",
                    "LAST-MODIFIED" => "lastmodified",
                    _ => "recurrenceid",
                };
                self.date_parameter(&mut curr, key, value, &mut parameters)?;
                return Ok(curr);
            }
            // Stored by node-ical but never read by parse-ics, and they cannot fail.
            "GEO" | "CATEGORIES" | "FREEBUSY" => return Ok(curr),
            "EXDATE" => {
                self.excluded_dates(&mut curr, value, &parameters);
                return Ok(curr);
            }
            "SEQUENCE" => {
                curr.set("sequence", parse_value(value));
                return Ok(curr);
            }
            "RRULE" => {
                curr.set("rrule", Val::Str(line.to_owned()));
                return Ok(curr);
            }
            _ if X_NAME.is_match(name) && !self.stack.is_empty() => {
                store_parameter(&mut curr, &name[2..], value, &parameters);
                return Ok(curr);
            }
            _ => {
                store_parameter(&mut curr, &name.to_lowercase(), value, &parameters);
                return Ok(curr);
            }
        };
        store_parameter(&mut curr, stored, value, &parameters);
        Ok(curr)
    }

    /// `dateParameter`: DATE values as host-local (UTC) midnight, UTC times, TZIDs and floating times resolved like node-ical.
    fn date_parameter(
        &self,
        curr: &mut Obj,
        name: &str,
        value: &str,
        parameters: &mut Vec<String>,
    ) -> Result<(), String> {
        let mut value = value.to_owned();
        if let Some(at) = parameters.iter().position(|p| p == "TZID=tzone") {
            let mut parts = value.split(':');
            let head = parts.next().unwrap_or_default().to_owned();
            let rest = parts.next().map(str::to_owned);
            parameters[at] = format!("{}:{head}", parameters[at]);
            match rest {
                Some(rest) => value = rest,
                None => {
                    store_value(curr, name, Val::Str(String::new()));
                    return Ok(());
                }
            }
        }
        if is_date_only(&value, parameters)
            && let Some(c) = DATE_ONLY.captures(&value)
        {
            let ms = js::date_utc(number(&c, 1), number(&c, 2) - 1, number(&c, 3), 0, 0, 0);
            store_value(
                curr,
                name,
                Val::Date(JsDate {
                    ms,
                    tz: None,
                    date_only: true,
                }),
            );
            return Ok(());
        }
        let Some(c) = DATE_TIME.captures(&value) else {
            store_value(curr, name, Val::Str(text(&value)));
            return Ok(());
        };
        let (year, month_index, day) = (number(&c, 1), number(&c, 2) - 1, number(&c, 3));
        let (hour, minute, second) = (number(&c, 4), number(&c, 5), number(&c, 6));
        let local = || js::date_utc(year, month_index, day, hour, minute, second);
        let date = if c.get(7).is_some() {
            JsDate {
                ms: local(),
                tz: Some("Etc/UTC".into()),
                date_only: false,
            }
        } else if matches!(curr.kind(), Some("STANDARD" | "DAYLIGHT")) {
            let wall = js::fields(local().unwrap_or(0));
            JsDate {
                ms: js::make_date(
                    year,
                    wall.month - 1,
                    wall.day,
                    wall.hour,
                    wall.minute,
                    wall.second,
                    0,
                ),
                ..JsDate::default()
            }
        } else if let Some((offset, zone)) = offset_tzid(parameters) {
            JsDate {
                ms: zones::parse_with_offset(&value, &offset)?,
                tz: Some(zone),
                date_only: false,
            }
        } else {
            match parse_parameters(parameters)
                .get("TZID")
                .filter(|tz| tz.truthy())
            {
                Some(tz) => {
                    let tz = strip_quotes(&tz.js_string()).to_owned();
                    self.zoned_date(&value, tz, year, parameters, local)?
                }
                None => self.floating_date(&value, local),
            }
        };
        store_value(curr, name, Val::Date(date));
        Ok(())
    }

    /// Each date of an EXDATE line, read like DTSTART, onto the `exdate` list; an unreadable one is skipped.
    fn excluded_dates(&self, curr: &mut Obj, value: &str, parameters: &[String]) {
        for part in value.split(',') {
            let mut read = Obj::default();
            let mut parameters = parameters.to_vec();
            if self
                .date_parameter(&mut read, "exdate", part, &mut parameters)
                .is_err()
            {
                continue;
            }
            let Some(date) = read
                .remove("exdate")
                .filter(|date| matches!(date, Val::Date(_)))
            else {
                continue;
            };
            match curr.get_mut("exdate") {
                Some(Val::List(dates)) => dates.push(date),
                _ => curr.set("exdate", Val::List(vec![date])),
            }
        }
    }

    /// A DATE-TIME with a TZID parameter.
    fn zoned_date(
        &self,
        value: &str,
        mut tz: String,
        year: i64,
        parameters: &mut Vec<String>,
        local: impl Fn() -> Option<i64>,
    ) -> Result<JsDate, String> {
        // A TZID the tz database does not know reads by its own VTIMEZONE's rules, whatever its prefix.
        if !zones::is_named_zone(&tz)
            && let Some(zone) = find_vtimezone(&self.zones, &tz)
            && let Some(at) = local()
                .and_then(|ms| jiff::Timestamp::from_millisecond(ms).ok())
                .map(|at| jiff::tz::TimeZone::UTC.to_datetime(at))
            && let Some(instant) = vtimezone::instant(&zone.parts, at)
        {
            // The stored zone: CLDR's for a Windows name, libical's X-LIC-LOCATION, else the first zone with the same offsets.
            let location = match zone.component.get("LIC-LOCATION") {
                Some(Val::Str(location)) if zones::is_named_zone(location) => {
                    Some(location.clone())
                }
                _ => None,
            };
            let label = zones::windows_zone(&tz).or(location).or_else(|| {
                let (iana, offset) = resolve_vtimezone(&zone.component, year);
                iana.or(offset)
            });
            return Ok(JsDate {
                ms: Some(instant.as_millisecond()),
                tz: label,
                date_only: false,
            });
        }
        if tz == "tzone://Microsoft/Custom"
            || tz == "(no TZ description)"
            || tz.starts_with("Customized Time Zone")
            || tz.starts_with("tzone://Microsoft/")
        {
            match find_vtimezone(&self.zones, &tz) {
                Some(zone) => {
                    let (iana, offset) = resolve_vtimezone(&zone.component, year);
                    if let Some(resolved) = iana.or(offset) {
                        tz = resolved;
                    }
                }
                None => tz = zones::LOCAL_ZONE.into(),
            }
        }
        let info = zones::resolve_tzid(&tz);
        let resolved = info.iana.clone().or(info.original.clone()).unwrap_or(tz);
        let normalized = format!("TZID={resolved}");
        match parameters
            .iter()
            .position(|p| p.to_uppercase().starts_with("TZID="))
        {
            Some(at) => parameters[at] = normalized,
            None => parameters.push(normalized),
        }
        let ms = if let Some(offset) = &info.offset {
            zones::parse_with_offset(value, offset)?
        } else if let Some(iana) = &info.iana {
            zones::parse_date_time_in_zone(value, iana)
        } else {
            // A TZID no table knows reads like a floating time, in the zone the event will be filed under.
            return Ok(self.floating_date(value, local));
        };
        let tz = parse_parameters(parameters)
            .get("TZID")
            .map(|tz| strip_quotes(&tz.js_string()).to_owned())
            .filter(|tz| !tz.is_empty());
        Ok(JsDate {
            ms,
            tz,
            date_only: false,
        })
    }

    /// A DATE-TIME without a TZID: in the calendar's X-WR-TIMEZONE when it names a zone, else in the user's, as the on-device import reads it.
    fn floating_date(&self, value: &str, local: impl Fn() -> Option<i64>) -> JsDate {
        match self.calendar_zone().or_else(|| self.floating_zone.clone()) {
            Some(zone) => JsDate {
                ms: zones::parse_date_time_in_zone(value, &zone),
                tz: Some(zone),
                date_only: false,
            },
            None => JsDate {
                ms: local(),
                ..JsDate::default()
            },
        }
    }

    /// The enclosing calendar's X-WR-TIMEZONE, as parse-ics normalizes it, when it is a zone.
    fn calendar_zone(&self) -> Option<String> {
        let calendar = self
            .stack
            .iter()
            .rev()
            .find(|obj| obj.kind() == Some("VCALENDAR"))?;
        let Some(Val::Str(zone)) = calendar.get("WR-TIMEZONE") else {
            return None;
        };
        super::normalize_timezone(Some(zone)).and_then(|zone| zones::iana_zone(&zone))
    }

    fn next_id(&mut self) -> String {
        self.next_id += 1;
        format!("\u{0}component-{}", self.next_id)
    }

    /// The END handler: RRULE conversion, then filing the component into its parent.
    fn end(&mut self, component: &str, mut curr: Obj) -> Result<Obj, String> {
        if matches!(component, "VEVENT" | "VTODO" | "VJOURNAL")
            && curr.get("rrule").is_some_and(Val::truthy)
            && let Err(message) = convert_rrule(&mut curr)
        {
            curr.set(RRULE_ERROR, Val::Str(message));
        }
        if component == "VCALENDAR" {
            let strings: Vec<String> = curr
                .entries()
                .filter(|(_, val)| matches!(val, Val::Str(_)))
                .map(|(key, _)| key)
                .collect();
            let mut properties = Obj::default();
            for key in strings {
                if let Some(val) = curr.remove(&key) {
                    properties.set(&key, val);
                }
            }
            if !properties.is_empty() {
                curr.set("vcalendar", Val::Obj(Box::new(properties)));
            }
            return Ok(curr);
        }
        let parent = self.stack.pop();
        if !curr.get("end").is_some_and(Val::truthy) {
            let end = default_end(&curr);
            curr.set("end", Val::Date(end));
        }
        if let Some(uid) = curr.get("uid").filter(|uid| uid.truthy()) {
            let key = uid.js_string();
            let mut parent =
                parent.ok_or("undefined is not an object (evaluating 'par[curr.uid]')")?;
            file_by_uid(&mut parent, &key, curr)?;
            return Ok(parent);
        }
        let mut parent = parent.ok_or(if component == "VALARM" {
            "undefined is not an object (evaluating 'par.type')"
        } else {
            "undefined is not an object (evaluating 'par[id] = curr')"
        })?;
        if component == "VALARM" && matches!(parent.kind(), Some("VEVENT" | "VTODO")) {
            return Ok(parent);
        }
        if let Some(method) = parent.get("method").filter(|m| m.truthy()).cloned() {
            curr.set("method", method);
        }
        let id = self.next_id();
        parent.set(&id, Val::Obj(Box::new(curr)));
        Ok(parent)
    }
}

/// RFC 5545 §3.6.1: no DTEND means DURATION, or the start (+1 day for DATE starts).
fn default_end(curr: &Obj) -> JsDate {
    const UNITS: [(char, i64); 5] = [
        ('W', 7 * js::MS_PER_DAY),
        ('D', js::MS_PER_DAY),
        ('H', 3_600_000),
        ('M', 60_000),
        ('S', 1000),
    ];
    let start = curr.get("start");
    let start_time = match start {
        Some(Val::Date(date)) => Some(date.ms),
        _ => None,
    };
    let date_time = matches!(curr.get("datetype"), Some(Val::Str(kind)) if kind == "date-time");
    let Some(duration) = curr.get("duration") else {
        return if date_time {
            clone_date_meta(start, None)
        } else {
            clone_date_meta(start, utc_add(start_time, 1, js::MS_PER_DAY))
        };
    };
    let text = match duration {
        Val::Param(_, val) if !val.is_empty() => val.clone(),
        other if other.truthy() => other.js_string(),
        _ => String::new(),
    };
    let parts: Vec<&str> = DURATION_PART.find_iter(&text).map(|m| m.as_str()).collect();
    if parts.is_empty() {
        return clone_date_meta(start, None);
    }
    let sign = if text.starts_with('-') { -1 } else { 1 };
    let mut end_time = start_time;
    for part in parts {
        let (amount, unit) = part.split_at(part.len() - 1);
        let factor = UNITS
            .iter()
            .find(|(code, _)| unit.starts_with(*code))
            .map_or(0, |(_, factor)| *factor);
        end_time = utc_add(end_time, amount.parse::<i64>().unwrap_or(0) * sign, factor);
    }
    clone_date_meta(start, end_time)
}

/// Files a component with a UID into its parent: first sighting, newer SEQUENCE merges, and RECURRENCE-ID overrides.
fn file_by_uid(parent: &mut Obj, key: &str, mut curr: Obj) -> Result<(), String> {
    let has_recurrence_id = curr.get("recurrenceid").is_some();
    if parent.get(key).is_none() {
        if let Some(method) = parent.get("method").filter(|m| m.truthy()).cloned() {
            curr.set("method", method);
        }
        parent.set(key, Val::Obj(Box::new(curr.clone())));
    } else if !has_recurrence_id && let Some(Val::Obj(existing)) = parent.get_mut(key) {
        let override_then_series =
            existing.get("recurrenceid").is_some() && curr.get("rrule").is_some();
        let newer = Val::finite(curr.get("sequence")) >= Val::finite(existing.get("sequence"));
        if override_then_series || newer {
            if curr.get("rrule").is_some() {
                existing.remove(RRULE_ERROR);
            }
            for (field, val) in curr.entries() {
                existing.set(&field, val.clone());
            }
        }
    }
    if has_recurrence_id {
        let mut copy = curr.clone();
        copy.remove("recurrences");
        if let Some(Val::Obj(target)) = parent.get_mut(key) {
            if target.get("recurrences").is_none() {
                target.set("recurrences", Val::Obj(Box::default()));
            }
            if let Some(Val::Obj(recurrences)) = target.get_mut("recurrences") {
                store_override(recurrences, curr.get("recurrenceid"), copy)?;
            }
        }
    }
    if key != "__proto__"
        && let Some(Val::Obj(target)) = parent.get_mut(key)
        && target.get("rrule").is_some()
        && target.get("recurrenceid").is_some()
    {
        target.remove("recurrenceid");
    }
    Ok(())
}

/// `storeRecurrenceOverride`: keyed by date and, for DATE-TIMEs, by ISO instant; only a lower SEQUENCE for the same RECURRENCE-ID is dropped.
fn store_override(
    recurrences: &mut Obj,
    recurrence_id: Option<&Val>,
    copy: Obj,
) -> Result<(), String> {
    let Some(Val::Date(date)) = recurrence_id else {
        return Ok(());
    };
    let day = date_key(date)?;
    let instant = if date.date_only {
        None
    } else {
        Some(js::iso_string(date.ms.ok_or("Invalid Date")?))
    };
    // RFC 5545: an override replaces its own instance; another override on the same day is a different instance.
    let existing = recurrences.get(instant.as_deref().unwrap_or(&day));
    if let Some(Val::Obj(existing)) = existing
        && Val::finite(copy.get("sequence")) < Val::finite(existing.get("sequence"))
    {
        return Ok(());
    }
    recurrences.set(&day, Val::Obj(Box::new(copy.clone())));
    if let Some(instant) = instant {
        recurrences.set(&instant, Val::Obj(Box::new(copy)));
    }
    Ok(())
}

/// The END handler's RRULE preparation and the rrule-temporal construction it runs.
fn convert_rrule(curr: &mut Obj) -> Result<(), String> {
    let Some(Val::Str(line)) = curr.get("rrule") else {
        return Ok(());
    };
    let without_name = line.replacen("RRULE:", "", 1);
    let mut rule = match without_name.rfind("FREQ=") {
        Some(at) => without_name[at..].to_owned(),
        None => without_name
            .chars()
            .last()
            .map(String::from)
            .unwrap_or_default(),
    };
    if !rule.contains("DTSTART") {
        if matches!(curr.get("datetype"), Some(Val::Str(kind)) if kind == "date") {
            let original = match curr.get("start") {
                Some(Val::Date(start)) => start.clone(),
                Some(_) => return Err("originalStart.getFullYear is not a function. (In 'originalStart.getFullYear()', 'originalStart.getFullYear' is undefined)".into()),
                None => return Err("undefined is not an object (evaluating 'originalStart.getFullYear')".into()),
            };
            let ms = original.ms.and_then(|ms| {
                let f = js::fields(ms);
                js::date_utc(f.year, f.month - 1, f.day, 0, 0, 0)
            });
            curr.set(
                "start",
                Val::Date(JsDate {
                    ms,
                    tz: original.tz.filter(|tz| !tz.is_empty()),
                    date_only: original.date_only,
                }),
            );
        }
        match curr.get("start") {
            Some(Val::Date(start)) => {
                // Every branch that appends DTSTART ends in `toISOString()` for an invalid date.
                if !start.date_only && start.ms.is_none() {
                    return Err(
                        "ERROR when trying to convert to ISOString RangeError: Invalid Date".into(),
                    );
                }
                rule = MILLIS.replacen(&rule, 1, "").into_owned();
            }
            Some(other) => {
                return Err(format!(
                    "No toISOString function in curr.start {}",
                    other.js_string()
                ));
            }
            None => return Err("No toISOString function in curr.start undefined".into()),
        }
    }
    let Some(start) = curr.get("start").filter(|start| start.truthy()).cloned() else {
        return Ok(());
    };
    let mut rule_only = rule
        .split(';')
        .filter(|segment| {
            !segment.starts_with("DTSTART")
                && !segment.starts_with("VALUE=")
                && !segment.starts_with("TZID=")
        })
        .collect::<Vec<_>>()
        .join(";");
    let start_date = match &start {
        Val::Date(date) => Some(date.clone()),
        _ => None,
    };
    let date_only = start_date.as_ref().is_some_and(|date| date.date_only);
    if rule_only.contains("UNTIL=")
        && let Some(c) = UNTIL.captures(&rule_only)
    {
        let date_part = c[1].to_owned();
        let time_part = c.get(2).map(|m| m.as_str().to_owned());
        let utc = c.get(3).is_some();
        if date_only {
            if time_part.is_some() {
                rule_only = UNTIL_DATE_TIME
                    .replacen(&rule_only, 1, format!("UNTIL={date_part}").as_str())
                    .into_owned();
            }
        } else if let Some(time_part) = time_part.filter(|_| !utc) {
            rule_only = local_until(&rule_only, &date_part, &time_part, start_date.as_ref());
        }
    }
    let options = if date_only {
        let ymd = start_date.as_ref().and_then(|date| date.ms).map_or_else(
            || "NaNNaNNaN".to_owned(),
            |ms| {
                let f = js::fields(ms);
                format!("{}{:02}{:02}", f.year, f.month, f.day)
            },
        );
        rrule::date_only(&ymd, &rule_only)?
    } else {
        let Some(date) = start_date else {
            return Err("curr.start.getTime is not a function. (In 'curr.start.getTime()', 'curr.start.getTime' is undefined)".into());
        };
        date.ms.ok_or("Invalid epoch milliseconds")?;
        let zone = date
            .tz
            .as_deref()
            .filter(|tz| !tz.is_empty())
            .map(zones::resolve_tzid)
            .and_then(|info| info.iana.or(info.offset))
            .and_then(|zone| zones::temporal_id(&zone))
            .unwrap_or_else(|| "UTC".into());
        rrule::with_start(&rule_only, &zone)?
    };
    curr.set("rrule", Val::Rrule(Box::new(options)));
    Ok(())
}

/// A floating UNTIL becomes UTC through the start's zone, or just gets a `Z`.
fn local_until(rule: &str, date_part: &str, time_part: &str, start: Option<&JsDate>) -> String {
    let converted = start
        .and_then(|start| start.tz.as_deref().filter(|tz| !tz.is_empty()))
        .and_then(|tz| {
            let info = zones::resolve_tzid(tz);
            let local = format!("{date_part}{time_part}");
            match (&info.iana, info.offset_minutes) {
                (Some(iana), _) if zones::is_valid_iana(iana) => {
                    zones::parse_date_time_in_zone(&local, iana)
                }
                (_, Some(_)) => info
                    .offset
                    .as_deref()
                    .and_then(|offset| zones::parse_with_offset(&local, offset).ok().flatten()),
                _ => None,
            }
        });
    match converted {
        Some(ms) => {
            let iso = js::iso_string(ms).replace(['-', ':'], "");
            let utc = MILLIS.replacen(&iso, 1, "");
            UNTIL_LOCAL
                .replacen(rule, 1, format!("UNTIL={utc}").as_str())
                .into_owned()
        }
        None => {
            let unterminated = UNTIL_LOCAL
                .find_iter(rule)
                .find(|m| !rule[m.end()..].starts_with('Z'));
            match unterminated {
                Some(m) => format!("{}Z{}", &rule[..m.end()], &rule[m.end()..]),
                None => rule.to_owned(),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn objects_order_keys_like_javascript() {
        let mut obj = Obj::default();
        obj.set("b", Val::Bool(true));
        obj.set("10", Val::Bool(true));
        obj.set("a", Val::Bool(true));
        obj.set("2", Val::Bool(true));
        obj.set("b", Val::Bool(false));
        let keys: Vec<String> = obj.entries().map(|(key, _)| key).collect();
        assert_eq!(keys, ["2", "10", "b", "a"]);
        obj.remove("b");
        obj.set("b", Val::Bool(true));
        let keys: Vec<String> = obj.entries().map(|(key, _)| key).collect();
        assert_eq!(keys, ["2", "10", "a", "b"]);
    }

    #[test]
    fn text_unescapes_in_node_ical_order() {
        assert_eq!(text(r"a\, b\; c\nd\\e"), "a, b; c\nd\\e");
        assert_eq!(text("\"quoted\""), "quoted");
        assert_eq!(text(r"x\\n"), "x\\\n");
    }
}
