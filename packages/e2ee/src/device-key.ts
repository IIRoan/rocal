import type { E2eeModule, PasswordEnvelopeInput } from "./e2ee-module";

/** The salt of the envelope known to hold this device's account key; sign-out may delete a device key only while one is known. */
export async function resolveDeviceEnvelopeSalt(
  e2ee: Pick<
    E2eeModule,
    "unwrapPasswordEnvelope" | "encryptJsonPayload" | "decryptJsonPayload"
  >,
  input: {
    storedSalt: string | null | undefined;
    envelope: PasswordEnvelopeInput | null;
    password: string | null;
    accountKey: CryptoKey;
  },
): Promise<string | null> {
  const { storedSalt, envelope, password, accountKey } = input;
  if (!envelope) return null;
  if (storedSalt === envelope.kdfSalt) return storedSalt;
  if (!password) return null;
  const opened = await e2ee
    .unwrapPasswordEnvelope(password, envelope)
    .catch(() => null);
  if (!opened) return null;
  // AES-GCM only decrypts under the same key, so the probe tells a split account key apart without exporting either.
  const probe = await e2ee.encryptJsonPayload(accountKey, true);
  return e2ee.decryptJsonPayload(opened.accountKey, probe).then(
    () => envelope.kdfSalt,
    () => null,
  );
}

/** Why a signed-in device cannot open the account key; the session then ends instead of asking for a password. */
export type E2eeLock = "sign-in-again" | "cannot-open";

/** Where the password tried on the envelope came from; only one the server just accepted shows the envelope is stale. */
export type UnlockPassword = "sign-in" | "remembered" | "none";

/** The lock for a device without usable keys of its own; null when it may stay (unlocked, or a new account that may mint keys). */
export function lockWithoutDeviceKeys(input: {
  hasEnvelope: boolean;
  hasOtherDevices: boolean;
  password: UnlockPassword;
  opened: boolean;
}): E2eeLock | null {
  if (input.opened) return null;
  if (!input.hasEnvelope) return input.hasOtherDevices ? "cannot-open" : null;
  return input.password === "sign-in" ? "cannot-open" : "sign-in-again";
}
