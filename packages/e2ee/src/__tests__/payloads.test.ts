import { beforeAll, describe, expect, it } from "@jest/globals";
import { webcrypto } from "node:crypto";

import type { CryptoProvider } from "../crypto-provider";
import { createE2eeModule } from "../e2ee-module";
import {
  ENCRYPTION_NOT_READY_MESSAGE,
  decryptEntityName,
  encryptEventContentRequest,
  encryptNameRequest,
  hydrateEncryptedName,
  parseEncryptedJsonPayload,
  shouldEncryptEventContent,
  withoutPlaintextEventContent,
  type E2eeSessionKeys,
} from "../payloads";
import { withDecryptedEventContent } from "../hydration";
import { NoopE2eeProvider } from "../provider";

const e2ee = createE2eeModule(webcrypto as unknown as CryptoProvider);
let keys: E2eeSessionKeys;

beforeAll(async () => {
  keys = {
    accountKey: await e2ee.generateAccountKey(),
    blindIndexKey: await e2ee.generateBlindIndexKey(),
  };
});

describe("parseEncryptedJsonPayload", () => {
  const payload = { algorithm: "AES-GCM", version: 1, iv: "iv", ciphertext: "ciphertext" };

  it("accepts a stored encrypted envelope", () => {
    expect(parseEncryptedJsonPayload(JSON.stringify(payload))).toEqual(payload);
  });

  it.each([
    "not json", "null", "[]", '"string"', "{}",
    JSON.stringify({ ...payload, algorithm: "AES-CBC" }),
    JSON.stringify({ ...payload, version: "1" }),
    JSON.stringify({ ...payload, iv: null }),
    JSON.stringify({ ...payload, ciphertext: 1 }),
  ])("returns null for an undecryptable envelope: %s", (raw) => {
    expect(parseEncryptedJsonPayload(raw)).toBeNull();
  });
});

describe("encryptEventContentRequest", () => {
  it("emits ciphertext and blind-index tokens without plaintext content", async () => {
    const wire = await encryptEventContentRequest(e2ee, keys, {
      title: " Therapy ",
      description: "Session notes",
      location: "Clinic",
      start: "2026-06-01T09:00:00.000Z",
      end: "2026-06-01T10:00:00.000Z",
      color: "rose",
      calendarId: "calendar-1",
      categoryId: "category-1",
    });

    for (const field of ["title", "description", "location", "color", "categoryId"]) {
      expect(wire).not.toHaveProperty(field);
    }
    expect(wire).not.toHaveProperty("invitationContent");
    expect(JSON.stringify(wire)).not.toMatch(/Therapy|Session notes|Clinic|rose|category-1/);
    expect(wire.blindIndexTokens?.length).toBeGreaterThan(0);
    expect(wire).toMatchObject({
      start: "2026-06-01T09:00:00.000Z",
      calendarId: "calendar-1",
      encryptionKeyVersion: 1,
      attributesEncrypted: true,
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
      color: "rose",
      categoryId: "category-1",
    });
  });

  it("refuses a colour or category change without a session", () => {
    expect(() => withoutPlaintextEventContent({ color: "rose" })).toThrow(
      ENCRYPTION_NOT_READY_MESSAGE,
    );
    expect(() => withoutPlaintextEventContent({ categoryId: "category-1" })).toThrow(
      ENCRYPTION_NOT_READY_MESSAGE,
    );
    expect(withoutPlaintextEventContent({ start: "2026-06-01T09:00:00.000Z" })).toEqual({
      start: "2026-06-01T09:00:00.000Z",
    });
  });

  it("restores colour and category from the ciphertext unless an older app left a plaintext copy", () => {
    const event = {
      id: "event-1",
      title: "",
      start: new Date("2026-06-01T09:00:00.000Z"),
      end: new Date("2026-06-01T10:00:00.000Z"),
      calendarId: "calendar-1",
      userId: "user-1",
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    };
    const content = { title: "Therapy", color: "rose", categoryId: "category-1" };

    expect(withDecryptedEventContent(event, content)).toMatchObject({
      title: "Therapy",
      color: "rose",
      categoryId: "category-1",
    });
    expect(
      withDecryptedEventContent({ ...event, color: "teal", categoryId: "category-2" }, content),
    ).toMatchObject({ color: "teal", categoryId: "category-2" });
    expect(
      withDecryptedEventContent({ ...event, color: "teal" }, { title: "Therapy" }),
    ).toMatchObject({ color: "teal", categoryId: undefined });
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
    await expect(encryptEventContentRequest(e2ee, keys, request)).resolves.toEqual(
      request,
    );
  });

  it("drops empty content keys and refuses plaintext it cannot encrypt", async () => {
    await expect(
      encryptEventContentRequest(e2ee, keys, { title: " ", location: "", end: "x" }),
    ).resolves.toEqual({ end: "x" });
    await expect(
      encryptEventContentRequest(e2ee, keys, { description: "Session notes" }),
    ).rejects.toThrow(ENCRYPTION_NOT_READY_MESSAGE);
  });
});

describe("NoopE2eeProvider", () => {
  const provider = new NoopE2eeProvider();

  it("throws instead of sending plaintext content without a session", async () => {
    await expect(
      provider.attachEventEncryptionShadow({ title: "Therapy", start: "s", end: "e", calendarId: "c" }),
    ).rejects.toThrow(ENCRYPTION_NOT_READY_MESSAGE);
    await expect(
      provider.attachCalendarEncryptionShadow({ name: "Health", color: "blue" }),
    ).rejects.toThrow(ENCRYPTION_NOT_READY_MESSAGE);
    await expect(
      provider.attachCategoryEncryptionShadow({ name: "Health" }),
    ).rejects.toThrow(ENCRYPTION_NOT_READY_MESSAGE);
  });

  it("passes content-free writes through", async () => {
    await expect(
      provider.attachEventEncryptionShadow({ start: "s", end: "e" }),
    ).resolves.toEqual({ start: "s", end: "e" });
    await expect(
      provider.attachCalendarEncryptionShadow({ isVisible: false, name: "" }),
    ).resolves.toEqual({ isVisible: false });
  });
});

describe("encrypted names", () => {
  it("strips the plaintext name and round-trips through decryption", async () => {
    const wire = await encryptNameRequest(e2ee, keys, "calendar", {
      name: " Therapy ",
      color: "blue",
    });

    expect(wire).not.toHaveProperty("name");
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
    ).resolves.toEqual(request);
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
