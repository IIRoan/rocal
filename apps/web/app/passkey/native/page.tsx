"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createLogger } from "@workspace/logger";
import {
  buildNativePasskeyCallbackURL,
  getNativePasskeyBridgeError,
  getNativePasskeyBridgeMode,
  isValidNativePasskeyCallbackURL,
} from "@/lib/native-passkey-bridge";

type BridgeMode = "sign-in" | "register";

const PRIMARY_BUTTON =
  "inline-flex h-11 w-full items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-md transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex h-11 w-full items-center justify-center rounded-full border border-border bg-background px-5 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50";
const log = createLogger("web:passkey-bridge");

function readSearchParams() {
  const search = new URLSearchParams(window.location.search);

  return {
    mode: getNativePasskeyBridgeMode(search.get("mode")),
    callbackURL: search.get("callbackURL"),
    bridgeToken: search.get("bridgeToken"),
    passkeyName: search.get("passkeyName") || "This device",
  };
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

function getWebAuthnSupportError() {
  if (typeof window === "undefined") {
    return "Passkeys are unavailable in this browser.";
  }

  if (!window.isSecureContext) {
    return `Passkeys require HTTPS or localhost in Safari. The current page origin is ${window.location.origin}.`;
  }

  if (typeof window.PublicKeyCredential !== "function") {
    return "Passkeys are unavailable in this browser.";
  }

  return null;
}

export default function NativePasskeyBridgePage() {
  const [isWorking, setIsWorking] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialParams = useMemo(
    () =>
      typeof window === "undefined"
        ? {
            mode: "sign-in" as BridgeMode,
            callbackURL: null,
            bridgeToken: null,
            passkeyName: "This device",
          }
        : readSearchParams(),
    [],
  );
  const { mode, callbackURL, bridgeToken, passkeyName } = initialParams;

  const emitLog = useCallback(
    (
      level: "debug" | "info" | "warn" | "error",
      event: string,
      data?: unknown,
    ) => {
      log[level](event, data);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setIsMounted(true);
      }
    });

    emitLog("info", "Mounted passkey bridge page", {
      mode,
      callbackUrl: summarizeUrl(callbackURL),
      hasBridgeToken: Boolean(bridgeToken),
      passkeyName,
    });
    return () => {
      cancelled = true;
    };
  }, [bridgeToken, callbackURL, emitLog, mode, passkeyName]);

  const isValidCallback = isValidNativePasskeyCallbackURL(callbackURL);

  const title =
    mode === "register" ? "Add a passkey" : "Continue with a passkey";
  const description =
    mode === "register"
      ? "Use your browser's passkey support, then Solace will return you to the app."
      : "Sign in with your passkey in the browser, then Solace will return you to the app.";
  const actionLabel = mode === "register" ? "Add passkey" : "Continue";

  const redirectToApp = useCallback(
    (options: {
      oneTimeToken?: string;
      passkeyRegistered?: boolean;
      error?: string;
    }) => {
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
    },
    [callbackURL, emitLog, isValidCallback],
  );

  const handleCancel = useCallback(() => {
    const message =
      mode === "register"
        ? "Passkey setup was cancelled."
        : "Passkey sign-in was cancelled.";

    emitLog("info", "User cancelled passkey bridge", {
      mode,
      callbackUrl: summarizeUrl(callbackURL),
    });

    if (redirectToApp({ error: message })) {
      return;
    }

    setError(message);

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.close();
  }, [callbackURL, emitLog, mode, redirectToApp]);

  const handleContinue = useCallback(async () => {
    if (!callbackURL || !isValidCallback) {
      emitLog("warn", "Continue blocked by invalid callback URL", {
        callbackUrl: summarizeUrl(callbackURL),
      });
      setError("This passkey request is missing a valid app callback URL.");
      return;
    }

    setIsWorking(true);
    setError(null);
    emitLog("info", "Starting passkey bridge action", {
      mode,
      callbackUrl: summarizeUrl(callbackURL),
      hasBridgeToken: Boolean(bridgeToken),
      passkeyName,
    });

    try {
      const webAuthnSupportError = getWebAuthnSupportError();
      if (webAuthnSupportError) {
        emitLog("error", "Browser passkey prerequisites failed", {
          isSecureContext:
            typeof window !== "undefined" ? window.isSecureContext : false,
          origin:
            typeof window !== "undefined" ? window.location.origin : undefined,
          hasPublicKeyCredential:
            typeof window !== "undefined" &&
            typeof window.PublicKeyCredential === "function",
          message: webAuthnSupportError,
        });
        throw new Error(webAuthnSupportError);
      }

      const { authClient } = await import("@/lib/auth-client");
      emitLog("debug", "Loaded auth client for passkey bridge");

      if (mode === "register") {
        if (!bridgeToken) {
          throw new Error(
            "This passkey setup request is missing a session handoff token.",
          );
        }

        const bridgeSession = await authClient.$fetch(
          "/one-time-token/verify",
          {
            method: "POST",
            body: { token: bridgeToken },
            throw: false,
          },
        );

        emitLog("debug", "Verified bridge session for passkey registration", {
          hasSession: Boolean(bridgeSession.data),
          hasError: Boolean(bridgeSession.error),
        });

        if (!bridgeSession.data) {
          throw new Error(
            bridgeSession.error?.message ?? "Unable to start passkey setup.",
          );
        }

        const registration = await authClient.passkey.addPasskey({
          name: passkeyName,
          authenticatorAttachment: "platform",
        });

        emitLog("info", "Passkey registration finished", {
          hasError: Boolean(registration.error),
        });

        if (registration.error) {
          throw new Error(
            typeof registration.error.message === "string"
              ? registration.error.message
              : "Unable to finish passkey setup.",
          );
        }

        redirectToApp({ passkeyRegistered: true });
        return;
      }

      const signInResult = await authClient.signIn.passkey({
        autoFocus: true,
      });

      emitLog("info", "Passkey sign-in returned", {
        hasError: Boolean(signInResult.error),
        hasUser: Boolean(signInResult?.data?.user || signInResult?.user),
      });

      if (signInResult.error) {
        throw new Error(
          typeof signInResult.error.message === "string"
            ? signInResult.error.message
            : "Passkey sign-in failed. Please try again.",
        );
      }

      const tokenResult = (await authClient.$fetch("/one-time-token/generate", {
        method: "GET",
        throw: false,
      })) as {
        data: { token?: string } | null;
        error: { message?: string } | null;
      };

      emitLog("debug", "Generated one-time token after passkey sign-in", {
        hasToken: Boolean(tokenResult.data?.token),
        hasError: Boolean(tokenResult.error),
      });

      if (!tokenResult.data?.token) {
        throw new Error(
          tokenResult.error?.message ?? "Unable to finish passkey sign-in.",
        );
      }

      redirectToApp({ oneTimeToken: tokenResult.data.token });
    } catch (caughtError) {
      const message = getNativePasskeyBridgeError(
        caughtError,
        mode === "register"
          ? "Unable to finish passkey setup."
          : "Passkey sign-in failed. Please try again.",
      );
      setError(message);
      emitLog("error", "Passkey bridge action failed", {
        mode,
        message,
        callbackUrl: summarizeUrl(callbackURL),
      });
    } finally {
      setIsWorking(false);
    }
  }, [
    bridgeToken,
    callbackURL,
    emitLog,
    isValidCallback,
    mode,
    passkeyName,
    redirectToApp,
  ]);

  return (
    <main className="min-h-[100dvh] bg-background px-4 py-10 text-foreground">
      <div className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-md items-center justify-center">
        <div className="w-full rounded-3xl border border-border/70 bg-card/95 p-8 shadow-sm">
          <div className="space-y-3 text-center">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Solace
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              {description}
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
              onClick={() => {
                void handleContinue();
              }}
              type="button"
            >
              {isWorking ? "Working..." : actionLabel}
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
