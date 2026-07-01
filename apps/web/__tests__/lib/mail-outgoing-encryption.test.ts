import { describe, expect, it } from "@jest/globals";
import {
  isStalwartEncryptOnAppendEnabled,
  resolveEncryptionInternalDomain,
  shouldEncryptOutgoingMail,
} from "@workspace/calendar-core";

describe("web outgoing send policy", () => {
  const domain = resolveEncryptionInternalDomain("solace.onl");

  it("never encrypts gmail recipients", () => {
    expect(shouldEncryptOutgoingMail(["friend@gmail.com"], domain)).toBe(false);
    expect(
      shouldEncryptOutgoingMail(["Alice <friend@gmail.com>"], domain),
    ).toBe(false);
  });

  it("encrypts only all-solace recipient sets", () => {
    expect(shouldEncryptOutgoingMail(["bob@solace.onl"], domain)).toBe(true);
    expect(
      shouldEncryptOutgoingMail(["bob@solace.onl", "friend@gmail.com"], domain),
    ).toBe(false);
  });

  it("detects when Stalwart encryptOnAppend would break external delivery", () => {
    expect(
      isStalwartEncryptOnAppendEnabled({
        encryptionAtRest: {
          "@type": "Aes256",
          publicKey: "pk-1",
          encryptOnAppend: true,
        },
      }),
    ).toBe(true);
  });
});
