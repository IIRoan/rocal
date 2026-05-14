import { describe, expect, it } from "@jest/globals";

import {
  ensureCompatibleOauthMetadata,
} from "../../lib/oauth-metadata";

describe("ensureCompatibleOauthMetadata", () => {
  it("adds jwks_uri and corrects the signing algorithm for OIDC discovery metadata", () => {
    const metadata = ensureCompatibleOauthMetadata({
      issuer: "https://cloudflared.roan.dev/api/auth",
      authorization_endpoint:
        "https://cloudflared.roan.dev/api/auth/oauth2/authorize",
      token_endpoint: "https://cloudflared.roan.dev/api/auth/oauth2/token",
      userinfo_endpoint:
        "https://cloudflared.roan.dev/api/auth/oauth2/userinfo",
      id_token_signing_alg_values_supported: ["HS256"],
    });

    expect(metadata).toMatchObject({
      jwks_uri: "https://cloudflared.roan.dev/api/auth/jwks",
      id_token_signing_alg_values_supported: ["EdDSA"],
    });
  });

  it("preserves existing JWKS metadata when it is already accurate", () => {
    const metadata = ensureCompatibleOauthMetadata({
      issuer: "https://cloudflared.roan.dev/api/auth",
      userinfo_endpoint:
        "https://cloudflared.roan.dev/api/auth/oauth2/userinfo",
      jwks_uri: "https://cloudflared.roan.dev/api/auth/jwks",
      id_token_signing_alg_values_supported: ["EdDSA"],
    });

    expect(metadata).toEqual({
      issuer: "https://cloudflared.roan.dev/api/auth",
      userinfo_endpoint:
        "https://cloudflared.roan.dev/api/auth/oauth2/userinfo",
      jwks_uri: "https://cloudflared.roan.dev/api/auth/jwks",
      id_token_signing_alg_values_supported: ["EdDSA"],
    });
  });

  it("adds jwks_uri to authorization-server metadata without injecting OIDC-only fields", () => {
    const metadata = ensureCompatibleOauthMetadata({
      issuer: "https://cloudflared.roan.dev/api/auth",
      authorization_endpoint:
        "https://cloudflared.roan.dev/api/auth/oauth2/authorize",
      token_endpoint: "https://cloudflared.roan.dev/api/auth/oauth2/token",
    });

    expect(metadata).toEqual({
      issuer: "https://cloudflared.roan.dev/api/auth",
      authorization_endpoint:
        "https://cloudflared.roan.dev/api/auth/oauth2/authorize",
      token_endpoint: "https://cloudflared.roan.dev/api/auth/oauth2/token",
      jwks_uri: "https://cloudflared.roan.dev/api/auth/jwks",
    });
  });
});