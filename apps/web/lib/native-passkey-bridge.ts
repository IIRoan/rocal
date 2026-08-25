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
  workingLabel: "Waiting for your passkey…",
  cancelMessage: "",
  failureMessage: "",
} as const;

const PASSKEY_CANCELLED_NAMES = new Set(["AbortError", "NotAllowedError"]);
const PASSKEY_CANCELLED_MESSAGE =
  /not allowed|timed out|denied permission|user cancelled|user canceled|the operation was aborted|\babort(?:ed)?\b/i;

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
  workingLabel: string;
  cancelMessage: string;
  failureMessage: string;
} {
  if (mode === "register") {
    return {
      title: "Add a passkey",
      description:
        "Create a passkey in this browser, then you'll return to the Solace app.",
      actionLabel: "Add passkey",
      workingLabel: "Waiting for your passkey…",
      cancelMessage: "Passkey authentication was cancelled.",
      failureMessage: "Unable to finish passkey setup.",
    };
  }

  return {
    title: "Verify your passkey",
    description:
      "Confirm it's you with a passkey, then you'll return to the Solace app.",
    actionLabel: "Verify passkey",
    workingLabel: "Waiting for your passkey…",
    cancelMessage: "Passkey authentication was cancelled.",
    failureMessage: "Unable to finish passkey verification.",
  };
}

export function isPasskeyAuthCancelled(error: unknown): boolean {
  if (!error) {
    return false;
  }

  if (typeof error === "string") {
    return PASSKEY_CANCELLED_MESSAGE.test(error);
  }

  if (typeof error !== "object") {
    return false;
  }

  const record = error as {
    name?: unknown;
    message?: unknown;
    error?: unknown;
  };

  if (typeof record.name === "string" && PASSKEY_CANCELLED_NAMES.has(record.name)) {
    return true;
  }

  if (
    typeof record.message === "string" &&
    PASSKEY_CANCELLED_MESSAGE.test(record.message)
  ) {
    return true;
  }

  if (record.error && record.error !== error) {
    return isPasskeyAuthCancelled(record.error);
  }

  return false;
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
    passkeyVerified?: boolean;
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

  if (options.passkeyVerified) {
    url.searchParams.set("passkeyVerified", "1");
  }

  if (options.error) {
    url.searchParams.set("error", options.error);
  }

  return url.toString();
}

export function getNativePasskeyBridgeError(
  error: unknown,
  fallbackMessage: string,
  cancelMessage?: string,
): string {
  if (cancelMessage && isPasskeyAuthCancelled(error)) {
    return cancelMessage;
  }

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
