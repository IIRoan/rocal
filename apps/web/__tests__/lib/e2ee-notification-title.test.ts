import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { webcrypto } from "node:crypto";
import {
  decryptNotificationTitle,
  deriveNotificationKeyBytes,
  importNotificationKey,
  type CryptoProvider,
} from "@workspace/e2ee";

jest.mock("../../lib/e2ee-session", () => ({
  getActiveE2eeSession: jest.fn(),
}));

jest.mock("../../lib/e2ee-bootstrap", () => ({
  waitForPendingE2eeBootstrap: jest.fn(),
}));

import { waitForPendingE2eeBootstrap } from "../../lib/e2ee-bootstrap";
import { getActiveE2eeSession } from "../../lib/e2ee-session";
import { encryptReminderTitle } from "../../lib/e2ee-notification-title";

const crypto = webcrypto as unknown as CryptoProvider;
const mockGetActiveE2eeSession = getActiveE2eeSession as jest.MockedFunction<
  typeof getActiveE2eeSession
>;
const mockWaitForPendingE2eeBootstrap =
  waitForPendingE2eeBootstrap as jest.MockedFunction<
    typeof waitForPendingE2eeBootstrap
  >;

describe("encryptReminderTitle", () => {
  beforeEach(() => {
    mockGetActiveE2eeSession.mockReset();
    mockWaitForPendingE2eeBootstrap.mockReset();
    mockWaitForPendingE2eeBootstrap.mockReturnValue(null);
  });

  it("encrypts the title under the derived notification key", async () => {
    const accountKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    mockGetActiveE2eeSession.mockReturnValue({ accountKey } as never);

    const wire = await encryptReminderTitle("evt-1", " Lunch with Sam ");

    expect(wire).toMatch(/^v1\./);
    expect(wire).not.toContain("Lunch");
    const key = await importNotificationKey(
      crypto,
      await deriveNotificationKeyBytes(crypto, accountKey),
    );
    await expect(
      decryptNotificationTitle(crypto, key, "evt-1", wire!),
    ).resolves.toBe("Lunch with Sam");
  });

  it("clears the title when there is none, and keeps it when locked", async () => {
    mockGetActiveE2eeSession.mockReturnValue(null);
    // No session: undefined leaves whatever ciphertext is stored alone.
    await expect(encryptReminderTitle("evt-1", "Lunch")).resolves.toBeUndefined();
    // No title: null tells the API to clear it.
    await expect(encryptReminderTitle("evt-1", "  ")).resolves.toBeNull();
    await expect(encryptReminderTitle("evt-1", null)).resolves.toBeNull();
  });
});
