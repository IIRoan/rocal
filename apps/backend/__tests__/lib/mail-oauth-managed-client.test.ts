import { describe, expect, it } from "@jest/globals";

import {
  buildManagedMailOauthClientState,
  managedMailOauthClientNeedsUpdate,
} from "../../lib/mail-oauth-managed-client";

describe("managed mail OAuth client reconciliation", () => {
  const desired = buildManagedMailOauthClientState({
    client: {
      clientId: "solace-mail-browser",
      clientName: "Solace Mail Web",
      redirectUris: ["https://solace.onl/mail/oauth/callback"],
      type: "user-agent-based",
      tokenEndpointAuthMethod: "none",
    },
    audiences: ["https://mail.solace.onl"],
    issuer: "https://api.solace.onl/api/auth",
  });

  it("treats legacy JSON-string metadata as equivalent when the content matches", () => {
    expect(
      managedMailOauthClientNeedsUpdate({
        existing: {
          clientId: "solace-mail-browser",
          clientSecret: null,
          name: "Solace Mail Web",
          redirectUris: ["https://solace.onl/mail/oauth/callback"],
          postLogoutRedirectUris: [],
          tokenEndpointAuthMethod: "none",
          grantTypes: ["refresh_token", "authorization_code"],
          responseTypes: ["code"],
          type: "user-agent-based",
          skipConsent: true,
          enableEndSession: false,
          metadata:
            '{"issuer":"https://api.solace.onl/api/auth","audiences":["https://mail.solace.onl"]}',
        },
        desired,
      }),
    ).toBe(false);
  });

  it("detects redirect URI drift so managed clients can be repaired", () => {
    expect(
      managedMailOauthClientNeedsUpdate({
        existing: {
          clientId: "solace-mail-browser",
          clientSecret: null,
          name: "Solace Mail Web",
          redirectUris: ["https://cloudflared.roan.dev/mail/oauth/callback"],
          postLogoutRedirectUris: [],
          tokenEndpointAuthMethod: "none",
          grantTypes: ["authorization_code", "refresh_token"],
          responseTypes: ["code"],
          type: "user-agent-based",
          skipConsent: true,
          enableEndSession: false,
          metadata: {
            issuer: "https://cloudflared.roan.dev/api/auth",
            audiences: ["https://mail.solace.onl"],
          },
        },
        desired,
      }),
    ).toBe(true);
  });
});
