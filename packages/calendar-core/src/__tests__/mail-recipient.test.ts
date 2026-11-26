import { describe, expect, it } from "@jest/globals";

import {
  enrichSelfMailRecipient,
  isCurrentUserMailAddress,
  summarizeMailRecipients,
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

describe("summarizeMailRecipients", () => {
  const account = { email: "sam@solace.onl", name: "Sam Rivera", identityEmails: ["work@sam.dev"] };

  it("puts the user first, once, and reports the plus-tag the mail reached them at", () => {
    const summary = summarizeMailRecipients(
      {
        to: [{ email: "noor@kiln.studio", name: "Noor" }, { email: "Sam+Shopping@solace.onl" }],
        cc: [{ email: "bo@jansen.nl", name: "Bo" }, { email: "noor@kiln.studio" }],
      },
      account,
    );
    expect(summary.groups.map((group) => group.kind)).toEqual(["to", "cc"]);
    expect(summary.people.map((person) => person.email)).toEqual(["Sam+Shopping@solace.onl", "noor@kiln.studio", "bo@jansen.nl"]);
    expect(summary.people.map((person) => person.self)).toEqual([true, false, false]);
    expect(summary.people[0]?.name).toBe("Sam Rivera");
    expect(summary.selfTag).toBe("shopping");
  });

  it("recognises an identity on another domain and leaves a message to others without a self entry", () => {
    expect(summarizeMailRecipients({ bcc: [{ email: "work@sam.dev" }] }, account).people).toEqual([{ email: "work@sam.dev", name: "Sam Rivera", self: true }]);
    const sent = summarizeMailRecipients({ to: [{ email: "maya@solace.onl", name: "Maya" }] }, account);
    expect(sent.selfTag).toBeNull();
    expect(sent.people).toEqual([{ email: "maya@solace.onl", name: "Maya", self: false }]);
  });

  it("is empty when the headers name nobody", () => {
    expect(summarizeMailRecipients({ to: [{ email: " " }], cc: null }, account)).toEqual({ groups: [], people: [], selfTag: null });
  });
});
