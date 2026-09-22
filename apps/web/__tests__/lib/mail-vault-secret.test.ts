import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { webcrypto } from "node:crypto";

import { createE2eeModule } from "@workspace/e2ee";

jest.mock("@/lib/e2ee-bootstrap", () => ({
  waitForPendingE2eeBootstrap: jest.fn(),
}));

import { waitForPendingE2eeBootstrap } from "@/lib/e2ee-bootstrap";
import { setActiveE2eeSession, clearActiveE2eeSession } from "@/lib/e2ee-session";
import {
  generateVaultSecret,
  unwrapVaultSecret,
  wrapVaultSecret,
} from "@/lib/mail/vault-secret";

const e2ee = createE2eeModule(webcrypto as never);
const mockWaitForPendingE2eeBootstrap =
  waitForPendingE2eeBootstrap as jest.MockedFunction<
    typeof waitForPendingE2eeBootstrap
  >;

async function activateSession() {
  const session = {
    userId: "user-1",
    deviceId: "device-1",
    accountKey: await e2ee.generateAccountKey(),
    blindIndexKey: await e2ee.generateBlindIndexKey(),
    activatedAt: new Date(),
  };
  setActiveE2eeSession(session);
  return session;
}

describe("mail vault secret", () => {
  beforeEach(() => {
    clearActiveE2eeSession();
    mockWaitForPendingE2eeBootstrap.mockReset();
    mockWaitForPendingE2eeBootstrap.mockReturnValue(null);
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

  it("waits for an in-flight E2EE bootstrap before unwrapping", async () => {
    const session = await activateSession();
    const secret = generateVaultSecret();
    const wrapped = await wrapVaultSecret(secret);

    clearActiveE2eeSession();
    mockWaitForPendingE2eeBootstrap.mockReturnValue(
      Promise.resolve().then(() => setActiveE2eeSession(session)),
    );

    await expect(unwrapVaultSecret(wrapped!)).resolves.toBe(secret);
  });
});
