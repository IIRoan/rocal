//! A software platform authenticator (ES256, "none" attestation) that answers WebAuthn options like a browser would.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use ciborium::Value as Cbor;
use p256::ecdsa::signature::Signer;
use p256::ecdsa::{Signature, SigningKey};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use crate::{Error, Result};

const FLAG_USER_PRESENT: u8 = 0x01;
const FLAG_USER_VERIFIED: u8 = 0x04;
const FLAG_BACKUP_ELIGIBLE: u8 = 0x08;
const FLAG_BACKED_UP: u8 = 0x10;
const FLAG_ATTESTED_CREDENTIAL: u8 = 0x40;

/// A passkey held by the test; serializable so seeded passkeys can be used again by another run.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoftPasskey {
    pub credential_id: String,
    pub private_key: String,
    pub sign_count: u32,
    pub rp_id: String,
    pub user_handle: Option<String>,
    /// A synced passkey like iCloud Keychain's: backup eligible and backed up, its counter always 0.
    #[serde(default)]
    pub synced: bool,
}

impl SoftPasskey {
    pub fn new(rp_id: &str) -> Result<Self> {
        let credential_id: [u8; 32] = rand::random();
        let key = loop {
            let bytes: [u8; 32] = rand::random();
            if let Ok(key) = SigningKey::from_slice(&bytes) {
                break key;
            }
        };
        Ok(Self {
            credential_id: URL_SAFE_NO_PAD.encode(credential_id),
            private_key: URL_SAFE_NO_PAD.encode(key.to_bytes()),
            sign_count: 0,
            rp_id: rp_id.to_owned(),
            user_handle: None,
            synced: false,
        })
    }

    pub fn new_synced(rp_id: &str) -> Result<Self> {
        Ok(Self {
            synced: true,
            ..Self::new(rp_id)?
        })
    }

    fn signing_key(&self) -> Result<SigningKey> {
        let bytes = URL_SAFE_NO_PAD
            .decode(&self.private_key)
            .map_err(|e| Error::Unexpected(e.to_string()))?;
        SigningKey::from_slice(&bytes).map_err(|e| Error::Unexpected(e.to_string()))
    }

    /// The `navigator.credentials.create()` result for registration `options`, as JSON the server verifies.
    pub fn register(&mut self, options: &Value, origin: &str) -> Result<Value> {
        let challenge = options["challenge"]
            .as_str()
            .ok_or_else(|| Error::Unexpected("registration options lack a challenge".into()))?;
        let rp_id = options["rp"]["id"]
            .as_str()
            .unwrap_or(&self.rp_id)
            .to_owned();
        self.rp_id = rp_id;
        self.user_handle = options["user"]["id"].as_str().map(str::to_owned);

        let client_data = client_data_json("webauthn.create", challenge, origin);
        let credential_id = URL_SAFE_NO_PAD
            .decode(&self.credential_id)
            .map_err(|e| Error::Unexpected(e.to_string()))?;
        let mut auth_data = self
            .authenticator_data(FLAG_USER_PRESENT | FLAG_USER_VERIFIED | FLAG_ATTESTED_CREDENTIAL);
        auth_data.extend_from_slice(&[0u8; 16]);
        auth_data.extend_from_slice(&(credential_id.len() as u16).to_be_bytes());
        auth_data.extend_from_slice(&credential_id);
        auth_data.extend_from_slice(&self.cose_public_key()?);

        let attestation = Cbor::Map(vec![
            (Cbor::Text("fmt".into()), Cbor::Text("none".into())),
            (Cbor::Text("attStmt".into()), Cbor::Map(vec![])),
            (Cbor::Text("authData".into()), Cbor::Bytes(auth_data)),
        ]);
        let mut attestation_object = Vec::new();
        ciborium::into_writer(&attestation, &mut attestation_object)
            .map_err(|e| Error::Unexpected(e.to_string()))?;

        Ok(json!({
            "id": self.credential_id,
            "rawId": self.credential_id,
            "type": "public-key",
            "authenticatorAttachment": "platform",
            "clientExtensionResults": {},
            "response": {
                "clientDataJSON": URL_SAFE_NO_PAD.encode(client_data),
                "attestationObject": URL_SAFE_NO_PAD.encode(attestation_object),
                "transports": ["internal"],
            },
        }))
    }

    /// The `navigator.credentials.get()` result for authentication `options`.
    pub fn authenticate(&mut self, options: &Value, origin: &str) -> Result<Value> {
        let challenge = options["challenge"]
            .as_str()
            .ok_or_else(|| Error::Unexpected("authentication options lack a challenge".into()))?;
        if !self.synced {
            self.sign_count += 1;
        }
        let client_data = client_data_json("webauthn.get", challenge, origin);
        let auth_data = self.authenticator_data(FLAG_USER_PRESENT | FLAG_USER_VERIFIED);
        let mut signed = auth_data.clone();
        signed.extend_from_slice(&Sha256::digest(&client_data));
        let signature: Signature = self.signing_key()?.sign(&signed);

        Ok(json!({
            "id": self.credential_id,
            "rawId": self.credential_id,
            "type": "public-key",
            "authenticatorAttachment": "platform",
            "clientExtensionResults": {},
            "response": {
                "clientDataJSON": URL_SAFE_NO_PAD.encode(client_data),
                "authenticatorData": URL_SAFE_NO_PAD.encode(auth_data),
                "signature": URL_SAFE_NO_PAD.encode(signature.to_der().as_bytes()),
                "userHandle": self.user_handle,
            },
        }))
    }

    fn authenticator_data(&self, flags: u8) -> Vec<u8> {
        let flags = if self.synced {
            flags | FLAG_BACKUP_ELIGIBLE | FLAG_BACKED_UP
        } else {
            flags
        };
        let mut data = Sha256::digest(self.rp_id.as_bytes()).to_vec();
        data.push(flags);
        data.extend_from_slice(&self.sign_count.to_be_bytes());
        data
    }

    fn cose_public_key(&self) -> Result<Vec<u8>> {
        let point = self.signing_key()?.verifying_key().to_sec1_point(false);
        let (Some(x), Some(y)) = (point.x(), point.y()) else {
            return Err(Error::Unexpected("public key has no coordinates".into()));
        };
        let key = Cbor::Map(vec![
            (Cbor::Integer(1.into()), Cbor::Integer(2.into())),
            (Cbor::Integer(3.into()), Cbor::Integer((-7).into())),
            (Cbor::Integer((-1).into()), Cbor::Integer(1.into())),
            (Cbor::Integer((-2).into()), Cbor::Bytes(x.to_vec())),
            (Cbor::Integer((-3).into()), Cbor::Bytes(y.to_vec())),
        ]);
        let mut out = Vec::new();
        ciborium::into_writer(&key, &mut out).map_err(|e| Error::Unexpected(e.to_string()))?;
        Ok(out)
    }
}

fn client_data_json(kind: &str, challenge: &str, origin: &str) -> Vec<u8> {
    json!({
        "type": kind,
        "challenge": challenge,
        "origin": origin,
        "crossOrigin": false,
    })
    .to_string()
    .into_bytes()
}
