export type NativePasskeyBridgeMode = "sign-in" | "register";

export function getNativePasskeyBridgeMode(
  value: string | null,
): NativePasskeyBridgeMode {
  return value === "register" ? "register" : "sign-in";
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
