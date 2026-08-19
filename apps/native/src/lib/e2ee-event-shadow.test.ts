import { shouldAttachEventContentEncryption } from "./e2ee-event-shadow";

describe("shouldAttachEventContentEncryption", () => {
  it("skips time-only updates that omit title", () => {
    const request = {
      start: "2026-08-18T09:00:00.000Z",
      end: "2026-08-18T10:00:00.000Z",
      timezone: "Europe/Amsterdam",
    };

    expect(shouldAttachEventContentEncryption(request)).toBe(false);
  });

  it("skips blank titles so empty ciphertext is not attached", () => {
    expect(shouldAttachEventContentEncryption({ title: "" })).toBe(false);
    expect(shouldAttachEventContentEncryption({ title: "   " })).toBe(false);
  });

  it("attaches a shadow when a real title is present", () => {
    expect(shouldAttachEventContentEncryption({ title: " Standup " })).toBe(
      true,
    );
  });
});
