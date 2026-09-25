jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

jest.mock("expo-crypto", () => ({
  getRandomBytes: (length: number) =>
    globalThis.crypto.getRandomValues(new Uint8Array(length)),
  getRandomValues: (buffer: Uint8Array) =>
    globalThis.crypto.getRandomValues(buffer as Uint8Array<ArrayBuffer>),
}));

import { createE2eeModule } from "@workspace/e2ee";
import { setActiveE2eeSession } from "@workspace/native-core/lib/e2ee-session";
import {
  generateVaultSecret,
  unwrapVaultSecret,
  wrapVaultSecret,
} from "./vault-secret";

const e2ee = createE2eeModule({
  subtle: globalThis.crypto.subtle,
  getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
} as never);

async function activateSession() {
  setActiveE2eeSession({
    userId: "user-1",
    deviceId: "device-1",
    accountKey: await e2ee.generateAccountKey(),
    blindIndexKey: await e2ee.generateBlindIndexKey(),
  });
}

describe("mail vault secret", () => {
  beforeEach(() => {
    setActiveE2eeSession(null);
  });

  it("generates a distinct high-entropy secret each time", () => {
    const first = generateVaultSecret();

    expect(first).not.toBe(generateVaultSecret());
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(first.length).toBeGreaterThanOrEqual(43);
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
    const wrapped = await wrapVaultSecret(generateVaultSecret());

    // A different signed-in account — i.e. anyone but the owner.
    await activateSession();

    await expect(unwrapVaultSecret(wrapped!)).resolves.toBeNull();
  });

  it("refuses to wrap or unwrap without an E2EE session", async () => {
    await activateSession();
    const wrapped = await wrapVaultSecret(generateVaultSecret());

    setActiveE2eeSession(null);

    await expect(wrapVaultSecret("secret")).resolves.toBeNull();
    await expect(unwrapVaultSecret(wrapped!)).resolves.toBeNull();
  });
});
