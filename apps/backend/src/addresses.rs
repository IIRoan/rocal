//! Email address rules from `packages/calendar-core/src/mail-addresses.ts`: normalizing, parsing `Name <email>`, and reserved system addresses.

pub const RESERVED_SYSTEM_LOCAL_PARTS: [&str; 18] = [
    "admin",
    "administrator",
    "root",
    "postmaster",
    "hostmaster",
    "abuse",
    "noreply",
    "no-reply",
    "no_reply",
    "donotreply",
    "do-not-reply",
    "do_not_reply",
    "mailer-daemon",
    "mailerdaemon",
    "alert",
    "alerts",
    "system",
    "security",
];

pub fn normalize(value: &str) -> String {
    value.trim().to_lowercase()
}

/// The address of `Name <email>` or a bare address, normalized.
pub fn parse_recipient(value: &str) -> String {
    let trimmed = value.trim();
    if let Some(open) = trimmed.find('<')
        && trimmed.ends_with('>')
        && open > 0
        && !trimmed[..open].trim().is_empty()
    {
        return normalize(&trimmed[open + 1..trimmed.len() - 1]);
    }
    normalize(trimmed)
}

/// `^[^\s@]+@[^\s@]+\.[^\s@]+$` on the parsed address.
pub fn is_valid(value: &str) -> bool {
    is_simple_email(&parse_recipient(value))
}

/// `^[^\s@]+@[^\s@]+\.[^\s@]+$` as given.
pub fn is_simple_email(email: &str) -> bool {
    let Some((local, domain)) = email.split_once('@') else {
        return false;
    };
    let no_space_or_at =
        |part: &str| !part.is_empty() && !part.chars().any(|c| c.is_whitespace() || c == '@');
    // `[^\s@]+\.[^\s@]+` can split at any dot that has text on both sides.
    no_space_or_at(local)
        && no_space_or_at(domain)
        && domain
            .char_indices()
            .any(|(index, c)| c == '.' && index > 0 && index + 1 < domain.len())
}

/// Zod's `email()` pattern (identical in Zod 3.25 and 4), without the look-aheads regex-lite lacks.
pub fn is_zod_email(value: &str) -> bool {
    static PATTERN: std::sync::LazyLock<regex_lite::Regex> = std::sync::LazyLock::new(|| {
        regex_lite::Regex::new(
            r"(?i)^([A-Z0-9_'+\-.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$",
        )
        .unwrap_or_else(|error| panic!("email pattern: {error}"))
    });
    !value.starts_with('.') && !value.contains("..") && PATTERN.is_match(value)
}

/// Administrative, system and machine addresses that are never invited, provisioned or signed up.
pub fn is_reserved_system_email(value: &str, system_domain: Option<&str>) -> bool {
    let normalized = parse_recipient(value);
    let Some(at) = normalized.rfind('@').filter(|at| *at > 0) else {
        return false;
    };
    let (local, domain) = (&normalized[..at], &normalized[at + 1..]);
    let base = local
        .split('+')
        .next()
        .unwrap_or(local)
        .replace(['.', '_'], "-");
    let solace = domain == "solace.onl" || domain.ends_with(".solace.onl");
    if normalized == "admin@solace.onl" || (base == "admin" && solace) {
        return true;
    }
    let system = match system_domain
        .map(|d| d.trim().to_lowercase())
        .filter(|d| !d.is_empty())
    {
        Some(configured) => domain == configured || domain.ends_with(&format!(".{configured}")),
        None => solace,
    };
    if system
        && (RESERVED_SYSTEM_LOCAL_PARTS.contains(&base.as_str())
            || RESERVED_SYSTEM_LOCAL_PARTS.contains(&local))
    {
        return true;
    }
    [
        "admin",
        "postmaster",
        "mailer-daemon",
        "mailerdaemon",
        "noreply",
        "no-reply",
        "root",
    ]
    .contains(&base.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reserved_addresses_match_calendar_core() {
        assert!(is_reserved_system_email("admin@solace.onl", None));
        assert!(is_reserved_system_email("Admin+x@mail.solace.onl", None));
        assert!(is_reserved_system_email("postmaster@example.com", None));
        assert!(is_reserved_system_email(
            "security@solace.test",
            Some("solace.test")
        ));
        assert!(!is_reserved_system_email("security@example.com", None));
        assert!(!is_reserved_system_email("roan@solace.onl", None));
        assert!(is_reserved_system_email("Ops <no.reply@solace.onl>", None));
    }

    #[test]
    fn addresses_parse_and_validate_like_calendar_core() {
        assert_eq!(
            parse_recipient(" Roan <Roan@Example.com> "),
            "roan@example.com"
        );
        assert!(is_valid("a@b.co") && is_valid("a@b.c.d"));
        assert!(!is_valid("a@b") && !is_valid("a b@c.d") && !is_valid("@c.d"));
    }
}
