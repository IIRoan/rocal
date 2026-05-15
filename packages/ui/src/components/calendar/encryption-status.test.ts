import { describe, expect, it } from "@jest/globals";

import {
  getEncryptionStatusMeta,
  resolveEncryptionState,
} from "./encryption-status";

describe("resolveEncryptionState", () => {
  it("infers hybrid encryption from encrypted shadows", () => {
    expect(resolveEncryptionState({ encryptedName: "ciphertext" })).toBe(
      "shadow_write",
    );
    expect(resolveEncryptionState({ encryptedContent: "ciphertext" })).toBe(
      "shadow_write",
    );
  });
});

describe("getEncryptionStatusMeta", () => {
  it("labels shadow-write items as hybrid encrypted", () => {
    expect(
      getEncryptionStatusMeta({ encryptionState: "shadow_write" }),
    ).toEqual(
      expect.objectContaining({
        state: "shadow_write",
        label: "Hybrid encrypted",
        shortLabel: "Hybrid",
      }),
    );
  });

  it("keeps plaintext items labeled as not encrypted", () => {
    expect(getEncryptionStatusMeta({})).toEqual(
      expect.objectContaining({
        state: "plaintext",
        label: "Not encrypted",
        shortLabel: "Plaintext",
      }),
    );
  });

  it("keeps fully encrypted items labeled as encrypted", () => {
    expect(getEncryptionStatusMeta({ encryptionState: "encrypted" })).toEqual(
      expect.objectContaining({
        state: "encrypted",
        label: "End-to-end encrypted",
        shortLabel: "Encrypted",
      }),
    );
  });

  it("surfaces force-full-encryption calendars with a dedicated state", () => {
    expect(getEncryptionStatusMeta({ forceFullEncryption: true })).toEqual(
      expect.objectContaining({
        state: "force_full",
        label: "Force-encrypted calendar",
        shortLabel: "Locked",
      }),
    );
  });

  it("force-full takes precedence over plaintext encryption state", () => {
    expect(
      getEncryptionStatusMeta({
        forceFullEncryption: true,
        encryptionState: "plaintext",
      }),
    ).toEqual(expect.objectContaining({ state: "force_full" }));
  });

  it("force-full takes precedence over hybrid shadow_write state", () => {
    expect(
      getEncryptionStatusMeta({
        forceFullEncryption: true,
        encryptionState: "shadow_write",
        encryptedContent: "x",
      }),
    ).toEqual(expect.objectContaining({ state: "force_full" }));
  });
});

describe("resolveEncryptionState force-full precedence", () => {
  it("returns force_full when the flag is set", () => {
    expect(resolveEncryptionState({ forceFullEncryption: true })).toBe(
      "force_full",
    );
  });

  it("ignores a falsy force flag", () => {
    expect(
      resolveEncryptionState({
        forceFullEncryption: false,
        encryptionState: "encrypted",
      }),
    ).toBe("encrypted");
  });
});
