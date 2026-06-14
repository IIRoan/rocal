import { describe, expect, it } from "@jest/globals";

import {
  containsArmoredPgpMessage,
  isNestedArmoredPgpMessage,
  mergeSignatureVerificationState,
  PGP_MESSAGE_BEGIN,
  PGP_MESSAGE_END,
} from "../../lib/mail/pgp-layers";

describe("native mail pgp layer helpers", () => {
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
    expect(containsArmoredPgpMessage("plain")).toBe(false);
  });

  it("merges signature states with failed taking priority", () => {
    expect(
      mergeSignatureVerificationState("verified", "failed"),
    ).toBe("failed");
    expect(
      mergeSignatureVerificationState("not_signed", "verified"),
    ).toBe("verified");
  });
});
