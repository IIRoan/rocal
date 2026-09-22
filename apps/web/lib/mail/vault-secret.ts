import type { EncryptedJsonPayload } from "@workspace/e2ee";
import { decryptJsonPayload, encryptJsonPayload } from "@/lib/e2ee-crypto";
import { getEncryptionSession } from "@/lib/e2ee-payloads";

/** Binds the sealed secret to its purpose so it cannot be replayed elsewhere. */
export const VAULT_SECRET_AAD = "mail-vault-secret";
export const VAULT_WRAP_ALGORITHM = "e2ee-account-key-v1";

const VAULT_SECRET_BYTES = 32;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/** A random passphrase the server cannot derive, unlike the HMAC key material. */
export function generateVaultSecret(): string {
  const bytes = new Uint8Array(VAULT_SECRET_BYTES);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function wrapVaultSecret(secret: string): Promise<string | null> {
  const session = await getEncryptionSession();
  if (!session) {
    return null;
  }

  const payload = await encryptJsonPayload(
    session.accountKey,
    { secret },
    VAULT_SECRET_AAD,
  );
  return JSON.stringify(payload);
}

export async function unwrapVaultSecret(
  wrappedSecret: string,
): Promise<string | null> {
  const session = await getEncryptionSession();
  if (!session) {
    return null;
  }

  try {
    const payload = JSON.parse(wrappedSecret) as EncryptedJsonPayload;
    const { secret } = await decryptJsonPayload<{ secret: string }>(
      session.accountKey,
      payload,
      VAULT_SECRET_AAD,
    );
    return secret || null;
  } catch {
    return null;
  }
}
