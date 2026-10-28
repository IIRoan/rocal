import { describe, expect, it } from "@jest/globals";
import {
  getEncryptionStatusMeta,
  resolveEncryptionState,
} from "./encryption-status-utils";

describe("calendar encryption notices", () => {
  it("respects an explicit plaintext state even when a ciphertext copy exists", () => {
    expect(
      resolveEncryptionState({
        encryptionState: "plaintext",
        encryptedContent: "ciphertext",
      }),
    ).toBe("plaintext");
  });

  it("treats ciphertext without an explicit state as encrypted", () => {
    expect(resolveEncryptionState({ encryptedName: "ciphertext" })).toBe(
      "encrypted",
    );
    expect(resolveEncryptionState({ encryptedContent: "ciphertext" })).toBe(
      "encrypted",
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

  it("lists the readable name of a plaintext feed calendar", () => {
    const meta = getEncryptionStatusMeta(
      { encryptionState: "plaintext" },
      "calendar",
    );
    expect(meta.state).toBe("plaintext");
    expect(meta.protectedFields).toEqual([]);
    expect(meta.visibleFields).toContain("Calendar name");
  });
});
