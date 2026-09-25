import {
  createE2eeModule,
  type E2eeModule,
  type EncryptedJsonPayload,
} from "@workspace/e2ee";
import * as ExpoCrypto from "expo-crypto";
import { getActiveE2eeSession } from "@workspace/native-core/lib/e2ee-session";

/** Binds the sealed secret to its purpose so it cannot be replayed elsewhere. */
export const VAULT_SECRET_AAD = "mail-vault-secret";
export const VAULT_WRAP_ALGORITHM = "e2ee-account-key-v1";

const VAULT_SECRET_BYTES = 32;

let cachedModule: E2eeModule | null = null;

/** Imported lazily so this module's graph stays free of react-native. */
async function getModule(): Promise<E2eeModule | null> {
  if (cachedModule) {
    return cachedModule;
  }

  const { createNativeCryptoProvider } = await import(
    "@workspace/native-core/lib/native-crypto-provider"
  );
  const crypto = createNativeCryptoProvider();
  if (!crypto) {
    return null;
  }

  cachedModule = createE2eeModule(crypto);
  return cachedModule;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return global
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/** A random passphrase the server cannot derive, unlike the HMAC key material. */
export function generateVaultSecret(): string {
  return bytesToBase64Url(ExpoCrypto.getRandomBytes(VAULT_SECRET_BYTES));
}

export async function wrapVaultSecret(secret: string): Promise<string | null> {
  const session = getActiveE2eeSession();
  const e2ee = await getModule();
  if (!session || !e2ee) {
    return null;
  }

  const payload = await e2ee.encryptJsonPayload(
    session.accountKey,
    { secret },
    VAULT_SECRET_AAD,
  );
  return JSON.stringify(payload);
}

export async function unwrapVaultSecret(
  wrappedSecret: string,
): Promise<string | null> {
  const session = getActiveE2eeSession();
  const e2ee = await getModule();
  if (!session || !e2ee) {
    return null;
  }

  try {
    const payload = JSON.parse(wrappedSecret) as EncryptedJsonPayload;
    const { secret } = await e2ee.decryptJsonPayload<{ secret: string }>(
      session.accountKey,
      payload,
      VAULT_SECRET_AAD,
    );
    return secret || null;
  } catch {
    return null;
  }
}
