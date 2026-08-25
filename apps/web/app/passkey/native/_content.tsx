"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Key } from "lucide-react";
import { createLogger } from "@workspace/logger";
import { Logo, ThemeToggle } from "@workspace/ui/components/layout";
import { Button } from "@workspace/ui/components/ui/button";
import { runNativePasskeyBridgeAction } from "@/lib/native-passkey-bridge-action";
import {
  DEFAULT_NATIVE_PASSKEY_BRIDGE_PARAMS,
  NATIVE_PASSKEY_BRIDGE_PENDING_COPY,
  buildNativePasskeyCallbackURL,
  getNativePasskeyBridgeCopy,
  isValidNativePasskeyCallbackURL,
  readNativePasskeyBridgeParams,
} from "@/lib/native-passkey-bridge";

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

function ButtonSpinner() {
  return (
    <div
      className="size-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
      aria-hidden="true"
    />
  );
}

async function continuePasskeyBridge(options: {
  mode: "sign-in" | "register";
  callbackURL: string;
  bridgeToken: string | null;
  passkeyName: string;
  cancelMessage: string;
  failureMessage: string;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
  onWorking: (working: boolean) => void;
}) {
  options.onWorking(true);
  options.onError(null);
  options.onNotice(null);
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
    cancelMessage: options.cancelMessage,
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

  if (result.status === "cancelled") {
    options.onNotice(result.message);
    emitLog("info", "Passkey bridge action cancelled", {
      mode: options.mode,
      message: result.message,
      callbackUrl: summarizeUrl(options.callbackURL),
    });
    options.onWorking(false);
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
  const [notice, setNotice] = useState<string | null>(null);
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
  const helperText =
    mode === "register"
      ? `This passkey will be saved as “${passkeyName}”.`
      : "Your password is already accepted. This last step proves it's you.";

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

    setNotice(copy.cancelMessage);

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
      cancelMessage: copy.cancelMessage,
      failureMessage: copy.failureMessage,
      onError: setError,
      onNotice: setNotice,
      onWorking: setIsWorking,
    });
  }

  return (
    <section className="flex min-h-[100dvh]">
      <div className="relative flex w-full flex-col justify-center px-6 py-10 sm:px-12">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-secondary/30 via-background to-background" />

        <div className="relative z-10 mx-auto w-full max-w-md">
          <div className="mb-10 flex items-center justify-between">
            <Logo
              width={44}
              height={44}
              className="text-primary"
              aria-label="Solace"
            />
            <ThemeToggle />
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-balance text-foreground">
              {copy.title}
            </h1>
            <p className="mt-2 text-sm text-pretty text-muted-foreground">
              {copy.description}
            </p>
          </div>

          {notice ? (
            <div className="mb-5 rounded-lg border border-secondary/20 bg-secondary/10 p-3">
              <p className="text-sm text-foreground">{notice}</p>
            </div>
          ) : null}

          {error ? (
            <div
              className="mb-5 rounded-lg border border-destructive/20 bg-destructive/10 p-3"
              role="alert"
            >
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : null}

          {isMounted && !isValidCallback ? (
            <div
              className="mb-5 rounded-lg border border-destructive/20 bg-destructive/10 p-3"
              role="alert"
            >
              <p className="text-sm text-destructive">
                This passkey request is missing a valid app callback URL.
              </p>
            </div>
          ) : null}

          {isMounted && isValidCallback ? (
            <div className="mb-6 rounded-lg border border-border/50 bg-muted/30 p-3">
              <p className="text-sm text-muted-foreground">{helperText}</p>
            </div>
          ) : null}

          <Button
            type="button"
            disabled={isWorking || !isMounted}
            onClick={handleContinue}
            className="h-11 w-full rounded-lg font-medium"
            aria-busy={isWorking}
          >
            {isWorking ? (
              <>
                <ButtonSpinner />
                <span>{copy.workingLabel}</span>
              </>
            ) : (
              <>
                <Key className="size-4" />
                <span>{copy.actionLabel}</span>
              </>
            )}
          </Button>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            <button
              type="button"
              disabled={isWorking}
              onClick={handleCancel}
              className="font-medium text-primary transition-colors hover:text-primary/80 disabled:pointer-events-none disabled:opacity-50"
            >
              Cancel and return to the app
            </button>
          </p>
        </div>
      </div>
    </section>
  );
}
