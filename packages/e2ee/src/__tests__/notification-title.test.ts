import { describe, it, expect } from "@jest/globals";
import { hkdfSync, webcrypto } from "node:crypto";

import { encryptedNotificationTitleSchema } from "@workspace/calendar-core";

import type { CryptoProvider } from "../crypto-provider";
import { bytesToBase64Url } from "../e2ee-module";
import {
  NOTIFICATION_KEY_INFO,
  decryptNotificationTitle,
  deriveNotificationKeyBytes,
  encryptNotificationTitle,
  importNotificationKey,
  normalizeNotificationTitle,
} from "../notification-title";

// Fixed vector shared with the Swift NSE (NotificationService.swift); change both sides together.
const VECTOR = {
  accountKey: Uint8Array.from({ length: 32 }, (_, i) => i),
  iv: Uint8Array.from({ length: 12 }, (_, i) => 0xa0 + i),
  eventId: "evt_123",
  title: "Dentist — 3pm",
  notificationKey: "cNL8JZgoDs-eREw6AXrJgoOK9W5TprVEGl7ciJ7hTGg",
  wire: "v1.oKGio6Slpqeoqaqr.RzKqGz6RlCIjsse98Z5olLmi5f7PQ06_sfA4TvGmoA",
};

const nodeCrypto = webcrypto as unknown as CryptoProvider;

function fixedIvCrypto(iv: Uint8Array): CryptoProvider {
  return {
    ...nodeCrypto,
    subtle: nodeCrypto.subtle,
    randomUUID: () => webcrypto.randomUUID(),
    getRandomValues: (buffer: Uint8Array) => {
      buffer.set(iv.subarray(0, buffer.length));
      return buffer;
    },
  };
}

async function importAccountKey(bytes: Uint8Array): Promise<CryptoKey> {
  return nodeCrypto.subtle.importKey(
    "raw",
    bytes,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

describe("notification title encryption", () => {
  it("derives the notification key with RFC 5869 HKDF-SHA-256", async () => {
    const accountKey = await importAccountKey(VECTOR.accountKey);
    const derived = await deriveNotificationKeyBytes(nodeCrypto, accountKey);
    const expected = new Uint8Array(
      hkdfSync(
        "sha256",
        VECTOR.accountKey,
        new Uint8Array(0),
        NOTIFICATION_KEY_INFO,
        32,
      ),
    );

    expect(bytesToBase64Url(derived)).toBe(bytesToBase64Url(expected));
    expect(bytesToBase64Url(derived)).toBe(VECTOR.notificationKey);
  });

  it("matches the fixed cross-platform wire vector", async () => {
    const accountKey = await importAccountKey(VECTOR.accountKey);
    const keyBytes = await deriveNotificationKeyBytes(nodeCrypto, accountKey);
    const key = await importNotificationKey(nodeCrypto, keyBytes);

    const wire = await encryptNotificationTitle(
      fixedIvCrypto(VECTOR.iv),
      key,
      VECTOR.eventId,
      VECTOR.title,
    );

    expect(wire).toBe(VECTOR.wire);
    expect(encryptedNotificationTitleSchema.safeParse(wire).success).toBe(true);
    await expect(
      decryptNotificationTitle(nodeCrypto, key, VECTOR.eventId, VECTOR.wire),
    ).resolves.toBe(VECTOR.title);
  });

  it("binds the ciphertext to the event id", async () => {
    const accountKey = await importAccountKey(VECTOR.accountKey);
    const key = await importNotificationKey(
      nodeCrypto,
      await deriveNotificationKeyBytes(nodeCrypto, accountKey),
    );

    await expect(
      decryptNotificationTitle(nodeCrypto, key, "evt_other", VECTOR.wire),
    ).rejects.toThrow();
  });

  it("keeps the longest title within the contract limit", async () => {
    const accountKey = await importAccountKey(VECTOR.accountKey);
    const key = await importNotificationKey(
      nodeCrypto,
      await deriveNotificationKeyBytes(nodeCrypto, accountKey),
    );
    const wire = await encryptNotificationTitle(
      nodeCrypto,
      key,
      "evt",
      "😀".repeat(500),
    );

    expect(encryptedNotificationTitleSchema.safeParse(wire).success).toBe(true);
  });

  it("normalizes whitespace and skips empty titles", async () => {
    expect(normalizeNotificationTitle("  Lunch \n plans ")).toBe("Lunch plans");
    expect(normalizeNotificationTitle("   ")).toBeNull();
    expect(
      encryptedNotificationTitleSchema.safeParse("Lunch plans").success,
    ).toBe(false);
  });
});
