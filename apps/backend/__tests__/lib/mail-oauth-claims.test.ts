import { describe, expect, it } from "@jest/globals";

import {
  buildMailOauthAccessTokenClaims,
  buildMailOauthUserInfoClaims,
} from "../../lib/mail-oauth-claims";

describe("mail OAuth claim helpers", () => {
  it("prefers explicit resource audiences for access token claims", () => {
    expect(
      buildMailOauthAccessTokenClaims({
        user: {
          email: "teast1532@solace.onl",
          emailVerified: false,
          name: "teast1532",
        },
        scopes: ["openid", "email", "profile"],
        resource: ["https://mail.solace.onl"],
        metadata: {
          audiences: ["https://ignored.example.com"],
        },
      }),
    ).toEqual({
      email: "teast1532@solace.onl",
      email_verified: false,
      name: "teast1532",
      aud: "https://mail.solace.onl",
    });
  });

  it("falls back to client metadata audiences for access token claims", () => {
    expect(
      buildMailOauthAccessTokenClaims({
        user: {
          email: "teast1532@solace.onl",
          emailVerified: true,
          name: "Teast Example",
        },
        scopes: ["openid", "email", "profile"],
        metadata: {
          audiences: ["https://mail.solace.onl", "https://cloudflared.roan.dev/api/auth/oauth2/userinfo"],
        },
      }),
    ).toEqual({
      email: "teast1532@solace.onl",
      email_verified: true,
      name: "Teast Example",
      given_name: "Teast",
      family_name: "Example",
      aud: [
        "https://mail.solace.onl",
        "https://cloudflared.roan.dev/api/auth/oauth2/userinfo",
      ],
    });
  });

  it("omits email and profile claims when those scopes were not granted", () => {
    expect(
      buildMailOauthAccessTokenClaims({
        user: {
          email: "teast1532@solace.onl",
          emailVerified: true,
          name: "Teast Example",
        },
        scopes: ["openid"],
        resource: ["https://mail.solace.onl"],
      }),
    ).toEqual({
      aud: "https://mail.solace.onl",
    });
  });

  it("builds userinfo claims needed by opaque-token mail clients", () => {
    expect(
      buildMailOauthUserInfoClaims({
        defaultIssuer: "https://cloudflared.roan.dev/api/auth",
        scopes: ["openid", "email", "profile"],
        jwt: {
          scope: "openid email profile",
          aud: ["https://mail.solace.onl"],
          client_id: "solace-mail-browser-dev",
        },
      }),
    ).toEqual({
      scope: "openid email profile",
      aud: "https://mail.solace.onl",
      azp: "solace-mail-browser-dev",
      iss: "https://cloudflared.roan.dev/api/auth",
    });
  });
});