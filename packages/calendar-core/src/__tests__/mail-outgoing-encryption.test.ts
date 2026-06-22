import { describe, expect, it } from "@jest/globals";

import {
  isStalwartEncryptOnAppendEnabled,
  resolveEncryptionInternalDomain,
  shouldEncryptOutgoingMail,
} from "../mail-addresses";

describe("resolveEncryptionInternalDomain", () => {
  it("returns the trimmed lowercase configured domain", () => {
    expect(resolveEncryptionInternalDomain("  Solace.Onl ")).toBe("solace.onl");
  });

  it("returns null for empty or whitespace-only configuration", () => {
    expect(resolveEncryptionInternalDomain("")).toBeNull();
    expect(resolveEncryptionInternalDomain("   ")).toBeNull();
    expect(resolveEncryptionInternalDomain(null)).toBeNull();
    expect(resolveEncryptionInternalDomain(undefined)).toBeNull();
  });

  it("does not infer a domain from mailbox addresses", () => {
    expect(resolveEncryptionInternalDomain("")).toBeNull();
  });
});

describe("shouldEncryptOutgoingMail", () => {
  const domain = "solace.onl";

  it("encrypts only when every recipient is on the configured domain", () => {
    expect(shouldEncryptOutgoingMail(["alice@solace.onl"], domain)).toBe(true);
    expect(shouldEncryptOutgoingMail(["friend@gmail.com"], domain)).toBe(false);
    expect(
      shouldEncryptOutgoingMail(
        ["alice@solace.onl", "friend@gmail.com"],
        domain,
      ),
    ).toBe(false);
  });

  it("treats display-name recipients as internal when the email domain matches", () => {
    expect(
      shouldEncryptOutgoingMail(["Alice <alice@solace.onl>"], domain),
    ).toBe(true);
    expect(
      shouldEncryptOutgoingMail(["Friend <friend@gmail.com>"], domain),
    ).toBe(false);
  });

  it("normalizes recipient casing before comparing domains", () => {
    expect(
      shouldEncryptOutgoingMail(["Alice@Solace.Onl", "BOB@solace.onl"], domain),
    ).toBe(true);
    expect(
      shouldEncryptOutgoingMail(["User <Gmail@Gmail.COM>"], domain),
    ).toBe(false);
  });

  it("requires every to, cc, and bcc recipient to be internal", () => {
    expect(
      shouldEncryptOutgoingMail(
        ["alice@solace.onl", "bob@solace.onl", "cc@gmail.com"],
        domain,
      ),
    ).toBe(false);
    expect(
      shouldEncryptOutgoingMail(
        ["alice@solace.onl", "bob@solace.onl", "watch@solace.onl"],
        domain,
      ),
    ).toBe(true);
  });

  it("rejects encryption when the configured domain is missing", () => {
    expect(shouldEncryptOutgoingMail(["alice@solace.onl"], null)).toBe(false);
    expect(shouldEncryptOutgoingMail(["alice@solace.onl"], "")).toBe(false);
  });

  it("rejects encryption when there are no recipients", () => {
    expect(shouldEncryptOutgoingMail([], domain)).toBe(false);
  });

  it("does not treat subdomains or sibling domains as internal", () => {
    expect(shouldEncryptOutgoingMail(["user@mail.solace.onl"], domain)).toBe(
      false,
    );
    expect(shouldEncryptOutgoingMail(["user@notsolace.onl"], domain)).toBe(
      false,
    );
  });
});

describe("isStalwartEncryptOnAppendEnabled", () => {
  it("returns true only when encryptOnAppend is explicitly enabled", () => {
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

  it("returns false when encryptOnAppend is disabled or absent", () => {
    expect(
      isStalwartEncryptOnAppendEnabled({
        encryptionAtRest: {
          "@type": "Aes256",
          publicKey: "pk-1",
          encryptOnAppend: false,
        },
      }),
    ).toBe(false);

    expect(
      isStalwartEncryptOnAppendEnabled({
        encryptionAtRest: { "@type": "Aes256", publicKey: "pk-1" },
      }),
    ).toBe(false);

    expect(
      isStalwartEncryptOnAppendEnabled({
        encryptionAtRest: { "@type": "Disabled" },
      }),
    ).toBe(false);
  });

  it("returns false for missing or malformed account settings", () => {
    expect(isStalwartEncryptOnAppendEnabled(null)).toBe(false);
    expect(isStalwartEncryptOnAppendEnabled(undefined)).toBe(false);
    expect(isStalwartEncryptOnAppendEnabled({})).toBe(false);
    expect(
      isStalwartEncryptOnAppendEnabled({ encryptionAtRest: "invalid" }),
    ).toBe(false);
  });
});
