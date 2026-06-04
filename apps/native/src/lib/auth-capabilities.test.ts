import { getAuthCapabilities } from "./auth-capabilities";

describe("getAuthCapabilities", () => {
  it("uses the browser bridge for passkeys on native iOS", () => {
    expect(
      getAuthCapabilities({
        platformOs: "ios",
        hasSecurePasskeyBridgeOrigin: true,
      }),
    ).toEqual({
      supportsPassword: true,
      supportsGitHubOAuth: true,
      supportsPasskeys: true,
      passkeyMode: "browser-bridge",
      passkeyMessage: "Passkeys open in your browser on native.",
    });
  });

  it("uses the browser bridge on native even without browser WebAuthn globals", () => {
    expect(
      getAuthCapabilities({
        platformOs: "android",
        hasSecurePasskeyBridgeOrigin: true,
      }),
    ).toEqual({
      supportsPassword: true,
      supportsGitHubOAuth: true,
      supportsPasskeys: true,
      passkeyMode: "browser-bridge",
      passkeyMessage: "Passkeys open in your browser on native.",
    });
  });

  it("marks native passkeys unsupported when the bridge origin is insecure", () => {
    expect(
      getAuthCapabilities({
        platformOs: "ios",
        hasSecurePasskeyBridgeOrigin: false,
      }),
    ).toEqual({
      supportsPassword: true,
      supportsGitHubOAuth: true,
      supportsPasskeys: false,
      passkeyMode: "unsupported",
      passkeyMessage:
        "Passkeys require an HTTPS app URL (or localhost) on native. Set EXPO_PUBLIC_APP_URL to an https:// tunnel or hosted frontend.",
    });
  });

  it("supports browser passkeys when WebAuthn exists", () => {
    expect(
      getAuthCapabilities({
        platformOs: "web",
        hasPublicKeyCredential: true,
      }),
    ).toEqual({
      supportsPassword: true,
      supportsGitHubOAuth: true,
      supportsPasskeys: true,
      passkeyMode: "web",
      passkeyMessage: null,
    });
  });

  it("falls back cleanly when browser passkeys are unavailable", () => {
    expect(
      getAuthCapabilities({
        platformOs: "web",
        hasPublicKeyCredential: false,
      }),
    ).toEqual({
      supportsPassword: true,
      supportsGitHubOAuth: true,
      supportsPasskeys: false,
      passkeyMode: "unsupported",
      passkeyMessage: "Passkeys are unavailable in this browser.",
    });
  });
});
