import { describe, expect, it } from "@jest/globals";
import { webcrypto } from "node:crypto";
import type { CryptoProvider } from "../crypto-provider";
import { lockWithoutDeviceKeys, resolveDeviceEnvelopeSalt } from "../device-key";
import { createE2eeModule } from "../e2ee-module";

// Node's WebCrypto matches the provider at runtime; only the DOM-shaped declarations differ.
const e2ee = createE2eeModule(webcrypto as unknown as CryptoProvider);

async function envelopeFor(password: string) {
  const [accountKey, blindIndexKey] = await Promise.all([
    e2ee.generateAccountKey(),
    e2ee.generateBlindIndexKey(),
  ]);
  return {
    accountKey,
    envelope: await e2ee.createPasswordEnvelope(accountKey, blindIndexKey, password),
  };
}

describe("resolveDeviceEnvelopeSalt", () => {
  it("is null without an envelope, so the device key is the only copy", async () => {
    const { accountKey } = await envelopeFor("pw");
    await expect(
      resolveDeviceEnvelopeSalt(e2ee, {
        storedSalt: "old-salt",
        envelope: null,
        password: "pw",
        accountKey,
      }),
    ).resolves.toBeNull();
  });

  it("keeps a salt already verified for the current envelope", async () => {
    const { accountKey, envelope } = await envelopeFor("pw");
    await expect(
      resolveDeviceEnvelopeSalt(e2ee, {
        storedSalt: envelope.kdfSalt,
        envelope,
        password: null,
        accountKey,
      }),
    ).resolves.toBe(envelope.kdfSalt);
  });

  it("drops the salt of a rewritten envelope it cannot re-check", async () => {
    const { accountKey, envelope } = await envelopeFor("pw");
    await expect(
      resolveDeviceEnvelopeSalt(e2ee, {
        storedSalt: "previous-envelope",
        envelope,
        password: null,
        accountKey,
      }),
    ).resolves.toBeNull();
  });

  it("verifies the device key against the envelope with the sign-in password", async () => {
    const { accountKey, envelope } = await envelopeFor("pw");
    await expect(
      resolveDeviceEnvelopeSalt(e2ee, {
        storedSalt: null,
        envelope,
        password: "pw",
        accountKey,
      }),
    ).resolves.toBe(envelope.kdfSalt);
  });

  it("never vouches for a second account key minted beside the envelope", async () => {
    const { envelope } = await envelopeFor("pw");
    const splitKey = await e2ee.generateAccountKey();
    await expect(
      resolveDeviceEnvelopeSalt(e2ee, {
        storedSalt: null,
        envelope,
        password: "pw",
        accountKey: splitKey,
      }),
    ).resolves.toBeNull();
  });

  it("stays unverified when the password does not open the envelope", async () => {
    const { accountKey, envelope } = await envelopeFor("pw");
    await expect(
      resolveDeviceEnvelopeSalt(e2ee, {
        storedSalt: null,
        envelope,
        password: "other",
        accountKey,
      }),
    ).resolves.toBeNull();
  });
});

describe("lockWithoutDeviceKeys", () => {
  const base = { hasEnvelope: true, hasOtherDevices: true, opened: false };

  it("keeps a device whose envelope opened", () => {
    expect(lockWithoutDeviceKeys({ ...base, password: "sign-in", opened: true })).toBeNull();
  });

  it("asks for a sign-in when no password, or only a remembered one, was at hand", () => {
    expect(lockWithoutDeviceKeys({ ...base, password: "none" })).toBe("sign-in-again");
    expect(lockWithoutDeviceKeys({ ...base, password: "remembered" })).toBe("sign-in-again");
  });

  it("reports an envelope the password the server just accepted cannot open", () => {
    expect(lockWithoutDeviceKeys({ ...base, password: "sign-in" })).toBe("cannot-open");
  });

  it("reports keys that live only on other devices, and lets a new account mint", () => {
    const noEnvelope = { ...base, hasEnvelope: false, password: "sign-in" as const };
    expect(lockWithoutDeviceKeys(noEnvelope)).toBe("cannot-open");
    expect(lockWithoutDeviceKeys({ ...noEnvelope, hasOtherDevices: false })).toBeNull();
  });
});
