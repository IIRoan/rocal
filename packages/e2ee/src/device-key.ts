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
