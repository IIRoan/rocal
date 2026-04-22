"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { signIn, signUp, authClient, useSession } from "@/lib/auth-client";
import { createLogger } from "@workspace/logger";
import { getAppBaseUrl, resolveAuthRedirectTarget } from "@/lib/api-url";
import { useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { Github, Key, Eye, EyeOff, ArrowRight } from "lucide-react";
import { useSmoothRouter } from "@/hooks/use-smooth-router";
import { Logo, ThemeToggle } from "@workspace/ui/components/layout";
import { PageLoadingOverlay } from "@workspace/ui/components/ui";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { calendarApiService } from "@/lib/calendar-api-service";

const log = createLogger("login");

export function LoginForm() {
  const [isExiting, setIsExiting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPasskeySupported, setIsPasskeySupported] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [overlayFading, setOverlayFading] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const { data: session, isPending } = useSession();
  const router = useSmoothRouter();
  const searchParams = useSearchParams();
  const { theme: currentTheme } = useTheme();
  const nextPath = searchParams.get("next");
  const callbackUrl =
    searchParams.get("callbackURL") || searchParams.get("callbackUrl");

  const getRedirectTarget = useCallback(
    () => resolveAuthRedirectTarget(nextPath, callbackUrl),
    [nextPath, callbackUrl],
  );

  const redirectAfterAuth = useCallback(() => {
    const target = getRedirectTarget();
    setIsExiting(true);
    if (target.external) {
      router.startRouteTransition({
        messageContext: "AUTH_FLOW",
        minimumVisibleMs: 120,
      });
      window.location.replace(target.href);
      return;
    }
    router.replace(target.href, undefined, {
      messageContext: "AUTH_FLOW",
      minimumVisibleMs: 120,
    });
  }, [getRedirectTarget, router]);

  const syncThemeAfterAuth = useCallback(async () => {
    if (
      currentTheme &&
      (currentTheme === "light" ||
        currentTheme === "dark" ||
        currentTheme === "system")
    ) {
      try {
        await calendarApiService.updateUserSettings({ theme: currentTheme });
      } catch {
        // Settings sync is best-effort — don't block login
      }
    }
  }, [currentTheme]);

  const handleSessionRedirect = useCallback(() => {
    if (session?.user) {
      redirectAfterAuth();
    }
  }, [session, redirectAfterAuth]);

  useEffect(() => {
    if (!isPending) {
      setIsCheckingSession(false);
      handleSessionRedirect();
    }
  }, [session, isPending, handleSessionRedirect]);

  // Fade out the loading overlay when session check is done with no session
  useEffect(() => {
    if (!isPending && !isCheckingSession && !session?.user) {
      setOverlayFading(true);
      const t = setTimeout(() => setOverlayVisible(false), 300);
      return () => clearTimeout(t);
    }
  }, [isPending, isCheckingSession, session?.user]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.PublicKeyCredential) {
      setIsPasskeySupported(true);
    }
  }, []);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setEmailLoading(true);
      setError(null);

      if (isSignUp) {
        if (!name.trim()) {
          setError("Please enter your name.");
          setEmailLoading(false);
          return;
        }
        const result = await signUp.email({
          email,
          password,
          name,
        });
        if (result?.error) {
          setError(result.error.message || "Sign up failed. Please try again.");
          setEmailLoading(false);
          return;
        }
      } else {
        const result = await signIn.email({
          email,
          password,
        });
        if (result?.error) {
          setError(result.error.message || "Invalid email or password.");
          setEmailLoading(false);
          return;
        }
      }

      await syncThemeAfterAuth();
      setTimeout(() => {
        redirectAfterAuth();
      }, 100);
    } catch (err: any) {
      log.error("Email auth failed:", err);
      setError(err.message || "Authentication failed. Please try again.");
      setEmailLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    try {
      setPasskeyLoading(true);
      setError(null);

      const result = await authClient.signIn.passkey({
        autoFocus: true,
      });

      if (result?.data?.user || result?.user) {
        await syncThemeAfterAuth();
        setTimeout(() => {
          redirectAfterAuth();
        }, 100);
      } else {
        setTimeout(() => {
          router.refresh();
        }, 500);
      }
    } catch (error: any) {
      log.error("Passkey login failed:", error);
      setError(
        error.message || "Passkey authentication failed. Please try again.",
      );
      setPasskeyLoading(false);
    }
  };

  const handleGitHubLogin = async () => {
    try {
      setIsLoading(true);
      // Store current theme so it can be synced after OAuth redirect
      if (currentTheme) {
        localStorage.setItem("pending-theme-sync", currentTheme);
      }
      const frontendUrl = getAppBaseUrl();
      const redirectTarget = getRedirectTarget();
      const callbackTarget = redirectTarget.external
        ? redirectTarget.href
        : new URL(redirectTarget.href, frontendUrl).toString();
      await signIn.social({
        provider: "github",
        callbackURL: callbackTarget,
      });
    } catch (error) {
      log.error("Login failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <section className="min-h-[100dvh] flex">
        {/* Left side - Form */}
        <div className="relative flex w-full flex-col justify-center px-6 py-10 sm:px-12 lg:w-1/2 lg:px-16 xl:px-24">
          {/* Subtle gradient background */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-secondary/30 via-background to-background" />

          <div className="relative z-10 mx-auto w-full max-w-md">
            {/* Logo + Theme toggle */}
            <div className="mb-10 flex items-center justify-between">
              <Logo
                width={44}
                height={44}
                className="text-primary"
                aria-label="Solace"
              />
              <ThemeToggle />
            </div>

            {/* Heading */}
            <div className="mb-8">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {isSignUp ? "Create an account" : "Welcome back"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {isSignUp
                  ? "Sign up and get started with Solace"
                  : "Sign in to continue to Solace"}
              </p>
            </div>

            <div>
              {/* Error message */}
              {error && (
                <div
                  className="mb-5 rounded-lg bg-destructive/10 border border-destructive/20 p-3"
                  role="alert"
                >
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              {/* Email/Password form */}
              <form onSubmit={handleEmailAuth} className="space-y-5">
                {isSignUp && (
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-medium">
                      Full name
                    </Label>
                    <Input
                      id="name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      placeholder="Enter your name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required={isSignUp}
                      disabled={emailLoading}
                      className="h-11 rounded-lg"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">
                    Email
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={emailLoading}
                    className="h-11 rounded-lg"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={
                        isSignUp ? "new-password" : "current-password"
                      }
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={emailLoading}
                      className="h-11 rounded-lg pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={emailLoading}
                  className="w-full h-11 rounded-lg font-medium mt-2"
                  aria-busy={emailLoading}
                >
                  {emailLoading ? (
                    <>
                      <div
                        className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
                        aria-hidden="true"
                      />
                      <span>
                        {isSignUp ? "Creating account…" : "Signing in…"}
                      </span>
                    </>
                  ) : (
                    <>
                      <span>{isSignUp ? "Create account" : "Sign in"}</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>

              {/* Divider */}
              <div className="flex items-center gap-3 my-6">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground font-medium">
                  or continue with
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {/* Social login buttons */}
              <div className="flex gap-3">
                <Button
                  onClick={handleGitHubLogin}
                  disabled={isLoading}
                  variant="outline"
                  className="flex-1 h-11 rounded-lg"
                  aria-busy={isLoading}
                >
                  {isLoading ? (
                    <div
                      className="h-4 w-4 animate-spin rounded-full border-2 border-current opacity-30 border-t-current"
                      style={{ borderTopColor: "currentColor", opacity: 1 }}
                      aria-hidden="true"
                    />
                  ) : (
                    <>
                      <Github className="h-4 w-4" />
                      <span>GitHub</span>
                    </>
                  )}
                </Button>

                {isPasskeySupported && (
                  <Button
                    onClick={handlePasskeyLogin}
                    disabled={passkeyLoading}
                    variant="outline"
                    className="flex-1 h-11 rounded-lg"
                    aria-busy={passkeyLoading}
                  >
                    {passkeyLoading ? (
                      <div
                        className="h-4 w-4 animate-spin rounded-full border-2 border-current opacity-30 border-t-current"
                        style={{ borderTopColor: "currentColor", opacity: 1 }}
                        aria-hidden="true"
                      />
                    ) : (
                      <>
                        <Key className="h-4 w-4" />
                        <span>Passkey</span>
                      </>
                    )}
                  </Button>
                )}
              </div>

              {/* Toggle sign in / sign up */}
              <p className="mt-6 text-center text-sm text-muted-foreground">
                {isSignUp
                  ? "Already have an account?"
                  : "Don't have an account?"}{" "}
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(!isSignUp);
                    setError(null);
                  }}
                  className="font-medium text-primary hover:text-primary/80 transition-colors underline-offset-4 hover:underline"
                >
                  {isSignUp ? "Sign in" : "Sign up"}
                </button>
              </p>
            </div>

            {/* Footer links */}
            <p className="mt-6 text-center text-xs text-muted-foreground">
              Before continuing, please read our{" "}
              <Link
                href="/privacy"
                className="font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                privacy commitments
              </Link>
            </p>
          </div>
        </div>

        {/* Right side - Wallpaper (hidden on mobile) */}
        <div className="hidden lg:block lg:w-1/2 relative">
          <div className="absolute inset-4 rounded-2xl overflow-hidden shadow-2xl">
            <Image
              src="/wallpaper.jpg"
              alt="Solace — collaborate better"
              className="h-full w-full object-cover"
              fill
              loading="eager"
              unoptimized
            />
            {/* Overlay gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />
          </div>
        </div>
      </section>

      {overlayVisible && (
        <PageLoadingOverlay
          isLoading={!overlayFading}
          messageContext="AUTH_FLOW"
          fadeDurationMs={300}
        />
      )}
    </>
  );
}

export function LoginLoading() {
  return <PageLoadingOverlay isLoading={true} messageContext="AUTH_FLOW" />;
}
