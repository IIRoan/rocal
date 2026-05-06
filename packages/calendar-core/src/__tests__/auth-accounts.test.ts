import { describe, expect, it } from "@jest/globals";
import {
  extractLinkedAuthAccounts,
  summarizeLinkedAuthAccounts,
} from "../auth-accounts";

describe("auth account helpers", () => {
  it("extracts linked accounts from nested query payloads", () => {
    expect(
      extractLinkedAuthAccounts({
        data: {
          accounts: [{ providerId: "github" }, { providerId: "passkey" }],
        },
      }),
    ).toEqual([{ providerId: "github" }, { providerId: "passkey" }]);
  });

  it("recognizes OAuth-only accounts from wrapped listAccounts responses", () => {
    expect(
      summarizeLinkedAuthAccounts({
        data: {
          accounts: [{ providerId: "github" }],
        },
      }),
    ).toEqual({
      hasPasswordAccount: false,
      hasOAuthAccount: true,
      isOAuthOnly: true,
    });
  });

  it("treats password provider aliases as password-linked accounts", () => {
    expect(
      summarizeLinkedAuthAccounts([
        { providerId: "password" },
        { providerId: "github" },
      ]),
    ).toEqual({
      hasPasswordAccount: true,
      hasOAuthAccount: true,
      isOAuthOnly: false,
    });
  });

  it("falls back to alternate provider fields when providerId is absent", () => {
    expect(
      summarizeLinkedAuthAccounts({
        accounts: [{ provider: "passkey" }, { account: { provider: "email" } }],
      }),
    ).toEqual({
      hasPasswordAccount: true,
      hasOAuthAccount: true,
      isOAuthOnly: false,
    });
  });
});
