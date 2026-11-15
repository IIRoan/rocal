import { describe, expect, it } from "@jest/globals";
import {
  lockWithoutDeviceKeys,
  resolveDeviceEnvelopeSalt,
  shouldUpgradePasswordEnvelope,
} from "../device-key";
import { testE2eeModule as e2ee } from "./envelope-fixtures";

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

describe("shouldUpgradePasswordEnvelope", () => {
  const legacy = { kdfSalt: "salt", kdfAlgorithm: "PBKDF2-SHA-256" };

  it.each([
    ["rewraps a PBKDF2 envelope that holds this device's key", legacy, "salt", true],
    ["rewraps a legacy envelope that names no KDF", { kdfSalt: "salt" }, "salt", true],
    ["leaves an envelope that may hold another key", legacy, "other-salt", false],
    ["leaves an envelope no remembered salt vouches for", legacy, null, false],
    ["leaves an Argon2id envelope", { ...legacy, kdfAlgorithm: "Argon2id" }, "salt", false],
    ["has nothing to rewrap without an envelope", null, "salt", false],
  ])("%s", (_case, envelope, deviceEnvelopeSalt, expected) => {
    expect(shouldUpgradePasswordEnvelope({ envelope, deviceEnvelopeSalt })).toBe(expected);
  });
});

describe("lockWithoutDeviceKeys", () => {
  const base = { hasEnvelope: true, hasOtherDevices: true, opened: false };

  it("keeps a device whose envelope opened", () => {
    expect(lockWithoutDeviceKeys({ ...base, password: "sign-in", opened: true })).toBeNull();
  });

  it("asks for a sign-in when no password was at hand", () => {
    expect(lockWithoutDeviceKeys({ ...base, password: "none" })).toBe("sign-in-again");
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
