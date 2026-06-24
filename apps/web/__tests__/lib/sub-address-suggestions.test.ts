import { describe, expect, it } from "@jest/globals";

import { resolveSubAddressTagSelection } from "../../lib/mail/sub-address-suggestions";
import type { JmapIdentity } from "../../lib/mail/types";

const identities: JmapIdentity[] = [
  {
    id: "id-base",
    email: "user@example.com",
    name: "User",
  },
  {
    id: "id-work",
    email: "user+work@example.com",
    name: "Work",
  },
];

describe("resolveSubAddressTagSelection", () => {
  it("selects an existing tagged identity", () => {
    expect(
      resolveSubAddressTagSelection(identities, "user@example.com", "work"),
    ).toEqual({
      identityId: "id-work",
    });
  });

  it("falls back to the base identity with a from override for new tags", () => {
    expect(
      resolveSubAddressTagSelection(identities, "user@example.com", "shopping"),
    ).toEqual({
      identityId: "id-base",
      fromEmailOverride: "user+shopping@example.com",
    });
  });
});
