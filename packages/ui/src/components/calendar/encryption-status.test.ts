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
    expect(getEncryptionStatusMeta({ encryptionState: "shadow_write" })).toEqual(
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
        label: "Encrypted",
        shortLabel: "Encrypted",
      }),
    );
  });
});