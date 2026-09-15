import { beforeAll, describe, expect, it } from "@jest/globals";
import { webcrypto } from "node:crypto";

import type { CryptoProvider } from "../crypto-provider";
import { createE2eeModule } from "../e2ee-module";
import {
  decryptEntityName,
  encryptEventContentRequest,
  encryptNameRequest,
  hydrateEncryptedName,
  shouldEncryptEventContent,
  type E2eeSessionKeys,
} from "../payloads";

const e2ee = createE2eeModule(webcrypto as unknown as CryptoProvider);
let keys: E2eeSessionKeys;

beforeAll(async () => {
  keys = {
    accountKey: await e2ee.generateAccountKey(),
    blindIndexKey: await e2ee.generateBlindIndexKey(),
  };
});

describe("encryptEventContentRequest", () => {
  it("emits ciphertext and blind-index tokens without plaintext content", async () => {
    const wire = await encryptEventContentRequest(e2ee, keys, {
      title: " Therapy ",
      description: "Session notes",
      location: "Clinic",
      start: "2026-06-01T09:00:00.000Z",
      end: "2026-06-01T10:00:00.000Z",
      calendarId: "calendar-1",
    });

    expect(wire).not.toHaveProperty("title");
    expect(wire).not.toHaveProperty("description");
    expect(wire).not.toHaveProperty("location");
    expect(wire).not.toHaveProperty("invitationContent");
    expect(JSON.stringify(wire)).not.toMatch(/Therapy|Session notes|Clinic/);
    expect(wire.blindIndexTokens?.length).toBeGreaterThan(0);
    expect(wire).toMatchObject({
      start: "2026-06-01T09:00:00.000Z",
      calendarId: "calendar-1",
      encryptionKeyVersion: 1,
    });

    const decrypted = await e2ee.decryptJsonPayload(
      keys.accountKey,
      JSON.parse(wire.encryptedContent ?? "null"),
      "event-content:v1",
    );
    expect(decrypted).toEqual({
      title: "Therapy",
      description: "Session notes",
      location: "Clinic",
    });
  });

  it("attaches a transient invitation copy only when attendees are invited", async () => {
    const wire = await encryptEventContentRequest(e2ee, keys, {
      title: "Planning",
      location: "Room 7",
      participants: [
        { email: "owner@example.com", role: "organizer" },
        { email: "guest@example.com", role: "attendee" },
      ],
    });

    expect(wire).not.toHaveProperty("title");
    expect(wire.invitationContent).toEqual({
      title: "Planning",
      location: "Room 7",
    });
  });

  it("passes time-only patches through without ciphertext", async () => {
    const request = {
      start: "2026-06-01T09:00:00.000Z",
      end: "2026-06-01T10:00:00.000Z",
    };

    expect(shouldEncryptEventContent(request)).toBe(false);
    expect(shouldEncryptEventContent({ title: "  " })).toBe(false);
    await expect(encryptEventContentRequest(e2ee, keys, request)).resolves.toBe(
      request,
    );
  });
});

describe("encrypted names", () => {
  it("strips the plaintext name and round-trips through decryption", async () => {
    const wire = await encryptNameRequest(e2ee, keys, "calendar", {
      name: " Therapy ",
      color: "blue",
      encryptionState: "shadow_write",
    });

    expect(wire).not.toHaveProperty("name");
    expect(wire).not.toHaveProperty("encryptionState");
    expect(JSON.stringify(wire)).not.toContain("Therapy");
    expect(wire.color).toBe("blue");

    await expect(
      decryptEntityName(e2ee, keys, "calendar", {
        encryptedName: wire.encryptedName,
        encryptionKeyVersion: wire.encryptionKeyVersion,
      }),
    ).resolves.toBe("Therapy");
    // Calendar ciphertext is bound to its kind.
    await expect(
      decryptEntityName(e2ee, keys, "category", {
        encryptedName: wire.encryptedName,
      }),
    ).resolves.toBeNull();
  });

  it("leaves non-rename updates untouched", async () => {
    const request = { isVisible: false };
    await expect(
      encryptNameRequest(e2ee, keys, "calendar", request),
    ).resolves.toBe(request);
  });

  it("hydrates encrypted names or falls back to a placeholder", async () => {
    const wire = await encryptNameRequest(e2ee, keys, "category", {
      name: "Health",
    });
    const record = {
      name: "",
      encryptedName: wire.encryptedName,
      encryptionKeyVersion: 1,
    };

    await expect(
      hydrateEncryptedName(e2ee, keys, "category", record),
    ).resolves.toMatchObject({ name: "Health" });
    await expect(
      hydrateEncryptedName(null, null, "category", record),
    ).resolves.toMatchObject({ name: "Encrypted category" });
    await expect(
      hydrateEncryptedName(null, null, "calendar", { name: "Work" }),
    ).resolves.toEqual({ name: "Work" });
  });
});
