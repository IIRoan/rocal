import { getAuthCapabilities } from "./auth-capabilities";

describe("getAuthCapabilities", () => {
  it("uses the browser bridge for passkeys in Expo Go", () => {
    expect(
        getAuthCapabilities({
          platformOs: "ios",
          expoExecutionEnvironment: "storeClient",
          expoAppOwnership: "expo",
          hasSecurePasskeyBridgeOrigin: true,
        }),
    ).toEqual({
      supportsPassword: true,
      supportsGitHubOAuth: true,
      supportsPasskeys: true,
      passkeyMode: "browser-bridge",
      passkeyMessage:
        "Passkeys open in your browser while you're using Expo Go.",
    });
  });

  it("supports passkeys in native builds when the native module is available", () => {
    expect(
        getAuthCapabilities({
          platformOs: "android",
          expoExecutionEnvironment: "standalone",
          hasSecurePasskeyBridgeOrigin: true,
        }),
    ).toEqual({
      supportsPassword: true,
      supportsGitHubOAuth: true,
      supportsPasskeys: true,
      passkeyMode: "browser-bridge",
      passkeyMessage:
        "Passkeys open in your browser on native so the flow also works in Expo Go.",
    });
  });

  it("uses the browser bridge in native builds even without browser WebAuthn globals", () => {
    expect(
        getAuthCapabilities({
          platformOs: "ios",
          expoExecutionEnvironment: "standalone",
          hasSecurePasskeyBridgeOrigin: true,
        }),
    ).toEqual({
      supportsPassword: true,
      supportsGitHubOAuth: true,
      supportsPasskeys: true,
      passkeyMode: "browser-bridge",
      passkeyMessage:
        "Passkeys open in your browser on native so the flow also works in Expo Go.",
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

  it("marks Expo Go passkeys unsupported when the bridge origin is insecure", () => {
    expect(
      getAuthCapabilities({
        platformOs: "ios",
        expoExecutionEnvironment: "storeClient",
        expoAppOwnership: "expo",
        hasSecurePasskeyBridgeOrigin: false,
      }),
    ).toEqual({
      supportsPassword: true,
      supportsGitHubOAuth: true,
      supportsPasskeys: false,
      passkeyMode: "unsupported",
      passkeyMessage:
        "Passkeys require an HTTPS app URL (or localhost) in Expo Go. Set EXPO_PUBLIC_APP_URL to an https:// tunnel or hosted frontend.",
    });
  });
});
