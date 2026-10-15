//! `lib/mail-bridge-auth.ts`: the bridge password derived per user from `MAIL_BRIDGE_HMAC_KEY` (a known gap), and the PKCE pair of its OAuth login.

use base64::Engine;
use base64::alphabet;
use base64::engine::DecodePaddingMode;
use base64::engine::general_purpose::{GeneralPurpose, GeneralPurposeConfig, URL_SAFE_NO_PAD};
use hmac::{Hmac, KeyInit, Mac};
use sha2::{Digest, Sha256};
use thiserror::Error;

use crate::config::Config;

pub const CLIENT_ID: &str = "solace-mail-bridge";

#[derive(Debug, Error, PartialEq, Eq)]
pub enum BridgeError {
    #[error(
        "MAIL_BRIDGE_HMAC_KEY is not configured on this server. Set it to a permanent random base64 secret."
    )]
    MissingKey,
    #[error("MAIL_BRIDGE_HMAC_KEY is not a valid base64 secret.")]
    InvalidKey,
}

pub struct Pkce {
    pub verifier: String,
    pub challenge: String,
}

pub fn redirect_uri(config: &Config) -> String {
    format!(
        "{}/api/mail/oauth/stalwart/callback",
        config.backend_url.trim_end_matches('/')
    )
}

/// HMAC-SHA-256 of `userId:email:mail-bridge:v1`; it must stay byte-identical or every mailbox login breaks.
pub fn secret(key: Option<&str>, user_id: &str, email: &str) -> Result<String, BridgeError> {
    let key = lenient_base64(key.ok_or(BridgeError::MissingKey)?);
    if key.is_empty() {
        return Err(BridgeError::InvalidKey);
    }
    let mut mac = Hmac::<Sha256>::new_from_slice(&key).map_err(|_| BridgeError::InvalidKey)?;
    mac.update(format!("{user_id}:{}:mail-bridge:v1", email.trim().to_lowercase()).as_bytes());
    Ok(URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes()))
}

pub fn pkce() -> Pkce {
    let verifier = URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>());
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    Pkce {
        verifier,
        challenge,
    }
}

/// `Buffer.from(key, "base64")`: both alphabets, other characters skipped, stops at `=`, leftover bits dropped.
fn lenient_base64(input: &str) -> Vec<u8> {
    let mut normalized: String = input
        .chars()
        .take_while(|c| *c != '=')
        .filter_map(|c| match c {
            '-' => Some('+'),
            '_' => Some('/'),
            c if c.is_ascii_alphanumeric() || c == '+' || c == '/' => Some(c),
            _ => None,
        })
        .collect();
    if normalized.len() % 4 == 1 {
        normalized.pop();
    }
    let lenient = GeneralPurpose::new(
        &alphabet::STANDARD,
        GeneralPurposeConfig::new()
            .with_decode_allow_trailing_bits(true)
            .with_decode_padding_mode(DecodePaddingMode::RequireNone),
    );
    lenient.decode(normalized).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use base64::engine::general_purpose::STANDARD;

    use super::*;

    #[test]
    fn secret_changes_only_with_the_bridge_key() {
        let key = STANDARD.encode([2u8; 32]);
        let rotated = STANDARD.encode([3u8; 32]);
        let first = secret(Some(&key), "user-1", "alice@solace.onl").unwrap();
        assert_ne!(
            secret(Some(&rotated), "user-1", "alice@solace.onl").unwrap(),
            first
        );
        assert_eq!(
            secret(Some(&key), "user-1", " Alice@Solace.onl ").unwrap(),
            first
        );
        // Computed with Bun, which runs the TypeScript backend.
        assert_eq!(
            secret(
                Some("solace-test-mail-bridge-hmac-local-0001"),
                "ar4Ag8MmriHudJFR5kZyWvOB0VqoiWSy",
                " Probe4@solace.test"
            )
            .unwrap(),
            "6ANM1pRRqlml0QlZnkIJh5Pt_0zbBzvmSgmd71DtVH4"
        );
    }

    #[test]
    fn fails_without_a_bridge_key() {
        let error = secret(None, "user-1", "alice@solace.onl").unwrap_err();
        assert!(error.to_string().contains("MAIL_BRIDGE_HMAC_KEY"));
        assert_eq!(
            secret(Some("$$=="), "user-1", "alice@solace.onl"),
            Err(BridgeError::InvalidKey)
        );
    }

    #[test]
    fn decodes_keys_like_buffer_from() {
        let cases: [(&str, &[u8]); 6] = [
            ("QUJD=RA==", b"ABC"),
            ("QU\nJD", b"ABC"),
            ("Zm9v.YmFy", b"foobar"),
            ("Q", b""),
            ("-_-_", &[0xfb, 0xff, 0xbf]),
            ("Zm9vYg==Zm9v", b"foob"),
        ];
        for (input, expected) in cases {
            assert_eq!(lenient_base64(input), expected, "{input:?}");
        }
    }

    #[test]
    fn pkce_challenges_are_the_s256_of_the_verifier() {
        let pair = pkce();
        assert_eq!(pair.verifier.len(), 43);
        assert_eq!(
            pair.challenge,
            URL_SAFE_NO_PAD.encode(Sha256::digest(pair.verifier.as_bytes()))
        );
        assert_ne!(pkce().verifier, pair.verifier);
    }
}
