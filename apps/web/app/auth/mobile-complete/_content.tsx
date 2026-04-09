"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getApiBaseUrl, getMobileAuthCallbackUrl } from "@/lib/api-url";
import { authClient } from "@/lib/auth-client";
import { Logo } from "@workspace/ui/components/layout";
import { Button } from "@workspace/ui/components/ui";

const getSafeNextPath = (nextPath: string | null) => {
  if (!nextPath || !nextPath.startsWith("/")) {
    return "/dashboard";
  }
  return nextPath;
};

type AuthStep = "checking_session" | "generating_token" | "success" | "error";

const getStatusMessage = (step: AuthStep, elapsedSeconds: number): string => {
  if (step === "checking_session") {
    if (elapsedSeconds > 7) return "Still checking your login...";
    if (elapsedSeconds > 3) return "This is taking longer than expected...";
    return "Verifying your login...";
  }

  if (step === "generating_token") {
    if (elapsedSeconds > 7) return "Still setting up your session...";
    if (elapsedSeconds > 3) return "This is taking longer than expected...";
    return "Setting up your session...";
  }

  return "Completing login...";
};

export function MobileAuthCompleteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = getSafeNextPath(searchParams.get("next"));
  const errorCode = searchParams.get("error") || undefined;
  const oauthCode = searchParams.get("code") || undefined;
  const oauthState = searchParams.get("state") || undefined;

  const [currentStep, setCurrentStep] = useState<AuthStep>("checking_session");
  const [statusMessage, setStatusMessage] = useState("Verifying your login...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [appRedirectUrl, setAppRedirectUrl] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

  const elapsedSecondsRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fallbackAppRedirectUrl = useMemo(() => {
    return getMobileAuthCallbackUrl(nextPath, errorCode);
  }, [errorCode, nextPath]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      elapsedSecondsRef.current += 1;
      setStatusMessage(getStatusMessage(currentStep, elapsedSecondsRef.current));
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [currentStep]);

  const completeAuthFlow = useCallback(
    async (abort?: AbortSignal) => {
      if (errorCode) {
        setCurrentStep("error");
        setErrorMessage(
          errorCode === "oauth_error"
            ? "GitHub authentication failed. Please try again."
            : "An error occurred during login.",
        );
        return;
      }

      console.log("[mobile-auth-bridge] Starting auth flow");
      elapsedSecondsRef.current = 0;

      try {
        setCurrentStep("checking_session");
        setStatusMessage("Verifying your login...");

        const sessionResult = await Promise.race([
          authClient.getSession(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Session check timeout")), 10000),
          ),
        ]);

        const hasUser = !!sessionResult?.data?.user;

        console.log("[mobile-auth-bridge] Session check", {
          hasUser,
          userId: sessionResult?.data?.user?.id,
        });

        if (!hasUser) {
          console.warn("[mobile-auth-bridge] No user in session, continuing anyway");
        }

        setCurrentStep("generating_token");
        setStatusMessage("Setting up your session...");
        elapsedSecondsRef.current = 0;

        const response = await fetch(
          `${getApiBaseUrl()}/api/auth/one-time-token/generate`,
          {
            method: "GET",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
            signal: abort,
          },
        );

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            console.error("[mobile-auth-bridge] No valid session for token generation");
            setCurrentStep("error");
            setErrorMessage(
              "Your session has expired. Please return to the app and try again.",
            );
            return;
          }
          throw new Error(`Token generation failed: ${response.status}`);
        }

        const data = (await response.json()) as { token?: string };

        if (!data?.token) {
          throw new Error("No token in response");
        }

        console.log("[mobile-auth-bridge] OTT generated, preparing redirect");

        const redirectUrl = getMobileAuthCallbackUrl(nextPath, undefined, data.token);
        setAppRedirectUrl(redirectUrl);
        setCurrentStep("success");
        setStatusMessage("Success! Opening app...");

        window.setTimeout(() => {
          window.location.replace(redirectUrl);
        }, 800);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          console.log("[mobile-auth-bridge] Request was cancelled");
          return;
        }

        console.error("[mobile-auth-bridge] Auth flow failed:", error);
        setCurrentStep("error");

        const errorMsg = error instanceof Error ? error.message : "Unknown error";

        if (errorMsg === "Session check timeout") {
          setErrorMessage(
            "Connection timed out while checking your session. Please try again.",
          );
        } else if (errorMsg.includes("Token generation failed")) {
          setErrorMessage(
            "Failed to generate your session token. Please try again.",
          );
        } else {
          setErrorMessage("Could not complete login. Please try again.");
        }
      }
    },
    [errorCode, nextPath],
  );

  const handleRetry = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setIsRetrying(true);
    setRetryCount((prev) => prev + 1);
    setErrorMessage(null);

    abortControllerRef.current = new AbortController();
    await completeAuthFlow(abortControllerRef.current.signal);
    setIsRetrying(false);
  }, [completeAuthFlow]);

  useEffect(() => {
    abortControllerRef.current = new AbortController();
    void completeAuthFlow(abortControllerRef.current.signal);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [completeAuthFlow]);

  if (currentStep === "success") {
    return (
      <section className="min-h-[100dvh] safe-area-inset-top safe-area-inset-bottom flex items-center justify-center px-4 py-6 sm:py-8 bg-background">
        <div className="flex flex-col items-center gap-4 text-center">
          <Logo
            width={56}
            height={56}
            className="text-primary"
            aria-label="Solace"
          />
          <div className="flex flex-col items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">Opening App</h1>
            <p className="text-sm text-muted-foreground">{statusMessage}</p>
          </div>
          {appRedirectUrl && (
            <a
              href={appRedirectUrl}
              className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Open Solace
            </a>
          )}
        </div>
      </section>
    );
  }

  if (currentStep === "error") {
    return (
      <section className="min-h-[100dvh] safe-area-inset-top safe-area-inset-bottom flex flex-col items-center justify-center px-4 py-6 sm:py-8 bg-background">
        {errorCode && (
          <div className="bg-destructive text-destructive-foreground p-4 rounded-md mb-4 w-full max-w-sm text-center">
            <p className="font-bold">Authentication Error</p>
            <p className="text-sm">An error occurred during the login process. The specific error code is provided below for debugging.</p>
            <p className="mt-2 text-xs font-mono bg-destructive-foreground/10 py-1 px-2 rounded-sm">
              Error Code: {errorCode}
            </p>
          </div>
        )}
        <Logo
          width={56}
          height={56}
          className="text-primary mb-6"
          aria-label="Solace"
        />
        <div className="w-full max-w-sm">
          <div className="bg-card border border-border rounded-xl shadow-sm p-6 text-center">
            <div className="mb-4 mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <svg
                className="h-6 w-6 text-destructive"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-foreground mb-2">Login Failed</h1>
            <p className="text-sm text-muted-foreground mb-6">{errorMessage}</p>
            <div className="flex gap-3">
              <button
                onClick={handleRetry}
                disabled={isRetrying}
                className="flex-1 h-10 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
              >
                {isRetrying ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-transparent" />
                    <span>Retrying...</span>
                  </>
                ) : (
                  <span>Try Again</span>
                )}
              </button>
              <a
                href={fallbackAppRedirectUrl}
                className="flex-1 h-10 rounded-md border border-border bg-card text-foreground font-medium text-sm hover:bg-muted flex items-center justify-center transition-colors"
              >
                Return to App
              </a>
            </div>
            {retryCount > 0 && (
              <p className="text-xs text-muted-foreground mt-4">
                If the problem persists, please return to the app.
              </p>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-[100dvh] safe-area-inset-top safe-area-inset-bottom flex items-center justify-center px-4 py-6 sm:py-8 bg-background">
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo
          width={56}
          height={56}
          className="text-primary"
          aria-label="Solace"
        />
        <div
          className="flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <div
            className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground"
            aria-hidden="true"
          />
          <span className="transition-all duration-300">{statusMessage}</span>
        </div>

        {appRedirectUrl && (
          <Button
            asChild
            className="mt-4 px-8 h-12 w-full max-w-xs font-semibold text-base transition-all"
            size="lg"
          >
            <a href={appRedirectUrl}>Open Solace</a>
          </Button>
        )}
      </div>
    </section>
  );
}

export function MobileAuthLoading() {
  return (
    <section className="min-h-[100dvh] safe-area-inset-top safe-area-inset-bottom flex items-center justify-center px-4 py-6 sm:py-8 bg-background">
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo width={56} height={56} className="text-primary" aria-label="Solace" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" aria-hidden="true" />
          <span>Loading...</span>
        </div>
      </div>
    </section>
  );
}
