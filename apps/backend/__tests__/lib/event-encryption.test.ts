import { describe, expect, it } from "@jest/globals";

import {
  normalizeEventEncryptionMode,
  resolveEventPersistencePolicy,
} from "../../lib/event-encryption";

describe("event encryption policy", () => {
  it("defaults to hybrid mode", () => {
    expect(normalizeEventEncryptionMode(undefined)).toBe("hybrid");
    expect(normalizeEventEncryptionMode("anything-else")).toBe("hybrid");
  });

  it("keeps plaintext when no encrypted payload exists", () => {
    expect(
      resolveEventPersistencePolicy({
        mode: "hybrid",
        hasEncryptedPayload: false,
        title: "Planning",
        description: "Discuss roadmap",
        location: "Room 7",
      }),
    ).toEqual({
      encryptionState: "plaintext",
      title: "Planning",
      description: "Discuss roadmap",
      location: "Room 7",
    });
  });

  it("stores hybrid events as fully encrypted when no plaintext dependency exists", () => {
    expect(
      resolveEventPersistencePolicy({
        mode: "hybrid",
        hasEncryptedPayload: true,
        title: "Planning",
        description: "Discuss roadmap",
        location: "Room 7",
      }),
    ).toEqual({
      encryptionState: "encrypted",
      title: "",
      description: null,
      location: null,
    });
  });

  it("keeps shadow-write plaintext when reminders require readable content", () => {
    expect(
      resolveEventPersistencePolicy({
        mode: "hybrid",
        hasEncryptedPayload: true,
        title: "Planning",
        description: "Discuss roadmap",
        location: "Room 7",
        reminderMinutes: 30,
      }),
    ).toEqual({
      encryptionState: "shadow_write",
      title: "Planning",
      description: "Discuss roadmap",
      location: "Room 7",
    });
  });

  it("keeps shadow-write plaintext when calendar sharing requires readable content", () => {
    expect(
      resolveEventPersistencePolicy({
        mode: "hybrid",
        hasEncryptedPayload: true,
        title: "Planning",
        description: "Discuss roadmap",
        location: "Room 7",
        calendarShareEnabled: true,
      }),
    ).toEqual({
      encryptionState: "shadow_write",
      title: "Planning",
      description: "Discuss roadmap",
      location: "Room 7",
    });
  });

  it("forces ciphertext-only storage in full mode", () => {
    expect(
      resolveEventPersistencePolicy({
        mode: "full",
        hasEncryptedPayload: true,
        title: "Planning",
        description: "Discuss roadmap",
        location: "Room 7",
        reminderMinutes: 30,
        calendarShareEnabled: true,
      }),
    ).toEqual({
      encryptionState: "encrypted",
      title: "",
      description: null,
      location: null,
    });
  });

  it("force-full calendar overrides hybrid mode and reminder shadows", () => {
    expect(
      resolveEventPersistencePolicy({
        mode: "hybrid",
        hasEncryptedPayload: true,
        title: "Planning",
        description: "Discuss roadmap",
        location: "Room 7",
        reminderMinutes: 30,
        calendarShareEnabled: true,
        calendarForceFullEncryption: true,
      }),
    ).toEqual({
      encryptionState: "encrypted",
      title: "",
      description: null,
      location: null,
    });
  });

  it("force-full calendar still requires an encrypted payload before stripping plaintext", () => {
    expect(
      resolveEventPersistencePolicy({
        mode: "hybrid",
        hasEncryptedPayload: false,
        title: "Planning",
        description: "Discuss roadmap",
        location: "Room 7",
        calendarForceFullEncryption: true,
      }),
    ).toEqual({
      encryptionState: "plaintext",
      title: "Planning",
      description: "Discuss roadmap",
      location: "Room 7",
    });
  });

  it("falsy force-full flag preserves hybrid shadow_write behavior", () => {
    expect(
      resolveEventPersistencePolicy({
        mode: "hybrid",
        hasEncryptedPayload: true,
        title: "Planning",
        description: "Discuss roadmap",
        location: "Room 7",
        reminderMinutes: 30,
        calendarForceFullEncryption: false,
      }),
    ).toEqual({
      encryptionState: "shadow_write",
      title: "Planning",
      description: "Discuss roadmap",
      location: "Room 7",
    });
  });
});