import { describe, expect, it } from "@jest/globals";

import {
  isImportedExternalInvitationEvent,
  shouldSealImportedInvitationEncryption,
  indexInvitationImportEncryption,
} from "../invitation-encryption";

describe("invitation encryption helpers", () => {
  it("identifies imported external invitation events", () => {
    expect(
      isImportedExternalInvitationEvent({
        externalId: "google-event@example.com",
        isSynced: false,
        subscriptionId: null,
      }),
    ).toBe(true);
  });

  it("excludes synced subscription copies", () => {
    expect(
      isImportedExternalInvitationEvent({
        externalId: "sub-event@example.com",
        isSynced: true,
        subscriptionId: "sub-1",
      }),
    ).toBe(false);
  });

  it("seals plaintext imported invitations", () => {
    expect(
      shouldSealImportedInvitationEncryption({
        externalId: "google-event@example.com",
        isSynced: false,
        subscriptionId: null,
        encryptionState: "plaintext",
        encryptedContent: null,
      }),
    ).toBe(true);
  });

  it("skips already encrypted imported invitations", () => {
    expect(
      shouldSealImportedInvitationEncryption({
        externalId: "google-event@example.com",
        isSynced: false,
        subscriptionId: null,
        encryptionState: "encrypted",
        encryptedContent: "ciphertext",
      }),
    ).toBe(false);
  });

  it("indexes encryption payloads by external id", () => {
    const map = indexInvitationImportEncryption([
      {
        externalId: "invite@example.com",
        encryptedContent: "ciphertext",
      },
    ]);

    expect(map.get("invite@example.com")).toEqual({
      externalId: "invite@example.com",
      encryptedContent: "ciphertext",
    });
  });
});
