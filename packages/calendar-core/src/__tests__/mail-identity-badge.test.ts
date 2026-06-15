import { describe, expect, it } from "@jest/globals";

import {
  resolveMailIdentityBadge,
  shouldShowIdentityNameBadge,
} from "../mail-identity-badge";
import { parseSubAddress } from "../mail-sub-addressing";

describe("parseSubAddress", () => {
  it("extracts sub-address tags", () => {
    expect(parseSubAddress("user+shopping@example.com")).toEqual({
      localPart: "user+shopping",
      baseUser: "user",
      tag: "shopping",
      domain: "example.com",
      fullAddress: "user+shopping@example.com",
    });
  });

  it("returns null tag for plain addresses", () => {
    expect(parseSubAddress("user@example.com").tag).toBeNull();
  });
});

describe("resolveMailIdentityBadge", () => {
  const identities = [
    { id: "1", email: "me@solace.onl", name: "Work" },
  ];

  it("shows sent sub-address tag", () => {
    const info = resolveMailIdentityBadge(
      {
        from: [{ email: "me+newsletter@solace.onl" }],
        to: [{ email: "other@example.com" }],
      },
      identities,
    );

    expect(info).toEqual({
      fromAddress: "me+newsletter@solace.onl",
      displayTag: "newsletter",
      matchingIdentity: identities[0],
    });
  });

  it("shows received sub-address tag", () => {
    const info = resolveMailIdentityBadge(
      {
        from: [{ email: "sender@example.com" }],
        to: [{ email: "me+shopping@solace.onl" }],
      },
      identities,
    );

    expect(info?.displayTag).toBe("shopping");
    expect(info?.matchingIdentity).toBeNull();
  });

  it("hides from identity when untrusted", () => {
    const info = resolveMailIdentityBadge(
      {
        from: [{ email: "me+spoof@solace.onl" }],
        to: [{ email: "me+inbox@solace.onl" }],
      },
      identities,
      { trustFromIdentity: false },
    );

    expect(info?.displayTag).toBe("inbox");
    expect(info?.matchingIdentity).toBeNull();
  });

  it("returns null when no identity match", () => {
    expect(
      resolveMailIdentityBadge(
        {
          from: [{ email: "other@example.com" }],
          to: [{ email: "someone@example.com" }],
        },
        identities,
      ),
    ).toBeNull();
  });
});

describe("shouldShowIdentityNameBadge", () => {
  it("prefers tag badge over identity name", () => {
    expect(
      shouldShowIdentityNameBadge({
        fromAddress: "me@solace.onl",
        displayTag: "tag",
        matchingIdentity: { email: "me@solace.onl", name: "Work" },
      }),
    ).toBe(false);
  });

  it("shows identity name when no tag", () => {
    expect(
      shouldShowIdentityNameBadge({
        fromAddress: "me@solace.onl",
        displayTag: null,
        matchingIdentity: { email: "me@solace.onl", name: "Work" },
      }),
    ).toBe(true);
  });
});
