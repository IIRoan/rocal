import { describe, expect, it, jest } from "@jest/globals";

import { changePasswordWithEnvelope } from "../password-change";

const envelope = {
  kdfSalt: "salt",
  wrappedAccountKey: "wrapped-account",
  wrappedSearchKey: "wrapped-search",
};

describe("changePasswordWithEnvelope", () => {
  it("relies on the change when the API stored the envelope with it", async () => {
    const upload = jest.fn(async () => undefined);
    await changePasswordWithEnvelope({
      envelope,
      change: async () => ({ token: null, envelopeStored: true }),
      upload,
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it("uploads the envelope when an older API changed only the password", async () => {
    const upload = jest.fn(async () => undefined);
    await changePasswordWithEnvelope({
      envelope,
      change: async () => ({ token: null }),
      upload,
    });
    expect(upload).toHaveBeenCalledWith(envelope);
  });

  it("uploads nothing when the change itself fails", async () => {
    const upload = jest.fn(async () => undefined);
    await expect(
      changePasswordWithEnvelope({
        envelope,
        change: async () => {
          throw new Error("Invalid password");
        },
        upload,
      }),
    ).rejects.toThrow("Invalid password");
    expect(upload).not.toHaveBeenCalled();
  });
});
