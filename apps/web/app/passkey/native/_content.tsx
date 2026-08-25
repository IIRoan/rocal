"use client";

import {
  Suspense,
  use,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { Key } from "lucide-react";
import { createLogger } from "@workspace/logger";
import { Logo, ThemeToggle } from "@workspace/ui/components/layout";
import { Button } from "@workspace/ui/components/ui/button";
import {
  runNativePasskeyBridgeAction,
  type NativePasskeyBridgeActionInput,
  type NativePasskeyBridgeActionResult,
} from "@/lib/native-passkey-bridge-action";
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
const passkeyChallengeCache = new Map<
  string,
  Promise<NativePasskeyBridgeActionResult>
>();

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

function WaitingRow({ label }: { label: string }) {
  return (
    <div
      className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground"
      aria-live="polite"
      aria-busy
    >
      <ButtonSpinner />
      <span>{label}</span>
    </div>
  );
}

function getPasskeyChallenge(
  input: NativePasskeyBridgeActionInput & { retryKey: number },
) {
  const cacheKey = [
    input.mode,
    input.callbackURL,
    input.bridgeToken ?? "",
    input.passkeyName,
    String(input.retryKey),
  ].join("\0");
  const cached = passkeyChallengeCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const pending = (async () => {
    emitLog("info", "Starting passkey bridge action", {
      mode: input.mode,
      callbackUrl: summarizeUrl(input.callbackURL),
      hasBridgeToken: Boolean(input.bridgeToken),
      passkeyName: input.passkeyName,
    });

    const result = await runNativePasskeyBridgeAction(input);
    applyPasskeyBridgeRedirect(result, input.callbackURL);

    if (result.status === "cancelled") {
      emitLog("info", "Passkey bridge action cancelled", {
        mode: input.mode,
        message: result.message,
        callbackUrl: summarizeUrl(input.callbackURL),
      });
    } else if (result.status === "error") {
      emitLog("error", "Passkey bridge action failed", {
        mode: input.mode,
        message: result.message,
        callbackUrl: summarizeUrl(input.callbackURL),
      });
    }

    return result;
  })();
  passkeyChallengeCache.set(cacheKey, pending);
  return pending;
}

function applyPasskeyBridgeRedirect(
  result: NativePasskeyBridgeActionResult,
  callbackURL: string,
) {
  if (result.status !== "redirect") {
    return;
  }

  emitLog("info", "Redirecting back to native app", {
    callbackUrl: summarizeUrl(callbackURL),
    optionKeys: ["url"],
  });
  window.location.replace(result.url);
}

function SignInPasskeyAttempt({
  callbackURL,
  bridgeToken,
  passkeyName,
  copy,
  retryKey,
  onRetry,
}: {
  callbackURL: string;
  bridgeToken: string | null;
  passkeyName: string;
  copy: ReturnType<typeof getNativePasskeyBridgeCopy>;
  retryKey: number;
  onRetry: () => void;
}) {
  const result = use(
    getPasskeyChallenge({
      mode: "sign-in",
      callbackURL,
      bridgeToken,
      passkeyName,
      cancelMessage: copy.cancelMessage,
      failureMessage: copy.failureMessage,
      retryKey,
    }),
  );

  if (result.status === "redirect") {
    return <WaitingRow label={copy.workingLabel} />;
  }

  if (result.status === "cancelled") {
    return (
      <>
        <div className="mb-5 rounded-lg border border-secondary/20 bg-secondary/10 p-3">
          <p className="text-sm text-foreground">{result.message}</p>
        </div>
        <Button
          type="button"
          onClick={onRetry}
          className="h-11 w-full rounded-lg font-medium"
        >
          <Key className="size-4" />
          <span>{copy.actionLabel}</span>
        </Button>
      </>
    );
  }

  return (
    <>
      <div
        className="mb-5 rounded-lg border border-destructive/20 bg-destructive/10 p-3"
        role="alert"
      >
        <p className="text-sm text-destructive">{result.message}</p>
      </div>
      <Button
        type="button"
        onClick={onRetry}
        className="h-11 w-full rounded-lg font-medium"
      >
        <Key className="size-4" />
        <span>{copy.actionLabel}</span>
      </Button>
    </>
  );
}

function SignInPasskeyPanel({
  callbackURL,
  bridgeToken,
  passkeyName,
  copy,
}: {
  callbackURL: string;
  bridgeToken: string | null;
  passkeyName: string;
  copy: ReturnType<typeof getNativePasskeyBridgeCopy>;
}) {
  const [retryKey, setRetryKey] = useState(0);

  return (
    <Suspense fallback={<WaitingRow label={copy.workingLabel} />}>
      <SignInPasskeyAttempt
        callbackURL={callbackURL}
        bridgeToken={bridgeToken}
        passkeyName={passkeyName}
        copy={copy}
        retryKey={retryKey}
        onRetry={() => setRetryKey((current) => current + 1)}
      />
    </Suspense>
  );
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
  const canStart =
    Boolean(callbackURL) &&
    isValidCallback &&
    (mode === "register" || Boolean(bridgeToken));
  const autoStartSignIn =
    isMounted && mode === "sign-in" && canStart && callbackURL;

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

    setIsWorking(true);
    setError(null);
    setNotice(null);
    void runNativePasskeyBridgeAction({
      mode,
      callbackURL,
      bridgeToken,
      passkeyName,
      cancelMessage: copy.cancelMessage,
      failureMessage: copy.failureMessage,
    }).then((result) => {
      applyPasskeyBridgeRedirect(result, callbackURL);

      if (result.status === "redirect") {
        return;
      }

      setIsWorking(false);

      if (result.status === "cancelled") {
        emitLog("info", "Passkey bridge action cancelled", {
          mode,
          message: result.message,
          callbackUrl: summarizeUrl(callbackURL),
        });
        setNotice(result.message);
        return;
      }

      emitLog("error", "Passkey bridge action failed", {
        mode,
        message: result.message,
        callbackUrl: summarizeUrl(callbackURL),
      });
      setError(result.message);
    });
  }

  const showWaiting =
    isWorking || (mode === "sign-in" && !isMounted && !notice && !error);

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

          {mode === "register" && isMounted && isValidCallback ? (
            <div className="mb-6 rounded-lg border border-border/50 bg-muted/30 p-3">
              <p className="text-sm text-muted-foreground">
                This passkey will be saved as “{passkeyName}”.
              </p>
            </div>
          ) : null}

          {autoStartSignIn ? (
            <SignInPasskeyPanel
              callbackURL={callbackURL}
              bridgeToken={bridgeToken}
              passkeyName={passkeyName}
              copy={copy}
            />
          ) : showWaiting ? (
            <WaitingRow label={copy.workingLabel} />
          ) : (
            <Button
              type="button"
              disabled={!isMounted || !canStart}
              onClick={handleContinue}
              className="h-11 w-full rounded-lg font-medium"
            >
              <Key className="size-4" />
              <span>{copy.actionLabel}</span>
            </Button>
          )}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            <button
              type="button"
              onClick={handleCancel}
              className="font-medium text-primary transition-colors hover:text-primary/80"
            >
              Cancel and return to the app
            </button>
          </p>
        </div>
      </div>
    </section>
  );
}
