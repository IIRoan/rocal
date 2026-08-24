"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createLogger } from "@workspace/logger";
import { runNativePasskeyBridgeAction } from "@/lib/native-passkey-bridge-action";
import {
  DEFAULT_NATIVE_PASSKEY_BRIDGE_PARAMS,
  NATIVE_PASSKEY_BRIDGE_PENDING_COPY,
  buildNativePasskeyCallbackURL,
  getNativePasskeyBridgeCopy,
  isValidNativePasskeyCallbackURL,
  readNativePasskeyBridgeParams,
} from "@/lib/native-passkey-bridge";

const PRIMARY_BUTTON =
  "inline-flex h-11 w-full items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-md transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex h-11 w-full items-center justify-center rounded-full border border-border bg-background px-5 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50";
const log = createLogger("web:passkey-bridge");
const subscribeNever = () => () => {};
const getClientMounted = () => true;
const getServerMounted = () => false;

function subscribeWindowSearch(onStoreChange: () => void) {
  window.addEventListener("popstate", onStoreChange);
  return () => {
    window.removeEventListener("popstate", onStoreChange);
  };
}

function getWindowSearch() {
  return window.location.search;
}

function getServerSearch() {
  return "";
}

function summarizeUrl(url?: string | null) {
  if (!url) {
    return null;
  }

  const queryIndex = url.indexOf("?");
  const baseUrl = queryIndex === -1 ? url : url.slice(0, queryIndex);

  try {
    const parsed = new URL(url);
    const keys = Array.from(parsed.searchParams.keys());
    return keys.length === 0 ? baseUrl : `${baseUrl}?${keys.join(",")}`;
  } catch {
    return baseUrl;
  }
}

function emitLog(
  level: "debug" | "info" | "warn" | "error",
  event: string,
  data?: unknown,
) {
  log[level](event, data);
}

async function continuePasskeyBridge(options: {
  mode: "sign-in" | "register";
  callbackURL: string;
  bridgeToken: string | null;
  passkeyName: string;
  failureMessage: string;
  onError: (message: string | null) => void;
  onWorking: (working: boolean) => void;
}) {
  options.onWorking(true);
  options.onError(null);
  emitLog("info", "Starting passkey bridge action", {
    mode: options.mode,
    callbackUrl: summarizeUrl(options.callbackURL),
    hasBridgeToken: Boolean(options.bridgeToken),
    passkeyName: options.passkeyName,
  });

  const result = await runNativePasskeyBridgeAction({
    mode: options.mode,
    callbackURL: options.callbackURL,
    bridgeToken: options.bridgeToken,
    passkeyName: options.passkeyName,
    failureMessage: options.failureMessage,
  });

  if (result.status === "redirect") {
    emitLog("info", "Redirecting back to native app", {
      callbackUrl: summarizeUrl(options.callbackURL),
      optionKeys: ["url"],
    });
    window.location.replace(result.url);
    return;
  }

  options.onError(result.message);
  emitLog("error", "Passkey bridge action failed", {
    mode: options.mode,
    message: result.message,
    callbackUrl: summarizeUrl(options.callbackURL),
  });
  options.onWorking(false);
}

export function NativePasskeyBridgeContent() {
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useSyncExternalStore(
    subscribeNever,
    getClientMounted,
    getServerMounted,
  );
  const search = useSyncExternalStore(
    subscribeWindowSearch,
    getWindowSearch,
    getServerSearch,
  );
  const bridgeParams = isMounted
    ? readNativePasskeyBridgeParams(new URLSearchParams(search))
    : DEFAULT_NATIVE_PASSKEY_BRIDGE_PARAMS;
  const { mode, callbackURL, bridgeToken, passkeyName } = bridgeParams;
  const copy = isMounted
    ? getNativePasskeyBridgeCopy(mode)
    : NATIVE_PASSKEY_BRIDGE_PENDING_COPY;
  const isValidCallback = isValidNativePasskeyCallbackURL(callbackURL);

  useEffect(() => {
    if (!isMounted) {
      return;
    }

    emitLog("info", "Mounted passkey bridge page", {
      mode,
      callbackUrl: summarizeUrl(callbackURL),
      hasBridgeToken: Boolean(bridgeToken),
      passkeyName,
    });
  }, [bridgeToken, callbackURL, isMounted, mode, passkeyName]);

  function redirectToApp(options: {
    oneTimeToken?: string;
    passkeyRegistered?: boolean;
    error?: string;
  }) {
    if (!callbackURL || !isValidCallback) {
      emitLog("warn", "Refusing bridge redirect due to invalid callback", {
        callbackUrl: summarizeUrl(callbackURL),
      });
      return false;
    }

    emitLog("info", "Redirecting back to native app", {
      callbackUrl: summarizeUrl(callbackURL),
      optionKeys: Object.keys(options),
    });
    window.location.replace(
      buildNativePasskeyCallbackURL(callbackURL, options),
    );
    return true;
  }

  function handleCancel() {
    emitLog("info", "User cancelled passkey bridge", {
      mode,
      callbackUrl: summarizeUrl(callbackURL),
    });

    if (redirectToApp({ error: copy.cancelMessage })) {
      return;
    }

    setError(copy.cancelMessage);

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.close();
  }

  function handleContinue() {
    if (!callbackURL || !isValidCallback) {
      emitLog("warn", "Continue blocked by invalid callback URL", {
        callbackUrl: summarizeUrl(callbackURL),
      });
      setError("This passkey request is missing a valid app callback URL.");
      return;
    }

    void continuePasskeyBridge({
      mode,
      callbackURL,
      bridgeToken,
      passkeyName,
      failureMessage: copy.failureMessage,
      onError: setError,
      onWorking: setIsWorking,
    });
  }

  return (
    <main className="min-h-[100dvh] bg-background px-4 py-10 text-foreground">
      <div className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-md items-center justify-center">
        <div className="w-full rounded-3xl border border-border/70 bg-card/95 p-8 shadow-sm">
          <div className="space-y-3 text-center">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Solace
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              {copy.description}
            </p>
          </div>

          {!isMounted && (
            <div className="mt-6 rounded-2xl border border-border/70 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              Preparing passkey handoff…
            </div>
          )}

          {isMounted && !isValidCallback && (
            <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              This passkey request is missing a valid app callback URL.
            </div>
          )}

          {error && (
            <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="mt-8 space-y-3">
            <button
              className={PRIMARY_BUTTON}
              disabled={isWorking || !isMounted}
              onClick={handleContinue}
              type="button"
            >
              {isWorking ? "Working..." : copy.actionLabel}
            </button>
            <button
              className={SECONDARY_BUTTON}
              disabled={isWorking}
              onClick={handleCancel}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
