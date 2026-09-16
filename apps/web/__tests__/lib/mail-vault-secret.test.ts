import { beforeEach, describe, expect, it } from "@jest/globals";
import { webcrypto } from "node:crypto";

import { createE2eeModule } from "@workspace/e2ee";
import { setActiveE2eeSession, clearActiveE2eeSession } from "@/lib/e2ee-session";
import {
  generateVaultSecret,
  unwrapVaultSecret,
  wrapVaultSecret,
} from "@/lib/mail/vault-secret";

const e2ee = createE2eeModule(webcrypto as never);

async function activateSession() {
  const accountKey = await e2ee.generateAccountKey();
  const blindIndexKey = await e2ee.generateBlindIndexKey();
  setActiveE2eeSession({
    userId: "user-1",
    deviceId: "device-1",
    accountKey,
    blindIndexKey,
    activatedAt: new Date(),
  });
  return accountKey;
}

describe("mail vault secret", () => {
  beforeEach(() => {
    clearActiveE2eeSession();
  });

  it("generates a distinct high-entropy secret each time", () => {
    const first = generateVaultSecret();
    const second = generateVaultSecret();

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(43);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("round-trips a secret through the account key", async () => {
    await activateSession();
    const secret = generateVaultSecret();

    const wrapped = await wrapVaultSecret(secret);
    expect(wrapped).toBeTruthy();
    expect(wrapped).not.toContain(secret);

    await expect(unwrapVaultSecret(wrapped!)).resolves.toBe(secret);
  });

  it("cannot be unwrapped by a different account key", async () => {
    await activateSession();
    const secret = generateVaultSecret();
    const wrapped = await wrapVaultSecret(secret);

    // A different signed-in account — i.e. anyone but the owner.
    await activateSession();

    await expect(unwrapVaultSecret(wrapped!)).resolves.toBeNull();
  });

  it("refuses to wrap or unwrap without an E2EE session", async () => {
    await activateSession();
    const wrapped = await wrapVaultSecret(generateVaultSecret());

    clearActiveE2eeSession();

    await expect(wrapVaultSecret("secret")).resolves.toBeNull();
    await expect(unwrapVaultSecret(wrapped!)).resolves.toBeNull();
  });
});
