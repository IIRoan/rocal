import { describe, expect, it } from "@jest/globals";
import {
  getEncryptionStatusMeta,
  resolveEncryptionState,
} from "./encryption-status";

describe("calendar encryption notices", () => {
  it("does not infer encrypted data from a calendar encryption requirement", () => {
    expect(
      resolveEncryptionState({
        forceFullEncryption: true,
        encryptionState: "plaintext",
      }),
    ).toBe("plaintext");
    expect(
      resolveEncryptionState({
        forceFullEncryption: true,
        encryptionState: "shadow_write",
      }),
    ).toBe("pending");
  });

  it("respects an explicit plaintext state even when a ciphertext copy exists", () => {
    expect(
      resolveEncryptionState({
        encryptionState: "plaintext",
        encryptedContent: "ciphertext",
      }),
    ).toBe("plaintext");
  });

  it("does not assume ciphertext-only storage without an explicit state", () => {
    expect(resolveEncryptionState({ encryptedName: "ciphertext" })).toBe(
      "pending",
    );
    expect(resolveEncryptionState({ encryptedContent: "ciphertext" })).toBe(
      "pending",
    );
    expect(resolveEncryptionState({ encryptedContent: " " })).toBe("plaintext");
  });

  it("discloses reminders, timezone and participants for encrypted events", () => {
    const meta = getEncryptionStatusMeta({ encryptionState: "encrypted" });
    expect(meta.protectedFields).toEqual(["Title", "Description", "Location"]);
    expect(meta.visibleFields.join(" ")).toMatch(/timezone/i);
    expect(meta.visibleFields.join(" ")).toMatch(/reminders/i);
    expect(meta.visibleFields.join(" ")).toMatch(/participants/i);
    expect(meta.description).not.toContain("server can't read");
    expect(meta.originWarning).toContain("server and recipients");
  });

  it("discloses readable legacy copies without guaranteeing the next sync removes them", () => {
    const meta = getEncryptionStatusMeta({ encryptionState: "shadow_write" });
    expect(meta.state).toBe("pending");
    expect(meta.description).toContain("readable copy may remain");
    expect(meta.protectedFields).toEqual([]);
    expect(meta.visibleFields).toContain("Title");
    expect(meta.description).not.toContain("next time");
  });

  it("keeps plaintext invitation details readable until sealing", () => {
    const meta = getEncryptionStatusMeta({
      externalId: "external-invitation",
      isSynced: false,
    });
    expect(meta.state).toBe("plaintext");
    expect(meta.visibleFields).toContain("Title");
  });

  it("limits protection to the saved copy for invitations and imported files", () => {
    const meta = getEncryptionStatusMeta({
      encryptionState: "encrypted",
      externalId: "external-invitation",
      isSynced: false,
    });
    expect(meta.originWarning).toContain(
      "not the original email or imported file",
    );
  });

  it.each(["calendar", "category"] as const)(
    "describes only the %s name as encrypted",
    (kind) => {
      const meta = getEncryptionStatusMeta(
        { encryptionState: "encrypted", encryptedName: "ciphertext" },
        kind,
      );
      expect(meta.label).toBe("Name encrypted");
      expect(meta.protectedFields).toEqual([
        kind === "calendar" ? "Calendar name" : "Category name",
      ]);
      expect(meta.visibleFields.join(" ")).not.toMatch(
        /Title|Description|Start/,
      );
    },
  );

  it("shows the calendar requirement separately from name encryption", () => {
    const meta = getEncryptionStatusMeta(
      { forceFullEncryption: true, encryptionState: "plaintext" },
      "calendar",
    );
    expect(meta.state).toBe("plaintext");
    expect(meta.protectedFields).toEqual([]);
    expect(meta.visibleFields).toContain("Calendar name");
    expect(meta.policyNotice).toContain("older plaintext events");
  });
});
