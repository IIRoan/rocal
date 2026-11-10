import { expect, it, jest } from "@jest/globals";
import * as openpgp from "openpgp";
import { createE2eeModule } from "@workspace/e2ee";
import { createNativeCryptoProvider } from "@workspace/native-core/lib/native-crypto-provider";

import {
  MAIL_PGP_KEY_GENERATION_PROFILE,
  MAIL_TRUST_MAX_PLAINTEXT_BYTES,
  MAIL_TRUST_MAX_CIPHERTEXT_LENGTH,
  observeMailTrustKey,
  type MailTrustState,
} from "@workspace/calendar-core";

jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));
jest.mock("@workspace/logger", () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn() }),
}));

it("fits 256 actual production-profile OpenPGP pins including long Unicode identities and encrypted CAS request overhead", async () => {
  let state: MailTrustState = { version: 1, revision: 0, pins: [] };
  for (let index = 0; index < 256; index += 1) {
    const email = `synthetic-${index}-${"a".repeat(35)}@${"b".repeat(50)}.solace.test`;
    const generated = await openpgp.generateKey({
      ...MAIL_PGP_KEY_GENERATION_PROFILE,
      curve: MAIL_PGP_KEY_GENERATION_PROFILE.curve as never,
      userIDs: [{ name: `SYNTHETIC-${index}-${"測試".repeat(35)}`, email }],
      passphrase: "SYNTHETIC-capacity-probe-only",
    });
    const key = await openpgp.readKey({ armoredKey: generated.publicKey });
    state = observeMailTrustKey(
      state,
      email,
      {
        publicKeyArmored: generated.publicKey,
        fingerprint: key.getFingerprint().toUpperCase(),
      },
      "2026-11-10T00:00:00.000Z",
    );
  }
  const plaintext = new TextEncoder().encode(JSON.stringify(state));
  expect(state.pins).toHaveLength(256);
  expect(new Set(state.pins.map((pin) => pin.fingerprint)).size).toBe(256);
  expect(plaintext.length).toBeGreaterThan(256_000);
  expect(plaintext.length).toBeLessThanOrEqual(MAIL_TRUST_MAX_PLAINTEXT_BYTES);
  const accountKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const provider = createNativeCryptoProvider();
  if (!provider) throw new Error("Synthetic capacity crypto provider missing");
  const e2ee = createE2eeModule(provider);
  const aad = "mail-trust:v1:SYNTHETIC-capacity-account";
  const payload = await e2ee.encryptJsonPayload(accountKey, state, aad);
  const sealed = "mt1." + JSON.stringify(payload);
  const opened = await e2ee.decryptJsonPayload<MailTrustState>(
    accountKey,
    payload,
    aad,
  );
  expect(opened.pins).toHaveLength(256);
  expect(sealed.length).toBeLessThanOrEqual(MAIL_TRUST_MAX_CIPHERTEXT_LENGTH);
  expect(
    new TextEncoder().encode(
      JSON.stringify({
        encryptedTrust: sealed,
        expectedEncryptedTrust: sealed,
      }),
    ).length,
  ).toBeLessThan(4_500_000);
}, 120_000);
