import { describe, expect, it } from "@jest/globals";

import {
  appendMailOAuthResourceParams,
  buildMailOAuthAuthorizeUrl,
} from "../../lib/mail/oauth-client";

describe("mail oauth client helpers", () => {
  it("appends each configured audience as a resource parameter", () => {
    const params = appendMailOAuthResourceParams(
      new URLSearchParams(),
      ["https://mail.solace.onl", "https://cloudflared.roan.dev/api/auth/oauth2/userinfo"],
    );

    expect(params.getAll("resource")).toEqual([
      "https://mail.solace.onl",
      "https://cloudflared.roan.dev/api/auth/oauth2/userinfo",
    ]);
  });

  it("includes configured resource audiences in the authorization url", () => {
    const url = new URL(
      buildMailOAuthAuthorizeUrl({
        config: {
          issuer: "https://cloudflared.roan.dev/api/auth",
          discoveryUrl:
            "https://cloudflared.roan.dev/api/auth/.well-known/openid-configuration",
          authorizationEndpoint:
            "https://cloudflared.roan.dev/api/auth/oauth2/authorize",
          tokenEndpoint: "https://cloudflared.roan.dev/api/auth/oauth2/token",
          userinfoEndpoint:
            "https://cloudflared.roan.dev/api/auth/oauth2/userinfo",
          jwksUri: "https://cloudflared.roan.dev/api/auth/jwks",
          clientId: "solace-mail-browser-dev",
          redirectUri: "https://cloudflared.roan.dev/mail/oauth/callback",
          scopes: ["openid", "profile", "email", "offline_access"],
          audiences: ["https://mail.solace.onl"],
        },
        state: "state-123",
        codeChallenge: "challenge-123",
      }),
    );

    expect(url.searchParams.getAll("resource")).toEqual([
      "https://mail.solace.onl",
    ]);
  });
});