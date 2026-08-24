export type NativePasskeyBridgeMode = "sign-in" | "register";

export const PASSKEY_BRIDGE_FRESHEN_PATH = "/passkey-bridge/freshen-session";

export function getPasskeyBridgeFreshenRequest(
  mode: NativePasskeyBridgeMode,
): { path: string; method: "POST" } | undefined {
  if (mode !== "register") {
    return undefined;
  }

  return {
    path: PASSKEY_BRIDGE_FRESHEN_PATH,
    method: "POST",
  };
}

export type NativePasskeyBridgeParams = {
  mode: NativePasskeyBridgeMode;
  callbackURL: string | null;
  bridgeToken: string | null;
  passkeyName: string;
};

export const DEFAULT_NATIVE_PASSKEY_BRIDGE_PARAMS: NativePasskeyBridgeParams = {
  mode: "sign-in",
  callbackURL: null,
  bridgeToken: null,
  passkeyName: "This device",
};

export const NATIVE_PASSKEY_BRIDGE_PENDING_COPY = {
  title: "Passkey",
  description: "Preparing passkey handoff…",
  actionLabel: "Continue",
  cancelMessage: "",
  failureMessage: "",
} as const;

export function getNativePasskeyBridgeMode(
  value: string | null,
): NativePasskeyBridgeMode {
  return value === "register" ? "register" : "sign-in";
}

export function readNativePasskeyBridgeParams(search: {
  get(name: string): string | null;
}): NativePasskeyBridgeParams {
  return {
    mode: getNativePasskeyBridgeMode(search.get("mode")),
    callbackURL: search.get("callbackURL"),
    bridgeToken: search.get("bridgeToken"),
    passkeyName: search.get("passkeyName")?.trim() || "This device",
  };
}

export function getWebAuthnSupportError(env: {
  isSecureContext: boolean;
  origin: string;
  PublicKeyCredential: unknown;
}): string | null {
  if (!env.isSecureContext) {
    return `Passkeys require HTTPS or localhost in Safari. The current page origin is ${env.origin}.`;
  }

  if (typeof env.PublicKeyCredential !== "function") {
    return "Passkeys are unavailable in this browser.";
  }

  return null;
}

export function getNativePasskeyBridgeCopy(mode: NativePasskeyBridgeMode): {
  title: string;
  description: string;
  actionLabel: string;
  cancelMessage: string;
  failureMessage: string;
} {
  if (mode === "register") {
    return {
      title: "Add a passkey",
      description:
        "Use your browser's passkey support, then Solace will return you to the app.",
      actionLabel: "Add passkey",
      cancelMessage: "Passkey setup was cancelled.",
      failureMessage: "Unable to finish passkey setup.",
    };
  }

  return {
    title: "Continue with a passkey",
    description:
      "Sign in with your passkey in the browser, then Solace will return you to the app.",
    actionLabel: "Continue",
    cancelMessage: "Passkey sign-in was cancelled.",
    failureMessage: "Passkey sign-in failed. Please try again.",
  };
}

const DISALLOWED_CALLBACK_PROTOCOLS = new Set([
  "about:",
  "blob:",
  "data:",
  "file:",
  "http:",
  "https:",
  "javascript:",
]);

export function isValidNativePasskeyCallbackURL(
  value: string | null,
): value is string {
  if (!value) {
    return false;
  }

  try {
    const { protocol } = new URL(value);
    return !DISALLOWED_CALLBACK_PROTOCOLS.has(protocol);
  } catch {
    return false;
  }
}

export function buildNativePasskeyCallbackURL(
  callbackURL: string,
  options: {
    oneTimeToken?: string;
    passkeyRegistered?: boolean;
    error?: string;
  },
): string {
  const url = new URL(callbackURL);

  if (options.oneTimeToken) {
    url.searchParams.set("oneTimeToken", options.oneTimeToken);
  }

  if (options.passkeyRegistered) {
    url.searchParams.set("passkeyRegistered", "1");
  }

  if (options.error) {
    url.searchParams.set("error", options.error);
  }

  return url.toString();
}

export function getNativePasskeyBridgeError(
  error: unknown,
  fallbackMessage: string,
): string {
  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message;
  }

  return fallbackMessage;
}
