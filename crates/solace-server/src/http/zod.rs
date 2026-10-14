//! Request validation with Zod 3.25's semantics (issue order, dirty/aborted rules), rendering each issue as Zod 3 and as Zod 4 (Better Auth's endpoints) would.

use std::sync::Arc;

use regex_lite::Regex;
use serde_json::{Map, Value};

/// One issue: its path, Zod 3's message (app routes) and Zod 4's (Better Auth routes).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Issue {
    pub path: Vec<String>,
    pub message: String,
    pub zod4: String,
}

impl Issue {
    pub fn path_string(&self) -> String {
        if self.path.is_empty() {
            "root".into()
        } else {
            self.path.join(".")
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Status {
    Valid,
    Dirty,
    Aborted,
}

/// What a schema produced: aborted results carry no value, and an absent value is JavaScript's `undefined`.
struct Parsed {
    status: Status,
    value: Option<Value>,
}

impl Parsed {
    fn ok(value: Option<Value>) -> Self {
        Self {
            status: Status::Valid,
            value,
        }
    }

    fn aborted() -> Self {
        Self {
            status: Status::Aborted,
            value: None,
        }
    }
}

struct Ctx {
    issues: Vec<Issue>,
}

impl Ctx {
    fn add(&mut self, path: &[String], message: String, zod4: String) {
        self.issues.push(Issue {
            path: path.to_vec(),
            message,
            zod4,
        });
    }
}

/// Collects custom issues from `refine`/`superRefine` callbacks, relative to the refined value.
pub struct RefineCtx<'a> {
    base: &'a [String],
    issues: Vec<Issue>,
}

impl RefineCtx<'_> {
    pub fn add_issue(&mut self, message: impl Into<String>, path: &[&str]) {
        let mut full = self.base.to_vec();
        full.extend(path.iter().map(|segment| (*segment).to_owned()));
        let message = message.into();
        self.issues.push(Issue {
            path: full,
            zod4: message.clone(),
            message,
        });
    }
}

type RefineFn = Arc<dyn Fn(&Value, &mut RefineCtx<'_>) + Send + Sync>;
type TransformFn = Arc<dyn Fn(Value) -> Value + Send + Sync>;
type PreprocessFn = Arc<dyn Fn(Option<&Value>) -> Option<Value> + Send + Sync>;

#[derive(Clone)]
enum StringCheck {
    Min(usize, Option<String>),
    Max(usize, Option<String>),
    Length(usize, Option<String>),
    Regex(Regex, Option<String>),
    Datetime(Option<String>),
    Url(Option<String>),
    StartsWith(String, Option<String>),
    Email(Option<String>),
    Trim,
    ToLowerCase,
}

#[derive(Clone)]
enum NumberCheck {
    Int(Option<String>),
    Min(f64, bool, Option<String>),
    Max(f64, bool, Option<String>),
}

#[derive(Clone)]
enum Kind {
    String(Vec<StringCheck>),
    Number {
        coerce: bool,
        checks: Vec<NumberCheck>,
    },
    Boolean,
    Null,
    Any,
    Literal(Value),
    Enum(Vec<String>),
    Array {
        element: Box<Schema>,
        min: Option<(usize, Option<String>)>,
        max: Option<(usize, Option<String>)>,
    },
    Object {
        shape: Vec<(String, Schema)>,
        strict: bool,
    },
    Union(Vec<Schema>),
    Record,
    Optional(Box<Schema>),
    NonOptional(Box<Schema>),
    Nullable(Box<Schema>),
    Default(Box<Schema>, Value),
    Preprocess(PreprocessFn, Box<Schema>),
    Refine(Box<Schema>, RefineFn),
    Transform(Box<Schema>, TransformFn),
}

#[derive(Clone)]
pub struct Schema {
    kind: Kind,
}

pub fn string() -> Schema {
    Schema {
        kind: Kind::String(Vec::new()),
    }
}

pub fn number() -> Schema {
    Schema {
        kind: Kind::Number {
            coerce: false,
            checks: Vec::new(),
        },
    }
}

/// `z.coerce.number()`: JavaScript's `Number(value)` first.
pub fn coerce_number() -> Schema {
    Schema {
        kind: Kind::Number {
            coerce: true,
            checks: Vec::new(),
        },
    }
}

pub fn boolean() -> Schema {
    Schema {
        kind: Kind::Boolean,
    }
}

pub fn null() -> Schema {
    Schema { kind: Kind::Null }
}

pub fn any() -> Schema {
    Schema { kind: Kind::Any }
}

pub fn literal(value: impl Into<Value>) -> Schema {
    Schema {
        kind: Kind::Literal(value.into()),
    }
}

pub fn enumeration(values: &[&str]) -> Schema {
    Schema {
        kind: Kind::Enum(values.iter().map(|v| (*v).to_owned()).collect()),
    }
}

pub fn array(element: Schema) -> Schema {
    Schema {
        kind: Kind::Array {
            element: Box::new(element),
            min: None,
            max: None,
        },
    }
}

/// `z.object(shape)`, stripping unknown keys until `.strict()`.
pub fn object<const N: usize>(shape: [(&str, Schema); N]) -> Schema {
    Schema {
        kind: Kind::Object {
            shape: shape
                .into_iter()
                .map(|(key, schema)| (key.to_owned(), schema))
                .collect(),
            strict: false,
        },
    }
}

/// `z.record(z.string(), z.any())`: any object, kept whole.
pub fn record() -> Schema {
    Schema { kind: Kind::Record }
}

pub fn union(options: Vec<Schema>) -> Schema {
    Schema {
        kind: Kind::Union(options),
    }
}

pub fn preprocess(
    function: impl Fn(Option<&Value>) -> Option<Value> + Send + Sync + 'static,
    inner: Schema,
) -> Schema {
    Schema {
        kind: Kind::Preprocess(Arc::new(function), Box::new(inner)),
    }
}

impl Schema {
    fn with_string_check(mut self, check: StringCheck) -> Self {
        if let Kind::String(checks) = &mut self.kind {
            checks.push(check);
        }
        self
    }

    fn with_number_check(mut self, check: NumberCheck) -> Self {
        if let Kind::Number { checks, .. } = &mut self.kind {
            checks.push(check);
        }
        self
    }

    /// Minimum string length (UTF-16 units), array length or number (inclusive), by schema kind.
    pub fn min(mut self, minimum: usize) -> Self {
        match &mut self.kind {
            Kind::String(_) => self.with_string_check(StringCheck::Min(minimum, None)),
            Kind::Array { min, .. } => {
                *min = Some((minimum, None));
                self
            }
            Kind::Number { .. } => {
                self.with_number_check(NumberCheck::Min(minimum as f64, true, None))
            }
            _ => self,
        }
    }

    pub fn max(mut self, maximum: usize) -> Self {
        match &mut self.kind {
            Kind::String(_) => self.with_string_check(StringCheck::Max(maximum, None)),
            Kind::Array { max, .. } => {
                *max = Some((maximum, None));
                self
            }
            Kind::Number { .. } => {
                self.with_number_check(NumberCheck::Max(maximum as f64, true, None))
            }
            _ => self,
        }
    }

    /// Number bounds that may be negative or fractional.
    pub fn gte(self, minimum: f64) -> Self {
        self.with_number_check(NumberCheck::Min(minimum, true, None))
    }

    pub fn lte(self, maximum: f64) -> Self {
        self.with_number_check(NumberCheck::Max(maximum, true, None))
    }

    pub fn positive(self) -> Self {
        self.with_number_check(NumberCheck::Min(0.0, false, None))
    }

    pub fn nonnegative(self) -> Self {
        self.with_number_check(NumberCheck::Min(0.0, true, None))
    }

    pub fn length(self, exact: usize) -> Self {
        self.with_string_check(StringCheck::Length(exact, None))
    }

    pub fn int(self) -> Self {
        self.with_number_check(NumberCheck::Int(None))
    }

    pub fn trim(self) -> Self {
        self.with_string_check(StringCheck::Trim)
    }

    pub fn to_lowercase(self) -> Self {
        self.with_string_check(StringCheck::ToLowerCase)
    }

    pub fn regex(self, pattern: &Regex) -> Self {
        self.with_string_check(StringCheck::Regex(pattern.clone(), None))
    }

    /// `z.string().datetime()` without options: UTC `Z` only, any fractional precision.
    pub fn datetime(self) -> Self {
        self.with_string_check(StringCheck::Datetime(None))
    }

    pub fn url(self) -> Self {
        self.with_string_check(StringCheck::Url(None))
    }

    pub fn email(self) -> Self {
        self.with_string_check(StringCheck::Email(None))
    }

    pub fn starts_with(self, prefix: &str) -> Self {
        self.with_string_check(StringCheck::StartsWith(prefix.to_owned(), None))
    }

    /// Replaces the default message of the most recently added check.
    pub fn msg(mut self, message: &str) -> Self {
        let message = Some(message.to_owned());
        match &mut self.kind {
            Kind::String(checks) => {
                if let Some(
                    StringCheck::Min(_, m)
                    | StringCheck::Max(_, m)
                    | StringCheck::Length(_, m)
                    | StringCheck::Regex(_, m)
                    | StringCheck::Datetime(m)
                    | StringCheck::Url(m)
                    | StringCheck::Email(m)
                    | StringCheck::StartsWith(_, m),
                ) = checks.last_mut()
                {
                    *m = message;
                }
            }
            Kind::Number { checks, .. } => {
                if let Some(
                    NumberCheck::Int(m) | NumberCheck::Min(_, _, m) | NumberCheck::Max(_, _, m),
                ) = checks.last_mut()
                {
                    *m = message;
                }
            }
            Kind::Array { min, max, .. } => {
                if let Some((_, m)) = max.as_mut().or(min.as_mut()) {
                    *m = message;
                }
            }
            _ => {}
        }
        self
    }

    pub fn strict(mut self) -> Self {
        if let Kind::Object { strict, .. } = &mut self.kind {
            *strict = true;
        }
        self
    }

    /// `.extend()`: overridden keys keep their position, new keys go last.
    pub fn extend<const N: usize>(mut self, extra: [(&str, Schema); N]) -> Self {
        if let Kind::Object { shape, .. } = &mut self.kind {
            for (key, schema) in extra {
                match shape.iter_mut().find(|(existing, _)| existing == key) {
                    Some(slot) => slot.1 = schema,
                    None => shape.push((key.to_owned(), schema)),
                }
            }
        }
        self
    }

    pub fn optional(self) -> Self {
        Schema {
            kind: Kind::Optional(Box::new(self)),
        }
    }

    /// Rejects `undefined` even for schemas that accept it, such as `any()`.
    pub fn nonoptional(self) -> Self {
        Schema {
            kind: Kind::NonOptional(Box::new(self)),
        }
    }

    pub fn nullable(self) -> Self {
        Schema {
            kind: Kind::Nullable(Box::new(self)),
        }
    }

    pub fn nullish(self) -> Self {
        self.nullable().optional()
    }

    pub fn default(self, value: impl Into<Value>) -> Self {
        Schema {
            kind: Kind::Default(Box::new(self), value.into()),
        }
    }

    /// `.refine(check, { message, path })`.
    pub fn refine(
        self,
        check: impl Fn(&Value) -> bool + Send + Sync + 'static,
        message: &str,
        path: &'static [&'static str],
    ) -> Self {
        let message = message.to_owned();
        self.super_refine(move |value, ctx| {
            if !check(value) {
                ctx.add_issue(message.clone(), path);
            }
        })
    }

    pub fn super_refine(
        self,
        refine: impl Fn(&Value, &mut RefineCtx<'_>) + Send + Sync + 'static,
    ) -> Self {
        Schema {
            kind: Kind::Refine(Box::new(self), Arc::new(refine)),
        }
    }

    pub fn transform(self, transform: impl Fn(Value) -> Value + Send + Sync + 'static) -> Self {
        Schema {
            kind: Kind::Transform(Box::new(self), Arc::new(transform)),
        }
    }

    /// Parses `input` (`None` is `undefined`), returning the output with defaults and transforms applied.
    pub fn parse(&self, input: Option<&Value>) -> Result<Option<Value>, Vec<Issue>> {
        let mut ctx = Ctx { issues: Vec::new() };
        let parsed = self.run(input, &[], &mut ctx);
        if ctx.issues.is_empty() && parsed.status == Status::Valid {
            Ok(parsed.value)
        } else {
            Err(ctx.issues)
        }
    }

    fn run(&self, input: Option<&Value>, path: &[String], ctx: &mut Ctx) -> Parsed {
        match &self.kind {
            Kind::String(checks) => parse_string(input, checks, path, ctx),
            Kind::Number { coerce, checks } => parse_number(input, *coerce, checks, path, ctx),
            Kind::Boolean => match input {
                Some(Value::Bool(_)) => Parsed::ok(input.cloned()),
                _ => invalid_type(ctx, path, "boolean", input),
            },
            Kind::Null => match input {
                Some(Value::Null) => Parsed::ok(Some(Value::Null)),
                _ => invalid_type(ctx, path, "null", input),
            },
            Kind::Any => Parsed::ok(input.cloned()),
            Kind::Literal(expected) => {
                if input == Some(expected) {
                    Parsed::ok(input.cloned())
                } else {
                    ctx.add(
                        path,
                        format!("Invalid literal value, expected {expected}"),
                        format!("Invalid input: expected {expected}"),
                    );
                    Parsed::aborted()
                }
            }
            Kind::Enum(options) => parse_enum(input, options, path, ctx),
            Kind::Array { element, min, max } => parse_array(input, element, min, max, path, ctx),
            Kind::Object { shape, strict } => parse_object(input, shape, *strict, path, ctx),
            Kind::Union(options) => parse_union(input, options, path, ctx),
            Kind::Record => match input {
                Some(Value::Object(_)) => Parsed::ok(input.cloned()),
                _ => {
                    let message = match input {
                        None => "Required".to_owned(),
                        Some(_) => format!("Expected object, received {}", parsed_type(input)),
                    };
                    let zod4 = format!(
                        "Invalid input: expected record, received {}",
                        parsed_type(input)
                    );
                    ctx.add(path, message, zod4);
                    Parsed::aborted()
                }
            },
            Kind::Optional(inner) => match input {
                None => Parsed::ok(None),
                Some(_) => inner.run(input, path, ctx),
            },
            Kind::NonOptional(inner) => match input {
                None => {
                    ctx.add(
                        path,
                        "Required".into(),
                        "Invalid input: expected nonoptional, received undefined".into(),
                    );
                    Parsed::aborted()
                }
                Some(_) => inner.run(input, path, ctx),
            },
            Kind::Nullable(inner) => match input {
                Some(Value::Null) => Parsed::ok(Some(Value::Null)),
                _ => inner.run(input, path, ctx),
            },
            Kind::Default(inner, value) => match input {
                None => inner.run(Some(value), path, ctx),
                Some(_) => inner.run(input, path, ctx),
            },
            Kind::Preprocess(function, inner) => {
                let processed = function(input);
                let result = inner.run(processed.as_ref(), path, ctx);
                match result.status {
                    Status::Aborted => Parsed::aborted(),
                    _ => result,
                }
            }
            Kind::Refine(inner, refine) => {
                let result = inner.run(input, path, ctx);
                if result.status == Status::Aborted {
                    return Parsed::aborted();
                }
                let mut refine_ctx = RefineCtx {
                    base: path,
                    issues: Vec::new(),
                };
                refine(
                    result.value.as_ref().unwrap_or(&Value::Null),
                    &mut refine_ctx,
                );
                let status = if refine_ctx.issues.is_empty() {
                    result.status
                } else {
                    Status::Dirty
                };
                ctx.issues.extend(refine_ctx.issues);
                Parsed {
                    status,
                    value: result.value,
                }
            }
            Kind::Transform(inner, transform) => {
                let result = inner.run(input, path, ctx);
                if result.status != Status::Valid {
                    return result;
                }
                Parsed::ok(result.value.map(|value| transform(value)))
            }
        }
    }
}

/// `getParsedType` names as Zod prints them in `received`.
fn parsed_type(value: Option<&Value>) -> &'static str {
    match value {
        None => "undefined",
        Some(Value::Null) => "null",
        Some(Value::Bool(_)) => "boolean",
        Some(Value::Number(_)) => "number",
        Some(Value::String(_)) => "string",
        Some(Value::Array(_)) => "array",
        Some(Value::Object(_)) => "object",
    }
}

fn invalid_type(ctx: &mut Ctx, path: &[String], expected: &str, input: Option<&Value>) -> Parsed {
    let message = match input {
        None => "Required".to_owned(),
        Some(_) => format!("Expected {expected}, received {}", parsed_type(input)),
    };
    let zod4 = format!(
        "Invalid input: expected {expected}, received {}",
        parsed_type(input)
    );
    ctx.add(path, message, zod4);
    Parsed::aborted()
}

/// JavaScript's `String.prototype.length`.
pub fn js_length(text: &str) -> usize {
    text.encode_utf16().count()
}

/// JavaScript's `String.prototype.trim`: WhiteSpace and LineTerminator, which differs from Rust's set at U+0085 and U+FEFF.
pub fn js_trim(text: &str) -> &str {
    text.trim_matches(is_js_whitespace)
}

pub fn is_js_whitespace(c: char) -> bool {
    matches!(
        c,
        '\u{0009}'
            | '\u{000A}'
            | '\u{000B}'
            | '\u{000C}'
            | '\u{000D}'
            | '\u{0020}'
            | '\u{00A0}'
            | '\u{1680}'
            | '\u{2000}'
            ..='\u{200A}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202F}'
                | '\u{205F}'
                | '\u{3000}'
                | '\u{FEFF}'
    )
}

/// A check's custom message replaces both dialects' defaults.
fn messages(custom: &Option<String>, zod3: String, zod4: String) -> (String, String) {
    match custom {
        Some(message) => (message.clone(), message.clone()),
        None => (zod3, zod4),
    }
}

fn datetime_pattern() -> &'static Regex {
    static PATTERN: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
        let date = r"((\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\d|3[01])|(0[469]|11)-(0[1-9]|[12]\d|30)|(02)-(0[1-9]|1\d|2[0-8])))";
        let time = r"([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?";
        let source = format!("^{date}T{time}(Z)$");
        Regex::new(&source).unwrap_or_else(|error| panic!("datetime pattern: {error}"))
    });
    &PATTERN
}

fn parse_string(
    input: Option<&Value>,
    checks: &[StringCheck],
    path: &[String],
    ctx: &mut Ctx,
) -> Parsed {
    let Some(Value::String(text)) = input else {
        return invalid_type(ctx, path, "string", input);
    };
    let mut text = text.clone();
    let mut status = Status::Valid;
    for check in checks {
        let failure = match check {
            StringCheck::Min(min, message) => (js_length(&text) < *min).then(|| {
                messages(
                    message,
                    format!("String must contain at least {min} character(s)"),
                    format!("Too small: expected string to have >={min} characters"),
                )
            }),
            StringCheck::Max(max, message) => (js_length(&text) > *max).then(|| {
                messages(
                    message,
                    format!("String must contain at most {max} character(s)"),
                    format!("Too big: expected string to have <={max} characters"),
                )
            }),
            StringCheck::Length(exact, message) => {
                let length = js_length(&text);
                (length != *exact).then(|| {
                    let direction = if length < *exact {
                        "Too small"
                    } else {
                        "Too big"
                    };
                    messages(
                        message,
                        format!("String must contain exactly {exact} character(s)"),
                        format!("{direction}: expected string to have exactly {exact} characters"),
                    )
                })
            }
            StringCheck::Regex(pattern, message) => (!pattern.is_match(&text)).then(|| {
                messages(
                    message,
                    "Invalid".into(),
                    format!("Invalid string: must match pattern /{}/", pattern.as_str()),
                )
            }),
            StringCheck::Datetime(message) => (!datetime_pattern().is_match(&text)).then(|| {
                messages(
                    message,
                    "Invalid datetime".into(),
                    "Invalid ISO datetime".into(),
                )
            }),
            StringCheck::Url(message) => url::Url::parse(&text)
                .is_err()
                .then(|| messages(message, "Invalid url".into(), "Invalid URL".into())),
            StringCheck::StartsWith(prefix, message) => {
                (!text.starts_with(prefix.as_str())).then(|| {
                    messages(
                        message,
                        format!("Invalid input: must start with \"{prefix}\""),
                        format!("Invalid string: must start with \"{prefix}\""),
                    )
                })
            }
            StringCheck::Email(message) => (!crate::addresses::is_zod_email(&text)).then(|| {
                messages(
                    message,
                    "Invalid email".into(),
                    "Invalid email address".into(),
                )
            }),
            StringCheck::Trim => {
                text = js_trim(&text).to_owned();
                None
            }
            StringCheck::ToLowerCase => {
                text = text.to_lowercase();
                None
            }
        };
        if let Some((message, zod4)) = failure {
            ctx.add(path, message, zod4);
            status = Status::Dirty;
        }
    }
    Parsed {
        status,
        value: Some(Value::String(text)),
    }
}

/// JavaScript's `Number(string)`: trimmed, empty is 0, decimal, `Infinity`, and unsigned 0x/0o/0b literals.
pub fn js_number(text: &str) -> f64 {
    let trimmed = js_trim(text);
    if trimmed.is_empty() {
        return 0.0;
    }
    let radix = |prefix: &[&str], radix: u32| {
        prefix
            .iter()
            .find_map(|p| trimmed.strip_prefix(p))
            .map(|digits| u64::from_str_radix(digits, radix).map_or(f64::NAN, |n| n as f64))
    };
    if let Some(value) = radix(&["0x", "0X"], 16)
        .or_else(|| radix(&["0o", "0O"], 8))
        .or_else(|| radix(&["0b", "0B"], 2))
    {
        return value;
    }
    match trimmed {
        "Infinity" | "+Infinity" => return f64::INFINITY,
        "-Infinity" => return f64::NEG_INFINITY,
        _ => {}
    }
    let valid = trimmed
        .chars()
        .all(|c| c.is_ascii_digit() || matches!(c, '+' | '-' | '.' | 'e' | 'E'));
    if !valid || trimmed.contains("inf") {
        return f64::NAN;
    }
    trimmed.parse::<f64>().unwrap_or(f64::NAN)
}

/// `Number(value)` for the JSON values a query or body can hold.
fn coerce_to_number(input: Option<&Value>) -> f64 {
    match input {
        None => f64::NAN,
        Some(Value::Null) => 0.0,
        Some(Value::Bool(flag)) => f64::from(u8::from(*flag)),
        Some(Value::Number(number)) => number.as_f64().unwrap_or(f64::NAN),
        Some(Value::String(text)) => js_number(text),
        Some(Value::Array(items)) => match items.as_slice() {
            [] => 0.0,
            [single] => coerce_to_number(Some(single)),
            _ => f64::NAN,
        },
        Some(Value::Object(_)) => f64::NAN,
    }
}

/// How JavaScript prints a number inside a message.
pub fn js_number_string(value: f64) -> String {
    if value.fract() == 0.0 && value.abs() < 1e21 {
        format!("{}", value as i64)
    } else {
        format!("{value}")
    }
}

fn parse_number(
    input: Option<&Value>,
    coerce: bool,
    checks: &[NumberCheck],
    path: &[String],
    ctx: &mut Ctx,
) -> Parsed {
    let number = if coerce {
        coerce_to_number(input)
    } else {
        match input {
            Some(Value::Number(number)) => number.as_f64().unwrap_or(f64::NAN),
            _ => return invalid_type(ctx, path, "number", input),
        }
    };
    if number.is_nan() {
        ctx.add(
            path,
            "Expected number, received nan".into(),
            "Invalid input: expected number, received NaN".into(),
        );
        return Parsed::aborted();
    }
    let mut status = Status::Valid;
    for check in checks {
        let failure = match check {
            NumberCheck::Int(message) => {
                (number.fract() != 0.0 || !number.is_finite()).then(|| {
                    messages(
                        message,
                        "Expected integer, received float".into(),
                        "Invalid input: expected int, received number".into(),
                    )
                })
            }
            NumberCheck::Min(min, inclusive, message) => {
                let fails = if *inclusive {
                    number < *min
                } else {
                    number <= *min
                };
                fails.then(|| {
                    let (bound, symbol) = if *inclusive {
                        ("greater than or equal to", ">=")
                    } else {
                        ("greater than", ">")
                    };
                    let min = js_number_string(*min);
                    messages(
                        message,
                        format!("Number must be {bound} {min}"),
                        format!("Too small: expected number to be {symbol}{min}"),
                    )
                })
            }
            NumberCheck::Max(max, inclusive, message) => {
                let fails = if *inclusive {
                    number > *max
                } else {
                    number >= *max
                };
                fails.then(|| {
                    let (bound, symbol) = if *inclusive {
                        ("less than or equal to", "<=")
                    } else {
                        ("less than", "<")
                    };
                    let max = js_number_string(*max);
                    messages(
                        message,
                        format!("Number must be {bound} {max}"),
                        format!("Too big: expected number to be {symbol}{max}"),
                    )
                })
            }
        };
        if let Some((message, zod4)) = failure {
            ctx.add(path, message, zod4);
            status = Status::Dirty;
        }
    }
    let value = serde_json::Number::from_f64(number)
        .map(|n| match n.as_f64() {
            Some(f) if f.fract() == 0.0 && f.abs() < 9e15 => Value::from(f as i64),
            _ => Value::Number(n),
        })
        .unwrap_or(Value::Null);
    Parsed {
        status,
        value: Some(value),
    }
}

fn quoted_options(options: &[String]) -> String {
    options
        .iter()
        .map(|o| format!("'{o}'"))
        .collect::<Vec<_>>()
        .join(" | ")
}

fn parse_enum(input: Option<&Value>, options: &[String], path: &[String], ctx: &mut Ctx) -> Parsed {
    let zod4 = format!(
        "Invalid option: expected one of {}",
        options
            .iter()
            .map(|o| format!("\"{o}\""))
            .collect::<Vec<_>>()
            .join("|")
    );
    match input {
        Some(Value::String(text)) if options.contains(text) => Parsed::ok(input.cloned()),
        Some(Value::String(text)) => {
            let message = format!(
                "Invalid enum value. Expected {}, received '{text}'",
                quoted_options(options)
            );
            ctx.add(path, message, zod4);
            Parsed::aborted()
        }
        _ => {
            let message = match input {
                None => "Required".to_owned(),
                Some(_) => format!(
                    "Expected {}, received {}",
                    quoted_options(options),
                    parsed_type(input)
                ),
            };
            ctx.add(path, message, zod4);
            Parsed::aborted()
        }
    }
}

fn child(path: &[String], segment: String) -> Vec<String> {
    let mut path = path.to_vec();
    path.push(segment);
    path
}

fn parse_array(
    input: Option<&Value>,
    element: &Schema,
    min: &Option<(usize, Option<String>)>,
    max: &Option<(usize, Option<String>)>,
    path: &[String],
    ctx: &mut Ctx,
) -> Parsed {
    let Some(Value::Array(items)) = input else {
        return invalid_type(ctx, path, "array", input);
    };
    let mut status = Status::Valid;
    if let Some((min, message)) = min
        && items.len() < *min
    {
        let (message, zod4) = messages(
            message,
            format!("Array must contain at least {min} element(s)"),
            format!("Too small: expected array to have >={min} items"),
        );
        ctx.add(path, message, zod4);
        status = Status::Dirty;
    }
    if let Some((max, message)) = max
        && items.len() > *max
    {
        let (message, zod4) = messages(
            message,
            format!("Array must contain at most {max} element(s)"),
            format!("Too big: expected array to have <={max} items"),
        );
        ctx.add(path, message, zod4);
        status = Status::Dirty;
    }
    let mut output = Vec::with_capacity(items.len());
    let mut aborted = false;
    for (index, item) in items.iter().enumerate() {
        let result = element.run(Some(item), &child(path, index.to_string()), ctx);
        match result.status {
            Status::Aborted => aborted = true,
            Status::Dirty => status = Status::Dirty,
            Status::Valid => {}
        }
        output.push(result.value.unwrap_or(Value::Null));
    }
    if aborted {
        return Parsed::aborted();
    }
    Parsed {
        status,
        value: Some(Value::Array(output)),
    }
}

fn parse_object(
    input: Option<&Value>,
    shape: &[(String, Schema)],
    strict: bool,
    path: &[String],
    ctx: &mut Ctx,
) -> Parsed {
    let Some(Value::Object(object)) = input else {
        return invalid_type(ctx, path, "object", input);
    };
    let mut status = Status::Valid;
    let mut aborted = false;
    let mut output = Map::new();
    for (key, schema) in shape {
        let result = schema.run(object.get(key), &child(path, key.clone()), ctx);
        match result.status {
            Status::Aborted => aborted = true,
            Status::Dirty => status = Status::Dirty,
            Status::Valid => {}
        }
        if let Some(value) = result.value {
            output.insert(key.clone(), value);
        }
    }
    if strict {
        let extra: Vec<&String> = object
            .keys()
            .filter(|key| !shape.iter().any(|(known, _)| known == *key))
            .collect();
        if !extra.is_empty() {
            let quoted = |quote: char| {
                extra
                    .iter()
                    .map(|key| format!("{quote}{key}{quote}"))
                    .collect::<Vec<_>>()
                    .join(", ")
            };
            let plural = if extra.len() > 1 { "s" } else { "" };
            ctx.add(
                path,
                format!("Unrecognized key(s) in object: {}", quoted('\'')),
                format!("Unrecognized key{plural}: {}", quoted('"')),
            );
            status = Status::Dirty;
        }
    }
    if aborted {
        return Parsed::aborted();
    }
    Parsed {
        status,
        value: Some(Value::Object(output)),
    }
}

fn parse_union(
    input: Option<&Value>,
    options: &[Schema],
    path: &[String],
    ctx: &mut Ctx,
) -> Parsed {
    let mut dirty: Option<(Parsed, Vec<Issue>)> = None;
    for option in options {
        let mut child_ctx = Ctx { issues: Vec::new() };
        let result = option.run(input, path, &mut child_ctx);
        match result.status {
            Status::Valid => return result,
            Status::Dirty if dirty.is_none() => dirty = Some((result, child_ctx.issues)),
            _ => {}
        }
    }
    if let Some((result, issues)) = dirty {
        ctx.issues.extend(issues);
        return result;
    }
    ctx.add(path, "Invalid input".into(), "Invalid input".into());
    Parsed::aborted()
}

/// Query values arrive as strings; empty ones are `undefined`, like `preprocessQueryEmpty`.
pub fn query_empty_as_undefined(value: Option<&Value>) -> Option<Value> {
    match value {
        None | Some(Value::Null) => None,
        Some(Value::String(text)) if text.is_empty() => None,
        Some(other) => Some(other.clone()),
    }
}

/// `optionalQueryInt`: an optional integer coerced from the query string.
pub fn optional_query_int(min: Option<usize>, max: Option<usize>) -> Schema {
    let mut inner = coerce_number().int();
    if let Some(min) = min {
        inner = inner.min(min);
    }
    if let Some(max) = max {
        inner = inner.max(max);
    }
    preprocess(query_empty_as_undefined, inner.optional())
}

/// `optionalQueryBooleanSchema`: `"true"`/`"false"`, empty as absent, anything else rejected.
pub fn optional_query_boolean() -> Schema {
    preprocess(
        |value| match value {
            None | Some(Value::Null) => None,
            Some(Value::String(text)) if text.is_empty() => None,
            Some(Value::String(text)) if text == "true" => Some(Value::Bool(true)),
            Some(Value::String(text)) if text == "false" => Some(Value::Bool(false)),
            Some(other) => Some(other.clone()),
        },
        boolean().optional(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn issues(schema: &Schema, input: Value) -> Vec<(String, String)> {
        match schema.parse(Some(&input)) {
            Ok(_) => Vec::new(),
            Err(issues) => issues
                .iter()
                .map(|i| (i.path_string(), i.message.clone()))
                .collect(),
        }
    }

    fn pair(path: &str, message: &str) -> (String, String) {
        (path.to_owned(), message.to_owned())
    }

    #[test]
    fn object_issues_follow_the_shape_then_unknown_keys() {
        let schema = object([
            ("token", string().min(1)),
            ("chosenEmail", string().trim().min(1)),
        ])
        .strict();
        assert_eq!(
            issues(
                &schema,
                json!({"token": 5, "chosenEmail": "x", "extra": 1, "more": 2})
            ),
            [
                pair("token", "Expected string, received number"),
                pair("root", "Unrecognized key(s) in object: 'extra', 'more'"),
            ]
        );
        assert_eq!(
            issues(&schema, json!({"token": "t"})),
            [pair("chosenEmail", "Required")]
        );
        assert_eq!(
            issues(&schema, json!([1])),
            [pair("root", "Expected object, received array")]
        );
        assert_eq!(
            schema
                .parse(None)
                .err()
                .map(|i| i[0].message.clone())
                .as_deref(),
            Some("Required")
        );
        assert_eq!(
            schema
                .parse(Some(&json!({"token": "t", "chosenEmail": "  a  "})))
                .ok()
                .flatten(),
            Some(json!({"token": "t", "chosenEmail": "a"}))
        );
    }

    #[test]
    fn string_checks_run_in_declaration_order() {
        assert_eq!(
            issues(&string().trim().min(1), json!("   ")),
            [pair("root", "String must contain at least 1 character(s)")]
        );
        assert!(issues(&string().min(1).trim(), json!("   ")).is_empty());
        assert_eq!(
            issues(&string().max(2).msg("Too long"), json!("ab\u{1F600}")),
            [pair("root", "Too long")],
            "length counts UTF-16 units"
        );
        assert_eq!(
            issues(&string().datetime(), json!("2026-02-30T10:00:00Z")),
            [pair("root", "Invalid datetime")]
        );
        assert!(issues(&string().datetime(), json!("2024-02-29T10:00:00.123Z")).is_empty());
        assert_eq!(
            issues(&string().url(), json!("not a url")),
            [pair("root", "Invalid url")]
        );
    }

    #[test]
    fn numbers_match_zod_messages_and_coercion() {
        let limit = optional_query_int(Some(1), Some(50));
        let object = object([("limit", limit)]);
        assert_eq!(
            issues(&object, json!({"limit": "x"})),
            [pair("limit", "Expected number, received nan")]
        );
        assert_eq!(
            issues(&object, json!({"limit": "1.5"})),
            [pair("limit", "Expected integer, received float")]
        );
        assert_eq!(
            issues(&object, json!({"limit": "0"})),
            [pair("limit", "Number must be greater than or equal to 1")]
        );
        assert_eq!(
            object.parse(Some(&json!({"limit": " 10 "}))).ok().flatten(),
            Some(json!({"limit": 10}))
        );
        assert_eq!(
            object.parse(Some(&json!({"limit": ""}))).ok().flatten(),
            Some(json!({}))
        );
        assert_eq!(
            issues(&number().positive(), json!(0)),
            [pair("root", "Number must be greater than 0")]
        );
        assert_eq!(js_number("0x10"), 16.0);
        assert!(js_number("1e").is_nan() && js_number("12px").is_nan());
    }

    #[test]
    fn query_booleans_accept_only_true_and_false() {
        let schema = object([("syncRemote", optional_query_boolean())]);
        assert_eq!(
            schema
                .parse(Some(&json!({"syncRemote": "false"})))
                .ok()
                .flatten(),
            Some(json!({"syncRemote": false}))
        );
        assert_eq!(
            issues(&schema, json!({"syncRemote": "maybe"})),
            [pair("syncRemote", "Expected boolean, received string")]
        );
    }

    #[test]
    fn enums_unions_literals_and_arrays() {
        let kind = enumeration(&["email", "push"]);
        assert_eq!(
            issues(&kind, json!("sms")),
            [pair(
                "root",
                "Invalid enum value. Expected 'email' | 'push', received 'sms'"
            )]
        );
        assert_eq!(
            issues(&kind, json!(1)),
            [pair("root", "Expected 'email' | 'push', received number")]
        );
        assert_eq!(
            issues(&union(vec![string(), number()]), json!(true)),
            [pair("root", "Invalid input")]
        );
        assert_eq!(
            issues(&literal("v1"), json!("v2")),
            [pair("root", "Invalid literal value, expected \"v1\"")]
        );
        let list = array(string().min(1)).max(1);
        assert_eq!(
            issues(&list, json!(["", "b"])),
            [
                pair("root", "Array must contain at most 1 element(s)"),
                pair("0", "String must contain at least 1 character(s)")
            ]
        );
    }

    #[test]
    fn refinements_run_on_dirty_but_not_aborted_values() {
        let schema = object([("a", string().max(1)), ("b", number().optional())]).refine(
            |v| v.get("b").is_some(),
            "b is required",
            &["b"],
        );
        assert_eq!(
            issues(&schema, json!({"a": "long"})),
            [
                pair("a", "String must contain at most 1 character(s)"),
                pair("b", "b is required")
            ]
        );
        assert_eq!(
            issues(&schema, json!({"a": 1})),
            [pair("a", "Expected string, received number")]
        );
    }
}
