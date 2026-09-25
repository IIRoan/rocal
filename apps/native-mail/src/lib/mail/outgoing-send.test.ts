import {
  resolveEncryptionInternalDomain,
  shouldEncryptOutgoingMail,
} from "@workspace/calendar-core";

describe("native outgoing send policy", () => {
  it("identifies external gmail recipients as non-encryptable", () => {
    const domain = resolveEncryptionInternalDomain("solace.onl");
    expect(shouldEncryptOutgoingMail(["friend@gmail.com"], domain)).toBe(false);
  });

  it("requires all recipients on the configured domain before encrypting", () => {
    const domain = resolveEncryptionInternalDomain("solace.onl");
    expect(
      shouldEncryptOutgoingMail(
        ["alice@solace.onl", "bob@solace.onl"],
        domain,
      ),
    ).toBe(true);
    expect(
      shouldEncryptOutgoingMail(
        ["alice@solace.onl", "friend@gmail.com"],
        domain,
      ),
    ).toBe(false);
  });
});
