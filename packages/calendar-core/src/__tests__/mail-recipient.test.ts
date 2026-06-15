import { describe, expect, it } from "@jest/globals";

import {
  enrichSelfMailRecipient,
  isCurrentUserMailAddress,
} from "../mail-recipient";

describe("isCurrentUserMailAddress", () => {
  it("matches exact addresses", () => {
    expect(isCurrentUserMailAddress("me@solace.onl", "me@solace.onl")).toBe(true);
  });

  it("matches sub-addresses", () => {
    expect(
      isCurrentUserMailAddress("me+shopping@solace.onl", "me@solace.onl"),
    ).toBe(true);
  });

  it("rejects unrelated addresses", () => {
    expect(
      isCurrentUserMailAddress("other@solace.onl", "me@solace.onl"),
    ).toBe(false);
  });
});

describe("enrichSelfMailRecipient", () => {
  it("fills in the account display name for self addresses", () => {
    expect(
      enrichSelfMailRecipient(
        { email: "me+inbox@solace.onl" },
        { email: "me@solace.onl", name: "Roan" },
      ),
    ).toEqual({
      email: "me+inbox@solace.onl",
      name: "Roan",
    });
  });

  it("keeps an existing recipient name", () => {
    expect(
      enrichSelfMailRecipient(
        { email: "me@solace.onl", name: "Work Alias" },
        { email: "me@solace.onl", name: "Roan" },
      ),
    ).toEqual({
      email: "me@solace.onl",
      name: "Work Alias",
    });
  });
});
