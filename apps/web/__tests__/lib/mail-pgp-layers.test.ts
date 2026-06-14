import { describe, expect, it } from "@jest/globals";

import {
  containsArmoredPgpMessage,
  isNestedArmoredPgpMessage,
  mergeSignatureVerificationState,
  PGP_MESSAGE_BEGIN,
  PGP_MESSAGE_END,
  resolveLayerSignatureVerificationState,
} from "../../lib/mail/pgp-layers";

describe("mail pgp layer helpers", () => {
  it("detects armored PGP envelopes", () => {
    expect(containsArmoredPgpMessage("plain text")).toBe(false);
    expect(
      containsArmoredPgpMessage(`${PGP_MESSAGE_BEGIN}\nabc\n${PGP_MESSAGE_END}`),
    ).toBe(true);
  });

  it("detects nested armored envelopes", () => {
    const nested = [
      PGP_MESSAGE_BEGIN,
      "outer",
      PGP_MESSAGE_END,
      PGP_MESSAGE_BEGIN,
      "inner",
      PGP_MESSAGE_END,
    ].join("\n");

    expect(isNestedArmoredPgpMessage(nested)).toBe(true);
    expect(
      isNestedArmoredPgpMessage(
        `${PGP_MESSAGE_BEGIN}\nonly-one\n${PGP_MESSAGE_END}`,
      ),
    ).toBe(false);
  });

  it("merges signature states with failed taking priority", () => {
    expect(
      mergeSignatureVerificationState("verified", "failed"),
    ).toBe("failed");
    expect(
      mergeSignatureVerificationState("unverified", "verified"),
    ).toBe("verified");
    expect(
      mergeSignatureVerificationState("not_signed", "unverified"),
    ).toBe("unverified");
  });

  it("resolves per-layer signature verification", async () => {
    await expect(
      resolveLayerSignatureVerificationState({
        signatures: undefined,
        hasVerificationKey: true,
      }),
    ).resolves.toBe("not_signed");

    await expect(
      resolveLayerSignatureVerificationState({
        signatures: [{ verified: Promise.resolve(true) }],
        hasVerificationKey: false,
      }),
    ).resolves.toBe("unverified");

    await expect(
      resolveLayerSignatureVerificationState({
        signatures: [{ verified: Promise.resolve(true) }],
        hasVerificationKey: true,
      }),
    ).resolves.toBe("verified");

    await expect(
      resolveLayerSignatureVerificationState({
        signatures: [{ verified: Promise.reject(new Error("bad sig")) }],
        hasVerificationKey: true,
      }),
    ).resolves.toBe("failed");
  });
});
