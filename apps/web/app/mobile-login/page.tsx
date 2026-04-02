"use client";

import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { useState, useEffect, useCallback, Suspense } from "react";
import { signIn, authClient, useSession } from "@/lib/auth-client";
import {
  getMobileAuthBridgeUrl,
  getApiBaseUrl,
} from "@/lib/api-url";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Github, Key, Smartphone, Fingerprint } from "lucide-react";
import { Logo } from "@workspace/ui/components/layout";
import { Button } from "@workspace/ui/components/ui/button";

function MobileLoginForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPasskeySupported, setIsPasskeySupported] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [hasPasskeysRegistered, setHasPasskeysRegistered] = useState<boolean | null>(null);
  const [isFromOAuthCallback, setIsFromOAuthCallback] = useState(false);
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next");
  const errorParam = searchParams.get("error");

  const getRedirectTarget = useCallback(() => {
    const fallback = "/dashboard";
    if (!nextPath) return fallback;
    if (!nextPath.startsWith("/")) return fallback;
    return nextPath;
  }, [nextPath]);

  const handleSessionRedirect = useCallback(() => {
    if (session?.user) {
      router.replace(getRedirectTarget());
    }
  }, [session, router, getRedirectTarget]);

  // Detect if we're coming back from OAuth callback
  useEffect(() => {
    const fromOAuth = typeof window !== "undefined" && 
      sessionStorage.getItem("github_auth_started") === "true";
    
    if (fromOAuth) {
      setIsFromOAuthCallback(true);
      sessionStorage.removeItem("github_auth_started");
    }
  }, []);

  useEffect(() => {
    if (errorParam) {
      const errorMessages: Record<string, string> = {
        oauth_error: "Authentication failed. Please try again.",
        mobile_session_missing: "Session not found. Please log in again.",
        mobile_handoff_init_failed: "Failed to transfer login to app. Please try again.",
        mobile_handoff_verify_failed: "Could not verify login. Please try again.",
      };
      setError(errorMessages[errorParam] || "An error occurred during login.");
    }
  }, [errorParam]);

  useEffect(() => {
    if (!isPending) {
      setIsCheckingSession(false);
      
      // If coming from OAuth callback and have a session, go through mobile-complete for token generation
      if (isFromOAuthCallback && session?.user) {
        router.replace(`/auth/mobile-complete?next=${encodeURIComponent(getRedirectTarget())}`);
      } else if (session?.user) {
        // Regular authenticated redirect
        handleSessionRedirect();
      }
    }
  }, [isPending, session, isFromOAuthCallback, getRedirectTarget, router, handleSessionRedirect]);

  useEffect(() => {
    // Simple check: if PublicKeyCredential exists, assume passkeys work
    // WebView/Capacitor on modern iOS/Android always supports WebAuthn
    const hasWebAuthn = typeof window !== "undefined" && "PublicKeyCredential" in window;
    setIsPasskeySupported(hasWebAuthn);
  }, []);

  useEffect(() => {
    const checkPasskeys = async () => {
      try {
        const result = await authClient.passkey.listUserPasskeys();
        const passkeys = result?.data || [];
        setHasPasskeysRegistered(passkeys.length > 0);
      } catch {
        setHasPasskeysRegistered(false);
      }
    };
    checkPasskeys();
  }, []);

  const handlePasskeyLogin = async () => {
    try {
      setPasskeyLoading(true);
      setError(null);

      const result = await authClient.signIn.passkey({
        autoFocus: true,
      });

      if (result?.data?.user || result?.user) {
        setTimeout(() => {
          router.replace(getRedirectTarget());
        }, 100);
      } else {
        setTimeout(() => {
          router.refresh();
        }, 500);
      }
    } catch (error: any) {
      console.error("Passkey login failed:", error);
      setError(
        error.message || "Passkey authentication failed. Please try again.",
      );
      setPasskeyLoading(false);
    }
  };

  const handleGitHubLogin = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Redirect to /auth/mobile-complete to handle the OAuth flow
      // This ensures we capture the OAuth callback properly
      const nextPath = getRedirectTarget();
      const mobileCompleteUrl = `/auth/mobile-complete?next=${encodeURIComponent(nextPath)}`;
      
      // Use sessionStorage to indicate we're starting GitHub auth
      if (typeof window !== "undefined") {
        sessionStorage.setItem("github_auth_started", "true");
      }

      const result = await signIn.social({
        provider: "github",
        callbackURL: getMobileAuthBridgeUrl(nextPath),
        errorCallbackURL: getMobileAuthBridgeUrl(nextPath, "oauth_error"),
        disableRedirect: true,
      });

      const authUrl = result?.data?.url || result?.url;
      if (!authUrl) {
        throw new Error("Failed to get OAuth URL");
      }

      // Navigate to GitHub OAuth
      if (Capacitor.isNativePlatform()) {
        await Browser.open({ url: authUrl });
      } else {
        window.location.assign(authUrl);
      }
    } catch (error: any) {
      console.error("Login failed:", error);
      setIsLoading(false);
      const detail = error?.message || error?.toString?.() || "Unknown error";
      setError(`GitHub login could not be started: ${detail}`);
    }
  };

  const handleRegisterPasskey = async () => {
    try {
      setPasskeyLoading(true);
      setError(null);

      const result = await authClient.passkey.register({
        name: `Mobile Device - ${new Date().toLocaleDateString()}`,
      });

      if (result?.data) {
        setHasPasskeysRegistered(true);
        setError(null);
      } else {
        throw new Error("Failed to register passkey");
      }
    } catch (error: any) {
      console.error("Passkey registration failed:", error);
      setError(error.message || "Failed to set up passkey. Please try again.");
    } finally {
      setPasskeyLoading(false);
    }
  };

  if (isPending || isCheckingSession) {
    const isProcessingOAuth = isFromOAuthCallback && !session?.user;
    const statusText = isProcessingOAuth
      ? "Completing your login…"
      : session?.user
        ? "Preparing your account…"
        : "Checking your session…";

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
            <span>{statusText}</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-[100dvh] safe-area-inset-top safe-area-inset-bottom flex items-center justify-center px-4 py-6 sm:py-8 bg-background">
      <div className="w-full max-w-sm">
        <div className="bg-card border border-border rounded-xl shadow-sm p-5 sm:p-6">
          <div className="flex flex-col items-center text-center gap-3 mb-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Smartphone className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">Mobile Sign In</h1>
            <p className="text-sm text-muted-foreground">
              Quick and secure access to Solace
            </p>
          </div>

          {error && (
            <div
              className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/20"
              role="alert"
            >
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="space-y-3">
            {isPasskeySupported && hasPasskeysRegistered && (
              <Button
                onClick={handlePasskeyLogin}
                disabled={passkeyLoading}
                className="w-full h-12 text-base"
                aria-busy={passkeyLoading}
              >
                {passkeyLoading ? (
                  <>
                    <div
                      className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
                      aria-hidden="true"
                    />
                    <span>Authenticating…</span>
                  </>
                ) : (
                  <>
                    <Fingerprint className="h-5 w-5 mr-2" />
                    <span>Sign in with Passkey</span>
                  </>
                )}
              </Button>
            )}

            {isPasskeySupported && hasPasskeysRegistered === false && (
              <Button
                onClick={handleRegisterPasskey}
                disabled={passkeyLoading}
                className="w-full h-12 text-base"
                aria-busy={passkeyLoading}
              >
                {passkeyLoading ? (
                  <>
                    <div
                      className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
                      aria-hidden="true"
                    />
                    <span>Setting up…</span>
                  </>
                ) : (
                  <>
                    <Fingerprint className="h-5 w-5 mr-2" />
                    <span>Set Up Passkey</span>
                  </>
                )}
              </Button>
            )}

            {isPasskeySupported && hasPasskeysRegistered !== null && (
              <div className="flex items-center gap-2 my-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}

            <Button
              onClick={handleGitHubLogin}
              disabled={isLoading}
              variant="outline"
              className="w-full h-11"
              aria-busy={isLoading}
            >
              {isLoading ? (
                <>
                  <div
                    className="h-4 w-4 animate-spin rounded-full border-2 border-current opacity-30 border-t-current"
                    style={{ borderTopColor: "currentColor", opacity: 1 }}
                    aria-hidden="true"
                  />
                  <span>Connecting…</span>
                </>
              ) : (
                <>
                  <Github className="h-4 w-4 mr-2" />
                  <span>Continue with GitHub</span>
                </>
              )}
            </Button>

            {!isPasskeySupported && (
              <div className="mt-4 p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-xs text-muted-foreground">
                  Your device doesn&apos;t support passkeys. Use GitHub to sign in.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function MobileLoginLoading() {
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
          <span>Loading…</span>
        </div>
      </div>
    </section>
  );
}

export default function MobileLoginPage() {
  return (
    <Suspense fallback={<MobileLoginLoading />}>
      <MobileLoginForm />
    </Suspense>
  );
}
