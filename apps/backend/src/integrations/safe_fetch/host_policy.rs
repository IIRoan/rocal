//! `lib/ssrf-host-policy.ts`: which hosts and addresses an outbound request to a user URL may reach.

use std::net::{Ipv4Addr, Ipv6Addr};

/// Largest integer JavaScript represents exactly (`Number.isSafeInteger`).
const MAX_SAFE_INTEGER: u64 = (1 << 53) - 1;

/// Non-public IPv4 ranges (RFC 6890 special-purpose, multicast and broadcast).
const BLOCKED_IPV4: [([u8; 4], u32); 15] = [
    ([0, 0, 0, 0], 8),
    ([10, 0, 0, 0], 8),
    ([100, 64, 0, 0], 10),
    ([127, 0, 0, 0], 8),
    ([169, 254, 0, 0], 16),
    ([172, 16, 0, 0], 12),
    ([192, 0, 0, 0], 24),
    ([192, 0, 2, 0], 24),
    ([192, 88, 99, 0], 24),
    ([192, 168, 0, 0], 16),
    ([198, 18, 0, 0], 15),
    ([198, 51, 100, 0], 24),
    ([203, 0, 113, 0], 24),
    ([224, 0, 0, 0], 4),
    ([240, 0, 0, 0], 4),
];

/// Only consulted inside 2000::/3; Teredo, benchmarking, documentation and 6to4 embed or fake other ranges.
const BLOCKED_IPV6_GLOBAL: [(&[u8], u32); 5] = [
    (&[0x20, 0x01, 0x00, 0x00], 32),
    (&[0x20, 0x01, 0x00, 0x02], 48),
    (&[0x20, 0x01, 0x0d, 0xb8], 32),
    (&[0x20, 0x02], 16),
    (&[0x3f, 0xff], 16),
];

/// `normalizeIpv4Literal`: inet_aton-style literals (`2130706433`, `0177.0.0.1`, `0x7f.1`) as a dotted quad.
pub fn normalize_ipv4_literal(value: &str) -> Option<String> {
    let parts: Vec<&str> = value.split('.').collect();
    if parts.len() > 4 {
        return None;
    }
    let mut numbers = Vec::with_capacity(parts.len());
    for part in parts {
        let parsed = if let Some(hex) = part
            .strip_prefix("0x")
            .or_else(|| part.strip_prefix("0X"))
            .filter(|hex| hex.chars().all(|c| c.is_ascii_hexdigit()))
        {
            if hex.is_empty() {
                0
            } else {
                u64::from_str_radix(hex, 16).ok()?
            }
        } else if part.len() > 1
            && part.starts_with('0')
            && part.chars().all(|c| ('0'..='7').contains(&c))
        {
            u64::from_str_radix(part, 8).ok()?
        } else if part == "0"
            || (!part.is_empty()
                && !part.starts_with('0')
                && part.chars().all(|c| c.is_ascii_digit()))
        {
            part.parse().ok()?
        } else {
            return None;
        };
        if parsed > MAX_SAFE_INTEGER {
            return None;
        }
        numbers.push(parsed);
    }
    let last = numbers.pop()?;
    if numbers.iter().any(|octet| *octet > 255) {
        return None;
    }
    let remaining_bytes = 4 - numbers.len() as u32;
    if last >= 1u64 << (8 * remaining_bytes) {
        return None;
    }
    let mut octets: Vec<u64> = numbers;
    for index in (0..remaining_bytes).rev() {
        octets.push((last >> (8 * index)) & 0xff);
    }
    Some(
        octets
            .iter()
            .map(u64::to_string)
            .collect::<Vec<_>>()
            .join("."),
    )
}

/// Node's `isIP(...) === 6`: an IPv6 literal, optionally with a zone id.
fn ipv6(address: &str) -> Option<Ipv6Addr> {
    let (address, zone) = match address.split_once('%') {
        Some((address, zone)) => (address, Some(zone)),
        None => (address, None),
    };
    let zone_ok = zone.is_none_or(|zone| {
        !zone.is_empty()
            && zone
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '.' | ':'))
    });
    zone_ok.then(|| address.parse().ok()).flatten()
}

fn is_ipv4(address: &str) -> bool {
    address.parse::<Ipv4Addr>().is_ok()
}

/// Node's `isIP(address) !== 0`.
pub fn is_ip(address: &str) -> bool {
    is_ipv4(address) || ipv6(address).is_some()
}

fn matches_prefix(bytes: &[u8], prefix: &[u8], bits: u32) -> bool {
    (0..bits as usize).all(|bit| {
        let mask = 0x80 >> (bit % 8);
        let byte = |source: &[u8]| source.get(bit / 8).copied().unwrap_or(0) & mask;
        byte(bytes) == byte(prefix)
    })
}

fn is_blocked_ipv4(address: Ipv4Addr) -> bool {
    BLOCKED_IPV4
        .iter()
        .any(|(prefix, bits)| matches_prefix(&address.octets(), prefix, *bits))
}

fn is_blocked_ipv6(address: &str) -> bool {
    let Some(bytes) = ipv6(address).map(|ip| ip.octets()) else {
        return true;
    };
    !matches_prefix(&bytes, &[0x20], 3)
        || BLOCKED_IPV6_GLOBAL
            .iter()
            .any(|(prefix, bits)| matches_prefix(&bytes, prefix, *bits))
}

/// `canonicalizeHostForSsrfCheck`: IPv4-mapped IPv6 and numeric IPv4 literals as a dotted quad.
pub fn canonicalize_host(hostname: &str) -> String {
    let lowered = hostname.trim().to_lowercase();
    let unbracketed = lowered.strip_prefix('[').unwrap_or(&lowered);
    let unbracketed = unbracketed.strip_suffix(']').unwrap_or(unbracketed);
    let stripped = unbracketed.strip_suffix('.').unwrap_or(unbracketed);
    if let Some(ip) = ipv6(stripped) {
        return match ip.octets() {
            [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, a, b, c, d] => format!("{a}.{b}.{c}.{d}"),
            _ => stripped.to_owned(),
        };
    }
    normalize_ipv4_literal(stripped).unwrap_or_else(|| stripped.to_owned())
}

/// `isPrivateNetworkHost`: true unless the host is a plain public IP or DNS name; anything unrecognised is refused.
pub fn is_private_network_host(hostname: &str) -> bool {
    let canonical = canonicalize_host(hostname);
    if canonical.is_empty() {
        return true;
    }
    if let Ok(ip) = canonical.parse::<Ipv4Addr>() {
        return is_blocked_ipv4(ip);
    }
    if ipv6(&canonical).is_some() {
        return is_blocked_ipv6(&canonical);
    }
    if canonical == "localhost"
        || canonical.ends_with(".localhost")
        || canonical.ends_with(".local")
        || canonical.ends_with(".internal")
    {
        return true;
    }
    // Numeric hosts that did not normalize are resolver-dependent; refuse rather than guess.
    canonical.chars().all(|c| c.is_ascii_digit() || c == '.') || canonical.starts_with("0x")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dotted_ipv4_mapped_ipv6_canonicalizes_to_ipv4() {
        assert_eq!(
            canonicalize_host("::ffff:169.254.169.254"),
            "169.254.169.254"
        );
    }

    #[test]
    fn hex_ipv4_mapped_ipv6_canonicalizes_to_ipv4() {
        assert_eq!(canonicalize_host("::ffff:a9fe:a9fe"), "169.254.169.254");
        assert_eq!(
            canonicalize_host("0:0:0:0:0:ffff:a9fe:a9fe"),
            "169.254.169.254"
        );
        assert!(is_private_network_host("::ffff:a9fe:a9fe"));
        assert!(is_private_network_host("0:0:0:0:0:ffff:a9fe:a9fe"));
    }

    #[test]
    fn public_hosts_are_allowed() {
        for host in [
            "8.8.8.8",
            "93.184.216.34",
            "2606:4700:4700::1111",
            "example.com",
        ] {
            assert!(!is_private_network_host(host), "{host}");
        }
    }

    #[test]
    fn zoned_ipv6_addresses_are_blocked() {
        assert!(is_ip("fe80::1%eth0"));
        assert!(is_private_network_host("fe80::1%eth0"));
    }

    #[test]
    fn private_special_and_ambiguous_hosts_are_blocked() {
        for host in [
            "0.0.0.0",
            "0.1.2.3",
            "10.0.0.1",
            "100.64.0.1",
            "100.127.255.254",
            "127.0.0.1",
            "169.254.169.254",
            "172.16.0.1",
            "192.168.0.1",
            "198.18.0.1",
            "224.0.0.1",
            "255.255.255.255",
            "::",
            "::1",
            "::ffff:127.0.0.1",
            "::127.0.0.1",
            "64:ff9b::7f00:1",
            "fc00::1",
            "fd12:3456::1",
            "fe80::1",
            "ff02::1",
            "2001:db8::1",
            "2002:7f00:1::",
            "2001:0:4136:e378::1",
            "2130706433",
            "0x7f000001",
            "0177.0.0.1",
            "127.1",
            "localhost",
            "foo.localhost",
            "printer.local",
            "metadata.google.internal",
            "",
            "99999999999",
        ] {
            assert!(is_private_network_host(host), "{host}");
        }
        assert_eq!(
            normalize_ipv4_literal("0x7f.1").as_deref(),
            Some("127.0.0.1")
        );
        assert_eq!(normalize_ipv4_literal("1.2.3.256"), None);
        assert_eq!(normalize_ipv4_literal("08.1.1.1"), None);
    }
}
