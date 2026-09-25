import { detectRuntime } from "@workspace/runtime";

export interface AuthCapabilitiesInput {
  platformOs?: string | null;
  hasPublicKeyCredential?: boolean;
  hasSecurePasskeyBridgeOrigin?: boolean;
}

export type PasskeySupportMode =
  | "web"
  | "native"
  | "browser-bridge"
  | "unsupported";

export interface AuthCapabilities {
  supportsPassword: true;
  supportsGitHubOAuth: true;
  supportsPasskeys: boolean;
  passkeyMode: PasskeySupportMode;
  passkeyMessage: string | null;
}

export function getAuthCapabilities(
  input: AuthCapabilitiesInput,
): AuthCapabilities {
  const runtime = detectRuntime({ platformOs: input.platformOs });

  if (runtime.isWeb) {
    return {
      supportsPassword: true,
      supportsGitHubOAuth: true,
      supportsPasskeys: Boolean(input.hasPublicKeyCredential),
      passkeyMode: input.hasPublicKeyCredential ? "web" : "unsupported",
      passkeyMessage: input.hasPublicKeyCredential
        ? null
        : "Passkeys are unavailable in this browser.",
    };
  }

  if (runtime.isExpoNative) {
    if (!input.hasSecurePasskeyBridgeOrigin) {
      return {
        supportsPassword: true,
        supportsGitHubOAuth: true,
        supportsPasskeys: false,
        passkeyMode: "unsupported",
        passkeyMessage:
          "Passkeys require an HTTPS app URL (or localhost) on native. Set EXPO_PUBLIC_APP_URL to an https:// tunnel or hosted frontend.",
      };
    }

    return {
      supportsPassword: true,
      supportsGitHubOAuth: true,
      supportsPasskeys: true,
      passkeyMode: "browser-bridge",
      passkeyMessage: "Passkeys open in your browser on native.",
    };
  }

  return {
    supportsPassword: true,
    supportsGitHubOAuth: true,
    supportsPasskeys: false,
    passkeyMode: "unsupported",
    passkeyMessage: "Passkeys are unavailable in the current runtime.",
  };
}
