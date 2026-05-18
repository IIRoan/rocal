"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { authClient, signIn, signUp, useSession } from "@/lib/auth-client";
import { createLogger } from "@workspace/logger";
import { getAppBaseUrl, resolveAuthRedirectTarget } from "@/lib/api-url";
import { completeAuthNavigation } from "@/lib/auth-navigation";
import { useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { Key, Eye, EyeOff, ArrowRight, Check, X, Ticket } from "lucide-react";
import { useSmoothRouter } from "@/hooks/use-smooth-router";
import { getErrorMessage } from "@workspace/calendar-core";
import { Logo, ThemeToggle } from "@workspace/ui/components/layout";
import { PageLoadingOverlay } from "@workspace/ui/components/ui";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { calendarApiService } from "@/lib/calendar-api-service";
import { accountApiService } from "@/lib/account-api-service";
import { inviteApiService } from "@/lib/invite-api-service";
import {
  clearAuthPasswords,
  storePendingAuthPassword,
} from "@/lib/e2ee-password-cache";
import {
  clearEncPasswordCookie,
  setEncPasswordCookie,
} from "@/lib/enc-password-cookie";
import { gsap, useGSAP } from "@workspace/ui/lib/gsap";
import { usePrefersReducedMotion } from "@workspace/ui/hooks";

const log = createLogger("login");
const DEFAULT_SIGNUP_DOMAIN = "solace.onl";
const AUTH_STATUS_RETRY_DELAYS_MS = [0, 75, 150, 300, 500] as const;
const FIELD_VALIDATION_DEBOUNCE_MS = 500;

type AuthMode = "sign-in" | "sign-up" | "forgot-password";

function normalizeFormValue(value: string): string {
  return value.trim().toLowerCase();
}

// ─── AnimatedCollapse ─────────────────────────────────────────────────────────

function AnimatedCollapse({
  isOpen,
  children,
}: {
  isOpen: boolean;
  children: React.ReactNode;
}) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const containerRef = useRef<HTMLDivElement>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useGSAP(
    () => {
      if (isOpen && !shouldRender) {
        setShouldRender(true);
        return;
      }

      const el = containerRef.current;
      if (!el) return;
      tweenRef.current?.kill();

      if (prefersReducedMotion) {
        if (isOpen) {
          gsap.set(el, { autoAlpha: 1, height: "auto", overflow: "visible" });
        } else {
          gsap.set(el, { autoAlpha: 0, height: 0, overflow: "hidden" });
          setShouldRender(false);
        }
        return;
      }

      if (isOpen) {
        const targetHeight = el.scrollHeight;
        tweenRef.current = gsap.fromTo(
          el,
          { height: 0, autoAlpha: 0, y: -6, overflow: "hidden" },
          {
            height: targetHeight,
            autoAlpha: 1,
            y: 0,
            duration: 0.22,
            ease: "power2.out",
            overwrite: true,
            onComplete: () =>
              gsap.set(el, {
                height: "auto",
                overflow: "visible",
                clearProps: "y",
              }),
          },
        );
      } else {
        tweenRef.current = gsap.to(el, {
          height: 0,
          autoAlpha: 0,
          y: -4,
          overflow: "hidden",
          duration: 0.16,
          ease: "power2.in",
          overwrite: true,
          onComplete: () => setShouldRender(false),
        });
      }
    },
    { dependencies: [isOpen, shouldRender] },
  );

  if (!isOpen && !shouldRender) return null;

  return (
    <div
      ref={containerRef}
      style={{ height: 0, overflow: "hidden", opacity: 0 }}
    >
      {children}
    </div>
  );
}

// ─── Password Requirements ─────────────────────────────────────────────────────

interface PasswordRequirement {
  label: string;
  met: boolean;
}

function getPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "One uppercase letter", met: /[A-Z]/.test(password) },
    { label: "One lowercase letter", met: /[a-z]/.test(password) },
    { label: "One number", met: /[0-9]/.test(password) },
    { label: "One special character", met: /[^A-Za-z0-9]/.test(password) },
  ];
}

function meetsMinPasswordRequirements(password: string): boolean {
  const reqs = getPasswordRequirements(password);
  return reqs.every((r) => r.met);
}

function PasswordRequirements({ password }: { password: string }) {
  const requirements = getPasswordRequirements(password);
  return (
    <ul className="mt-2 space-y-1" aria-label="Password requirements">
      {requirements.map((req) => (
        <li key={req.label} className="flex items-center gap-2">
          {req.met ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          ) : (
            <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
          )}
          <span
            className={`text-xs ${
              req.met
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground"
            }`}
          >
            {req.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ─── LoginForm ────────────────────────────────────────────────────────────────

export function LoginForm() {
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPasskeySupported, setIsPasskeySupported] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [overlayFading, setOverlayFading] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [requiresPasskeyStepUp, setRequiresPasskeyStepUp] = useState(false);
  const [shouldAutoPromptPasskey, setShouldAutoPromptPasskey] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [desiredEmail, setDesiredEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupDomain, setSignupDomain] = useState(DEFAULT_SIGNUP_DOMAIN);

  // Invite token state
  const [inviteToken, setInviteToken] = useState("");
  const [inviteValidation, setInviteValidation] = useState<
    | null
    | { valid: true; inviterName?: string | null }
    | { valid: false; reason: string }
  >(null);
  const [inviteValidating, setInviteValidating] = useState(false);

  // Real-time email availability state
  const [emailAvailability, setEmailAvailability] = useState<
    null | { available: true } | { available: false; message: string }
  >(null);
  const [emailChecking, setEmailChecking] = useState(false);

  const emailCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inviteValidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const titleRef = useRef<HTMLDivElement>(null);
  const hasAutoPromptedStepUpRef = useRef(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  const { data: session, isPending } = useSession();
  const router = useSmoothRouter();
  const searchParams = useSearchParams();
  const { theme: currentTheme } = useTheme();
  const nextPath = searchParams.get("next");
  const callbackUrl =
    searchParams.get("callbackURL") || searchParams.get("callbackUrl");
  const resetSucceeded = searchParams.get("reset") === "success";

  const isSignUp = authMode === "sign-up";
  const isForgotPassword = authMode === "forgot-password";

  const getRedirectTarget = useCallback(
    () => resolveAuthRedirectTarget(nextPath, callbackUrl),
    [nextPath, callbackUrl],
  );

  const switchMode = useCallback((mode: AuthMode) => {
    setAuthMode(mode);
    setError(null);
    setNotice(null);
    setShowPassword(false);
    setShouldAutoPromptPasskey(false);

    if (mode !== "sign-up") {
      setName("");
      setInviteToken("");
      setInviteValidation(null);
      setEmailAvailability(null);
    }

    if (mode === "forgot-password") {
      setPassword("");
    }
  }, []);

  // Debounced email availability check
  useEffect(() => {
    if (!isSignUp) return;
    const trimmed = desiredEmail.trim().toLowerCase();
    setEmailAvailability(null);
    if (emailCheckTimerRef.current) clearTimeout(emailCheckTimerRef.current);
    if (!trimmed) return;

    setEmailChecking(true);
    emailCheckTimerRef.current = setTimeout(async () => {
      try {
        const result = await accountApiService.checkEmailAvailability(trimmed);
        setEmailAvailability(
          result.available
            ? { available: true }
            : { available: false, message: result.message },
        );
      } catch {
        setEmailAvailability(null);
      } finally {
        setEmailChecking(false);
      }
    }, FIELD_VALIDATION_DEBOUNCE_MS);

    return () => {
      if (emailCheckTimerRef.current) clearTimeout(emailCheckTimerRef.current);
    };
  }, [desiredEmail, isSignUp]);

  // Debounced invite token validation
  useEffect(() => {
    if (!isSignUp) return;
    const trimmed = inviteToken.trim();
    setInviteValidation(null);
    if (inviteValidateTimerRef.current)
      clearTimeout(inviteValidateTimerRef.current);
    if (!trimmed) return;

    setInviteValidating(true);
    inviteValidateTimerRef.current = setTimeout(async () => {
      try {
        const result = await inviteApiService.validateInviteToken(trimmed);
        if (result.valid) {
          setInviteValidation({ valid: true, inviterName: result.inviterName });
        } else {
          const invalid = result as { valid: false; reason: string };
          setInviteValidation({
            valid: false,
            reason: invalid.reason ?? "Invalid token",
          });
        }
      } catch {
        setInviteValidation({
          valid: false,
          reason: "Could not validate token",
        });
      } finally {
        setInviteValidating(false);
      }
    }, FIELD_VALIDATION_DEBOUNCE_MS);

    return () => {
      if (inviteValidateTimerRef.current)
        clearTimeout(inviteValidateTimerRef.current);
    };
  }, [inviteToken, isSignUp]);

  const redirectAfterAuth = useCallback(() => {
    const target = getRedirectTarget();
    router.startRouteTransition({
      messageContext: "AUTH_FLOW",
      minimumVisibleMs: 120,
    });
    completeAuthNavigation(target.href);
  }, [getRedirectTarget, router]);

  const redirectAfterCompletedAuth = useCallback(() => {
    const target = getRedirectTarget();
    router.startRouteTransition({
      messageContext: "AUTH_FLOW",
      minimumVisibleMs: 120,
    });
    completeAuthNavigation(target.href);
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

  const refreshAuthStatus = useCallback(async () => {
    const authStatus = await accountApiService.getAuthStatus();
    setRequiresPasskeyStepUp(authStatus.requiresPasskeyStepUp);
    return authStatus;
  }, []);

  const waitForSettledAuthStatus = useCallback(async () => {
    let lastAuthStatus: Awaited<
      ReturnType<typeof accountApiService.getAuthStatus>
    > | null = null;

    for (const delayMs of AUTH_STATUS_RETRY_DELAYS_MS) {
      if (delayMs > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, delayMs));
      }

      lastAuthStatus = await refreshAuthStatus();

      if (
        lastAuthStatus.authenticated &&
        !lastAuthStatus.requiresPasskeyStepUp
      ) {
        return lastAuthStatus;
      }
    }

    return lastAuthStatus;
  }, [refreshAuthStatus]);

  const handleSessionRedirect = useCallback(async () => {
    if (!session?.user) {
      setRequiresPasskeyStepUp(false);
      setShouldAutoPromptPasskey(false);
      return;
    }

    const authStatus = await refreshAuthStatus();
    setShouldAutoPromptPasskey(authStatus.requiresPasskeyStepUp);

    if (!authStatus.requiresPasskeyStepUp) {
      redirectAfterAuth();
    }
  }, [refreshAuthStatus, redirectAfterAuth, session]);

  useEffect(() => {
    if (!isPending) {
      setIsCheckingSession(false);
      void handleSessionRedirect();
    }
  }, [session, isPending, handleSessionRedirect]);

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

  // Pre-fill invite token from ?invite= URL param and load signup domain
  useEffect(() => {
    let cancelled = false;

    const urlToken = searchParams.get("invite");
    if (urlToken) {
      setInviteToken(urlToken.trim());
      setAuthMode("sign-up");
    }

    void accountApiService
      .getSignupConfig()
      .then((config) => {
        if (!cancelled) {
          setSignupDomain(config.defaultEmailDomain);
        }
      })
      .catch((error) => {
        log.error("Failed to load signup config:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  // Animate the title in when auth mode switches
  useGSAP(
    () => {
      const el = titleRef.current;
      if (!el || prefersReducedMotion) return;
      gsap.fromTo(
        el,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.22, ease: "power2.out" },
      );
    },
    { dependencies: [authMode] },
  );

  const handlePasskeyStepUp = useCallback(async () => {
    try {
      setPasskeyLoading(true);
      setError(null);
      setNotice(null);

      const result = await authClient.signIn.passkey({
        autoFocus: true,
      });

      if (result?.error) {
        throw new Error(
          result.error.message ||
            "Passkey authentication failed. Please try again.",
        );
      }

      const authStatus = await waitForSettledAuthStatus();

      if (!authStatus?.authenticated) {
        throw new Error(
          "Your session could not be confirmed. Please try again.",
        );
      }

      if (authStatus.requiresPasskeyStepUp) {
        setError("Passkey verification is still required. Please try again.");
        return;
      }

      await syncThemeAfterAuth();
      redirectAfterCompletedAuth();
    } catch (error: any) {
      log.error("Passkey login failed:", error);
      setError(
        error.message || "Passkey authentication failed. Please try again.",
      );
    } finally {
      setPasskeyLoading(false);
    }
  }, [
    redirectAfterCompletedAuth,
    syncThemeAfterAuth,
    waitForSettledAuthStatus,
  ]);

  const triggerAutoPasskeyStepUp = useCallback(() => {
    hasAutoPromptedStepUpRef.current = true;
    setShouldAutoPromptPasskey(false);
    setNotice("Check your device to finish signing in with your passkey.");
    void handlePasskeyStepUp();
  }, [handlePasskeyStepUp]);

  const finalizePasswordAuth = useCallback(
    async (submittedPassword: string) => {
      storePendingAuthPassword(submittedPassword);
      void setEncPasswordCookie(submittedPassword);

      const authStatus = await refreshAuthStatus();
      if (authStatus.requiresPasskeyStepUp) {
        if (isPasskeySupported) {
          triggerAutoPasskeyStepUp();
        } else {
          setNotice(
            "Password accepted. Check your device to finish signing in with your passkey.",
          );
          setShouldAutoPromptPasskey(true);
        }
        return false;
      }

      await syncThemeAfterAuth();
      redirectAfterCompletedAuth();
      return true;
    },
    [
      isPasskeySupported,
      redirectAfterCompletedAuth,
      refreshAuthStatus,
      syncThemeAfterAuth,
      triggerAutoPasskeyStepUp,
    ],
  );

  const resolveAvailableSignupEmail = useCallback(
    async (rawDesiredEmail: string) => {
      const normalizedDesiredEmail = normalizeFormValue(rawDesiredEmail);

      if (!normalizedDesiredEmail) {
        setError(`Please choose your @${signupDomain} email.`);
        return null;
      }

      const availability = await accountApiService.checkEmailAvailability(
        normalizedDesiredEmail,
      );

      if (!availability.available) {
        setError(availability.message);
        return null;
      }

      return availability;
    },
    [signupDomain],
  );

  const claimRequiredInvite = useCallback(
    async (normalizedEmail: string) => {
      const trimmedToken = inviteToken.trim();
      if (!trimmedToken) {
        setError("An invite token is required to create an account.");
        return false;
      }

      const claimResult = await inviteApiService.claimInviteToken(
        trimmedToken,
        normalizedEmail,
      );

      if (!claimResult.success) {
        setError((claimResult as { success: false; reason: string }).reason);
        return false;
      }

      return true;
    },
    [inviteToken],
  );

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = normalizeFormValue(email);
    const trimmedName = name.trim();

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    try {
      setEmailLoading(true);
      setError(null);
      setNotice(null);

      if (isSignUp) {
        if (!trimmedName) {
          setError("Please enter your name.");
          return;
        }

        if (!meetsMinPasswordRequirements(password)) {
          setError(
            "Your password doesn't meet the requirements. Please check the list below.",
          );
          return;
        }

        const availability = await resolveAvailableSignupEmail(desiredEmail);
        if (!availability) {
          return;
        }

        if (!(await claimRequiredInvite(availability.normalizedEmail))) {
          return;
        }

        const result = await signUp.email({
          email: availability.normalizedEmail,
          password,
          name: trimmedName,
        });

        if (result?.error) {
          setError(result.error.message || "Sign up failed. Please try again.");
          return;
        }

        setEmail(availability.normalizedEmail);
      } else {
        if (!normalizedEmail) {
          setError("Please enter your account email address.");
          return;
        }

        const result = await signIn.email({
          email: normalizedEmail,
          password,
        });

        if (result?.error) {
          setError(result.error.message || "Invalid email or password.");
          return;
        }
      }

      await finalizePasswordAuth(password);
    } catch (err: any) {
      log.error("Email auth failed:", err);
      clearAuthPasswords();
      clearEncPasswordCookie();
      setError(
        getErrorMessage(err, "Authentication failed. Please try again."),
      );
    } finally {
      setEmailLoading(false);
    }
  };

  const handleForgotPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setEmailLoading(true);
    setError(null);
    setNotice(null);

    if (!email.trim()) {
      setError("Please enter your email address.");
      setEmailLoading(false);
      return;
    }

    try {
      const redirectTo = new URL("/reset-password", getAppBaseUrl()).toString();
      const result = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo,
      });

      if (result?.error) {
        setError(
          result.error.message ||
            "Unable to send a password reset link for your email sign-in password.",
        );
        return;
      }

      setNotice(
        "If an account exists for that email, we sent a password reset link for your email sign-in password.",
      );
    } catch (err: any) {
      log.error("Password reset request failed:", err);
      setError(
        err.message ||
          "Unable to send a password reset link for your email sign-in password.",
      );
    } finally {
      setEmailLoading(false);
    }
  };

  useEffect(() => {
    if (!requiresPasskeyStepUp) {
      hasAutoPromptedStepUpRef.current = false;
      setShouldAutoPromptPasskey(false);
      return;
    }

    if (
      !shouldAutoPromptPasskey ||
      !isPasskeySupported ||
      passkeyLoading ||
      authMode === "forgot-password" ||
      hasAutoPromptedStepUpRef.current
    ) {
      return;
    }

    triggerAutoPasskeyStepUp();
  }, [
    authMode,
    isPasskeySupported,
    passkeyLoading,
    requiresPasskeyStepUp,
    shouldAutoPromptPasskey,
    triggerAutoPasskeyStepUp,
  ]);

  const title = isForgotPassword
    ? "Reset your email sign-in password"
    : isSignUp
      ? "Create an account"
      : "Welcome back";

  const subtitle = isForgotPassword
    ? "Enter your Solace account email and we’ll send a reset link for your email sign-in password."
    : isSignUp
      ? `Choose your @${signupDomain} Solace email and password. Your Solace email becomes both your account address and mailbox, and this password is used locally to protect your encrypted mail vault.`
      : "Sign in with your email and password. If your account has passkeys, you'll verify with one right after.";

  const primaryButtonLabel = isForgotPassword
    ? "Send reset link"
    : isSignUp
      ? "Create account"
      : "Sign in";

  const primaryLoadingLabel = isForgotPassword
    ? "Sending link…"
    : isSignUp
      ? "Creating account…"
      : "Signing in…";

  return (
    <>
      <section className="flex min-h-[100dvh]">
        <div className="relative flex w-full flex-col justify-center px-6 py-10 sm:px-12 lg:w-1/2 lg:px-16 xl:px-24">
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
              <div ref={titleRef}>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  {title}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
              </div>
            </div>

            <div>
              {resetSucceeded && !isForgotPassword ? (
                <div className="mb-5 rounded-lg border border-secondary/20 bg-secondary/10 p-3">
                  <p className="text-sm text-foreground">
                    Your email sign-in password has been updated. The next time
                    you sign in with email, Solace will also use it to protect
                    your encryption keys.
                  </p>
                </div>
              ) : null}

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

              <form
                onSubmit={
                  isForgotPassword ? handleForgotPassword : handleEmailAuth
                }
                className="space-y-5"
              >
                <AnimatedCollapse isOpen={isSignUp}>
                  <div className="space-y-2 pb-0.5">
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
                </AnimatedCollapse>

                <AnimatedCollapse isOpen={isSignUp}>
                  <div className="space-y-2 pb-0.5">
                    <Label
                      htmlFor="desired-email"
                      className="text-sm font-medium"
                    >
                      Solace email
                    </Label>
                    <div
                      className={`flex h-11 overflow-hidden rounded-lg border bg-background transition-colors ${
                        emailAvailability === null
                          ? "border-input"
                          : emailAvailability.available
                            ? "border-emerald-500 ring-1 ring-emerald-500/30"
                            : "border-destructive ring-1 ring-destructive/30"
                      }`}
                    >
                      <Input
                        id="desired-email"
                        name="desired-email"
                        type="text"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        placeholder="your-name"
                        value={desiredEmail}
                        onChange={(e) => setDesiredEmail(e.target.value)}
                        required={isSignUp}
                        disabled={emailLoading}
                        className="h-full flex-1 rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                      <span className="flex items-center border-l border-input px-3 text-sm text-muted-foreground">
                        @{signupDomain}
                      </span>
                    </div>
                    {emailChecking && (
                      <p className="text-xs text-muted-foreground">
                        Checking availability…
                      </p>
                    )}
                    {!emailChecking && emailAvailability !== null && (
                      <p
                        className={`text-xs ${
                          emailAvailability.available
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-destructive"
                        }`}
                      >
                        {emailAvailability.available
                          ? "This address is available."
                          : (
                              emailAvailability as {
                                available: false;
                                message: string;
                              }
                            ).message}
                      </p>
                    )}
                    {!emailChecking && !emailAvailability && (
                      <p className="text-xs text-muted-foreground">
                        This becomes your Solace account email and mailbox
                        address.
                      </p>
                    )}
                  </div>
                </AnimatedCollapse>

                <AnimatedCollapse isOpen={isSignUp}>
                  <div className="space-y-2 pb-0.5">
                    <Label
                      htmlFor="invite-token"
                      className="text-sm font-medium"
                    >
                      Invite token
                    </Label>
                    <div className="relative">
                      <Ticket className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="invite-token"
                        name="invite-token"
                        type="text"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        placeholder="Paste your invite token"
                        value={inviteToken}
                        onChange={(e) => setInviteToken(e.target.value)}
                        disabled={emailLoading}
                        className={`h-11 rounded-lg pl-9 transition-colors ${
                          inviteValidation === null
                            ? ""
                            : inviteValidation.valid
                              ? "border-emerald-500 ring-1 ring-emerald-500/30"
                              : "border-destructive ring-1 ring-destructive/30"
                        }`}
                      />
                    </div>
                    {inviteValidating && (
                      <p className="text-xs text-muted-foreground">
                        Validating token…
                      </p>
                    )}
                    {!inviteValidating && inviteValidation !== null && (
                      <p
                        className={`text-xs ${
                          inviteValidation.valid
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-destructive"
                        }`}
                      >
                        {inviteValidation.valid
                          ? inviteValidation.inviterName
                            ? `Valid — invited by ${inviteValidation.inviterName}`
                            : "Valid invite token."
                          : (
                              inviteValidation as {
                                valid: false;
                                reason: string;
                              }
                            ).reason}
                      </p>
                    )}
                    {!inviteValidating && inviteValidation === null && (
                      <p className="text-xs text-muted-foreground">
                        Solace is invite-only. Enter the token shared with you.
                      </p>
                    )}
                  </div>
                </AnimatedCollapse>

                <AnimatedCollapse isOpen={!isSignUp}>
                  <div className="space-y-2 pb-0.5">
                    <Label htmlFor="email" className="text-sm font-medium">
                      Account email
                    </Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder={`you@${signupDomain}`}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required={!isSignUp}
                      disabled={emailLoading}
                      className="h-11 rounded-lg"
                    />
                  </div>
                </AnimatedCollapse>

                <AnimatedCollapse isOpen={!isForgotPassword}>
                  <div className="space-y-2 pb-0.5">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="password" className="text-sm font-medium">
                        Password
                      </Label>
                      {!isSignUp ? (
                        <button
                          type="button"
                          onClick={() => switchMode("forgot-password")}
                          className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
                        >
                          Forgot password?
                        </button>
                      ) : null}
                    </div>
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
                        required={!isForgotPassword}
                        disabled={emailLoading}
                        className="h-11 rounded-lg pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
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
                    {isSignUp && password.length > 0 && (
                      <PasswordRequirements password={password} />
                    )}
                    {isSignUp && password.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Min. 8 characters with uppercase, lowercase, number
                        &amp; special character.
                      </p>
                    )}
                  </div>
                </AnimatedCollapse>

                <Button
                  type="submit"
                  disabled={emailLoading}
                  className="mt-2 h-11 w-full rounded-lg font-medium"
                  aria-busy={emailLoading}
                >
                  {emailLoading ? (
                    <>
                      <div
                        className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
                        aria-hidden="true"
                      />
                      <span>{primaryLoadingLabel}</span>
                    </>
                  ) : (
                    <>
                      <span>{primaryButtonLabel}</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>

              <AnimatedCollapse isOpen={!isForgotPassword}>
                <div className="pb-0.5">
                  {requiresPasskeyStepUp && isPasskeySupported ? (
                    <>
                      <div className="my-6 flex items-center gap-3">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-xs font-medium text-muted-foreground">
                          second factor required
                        </span>
                        <div className="h-px flex-1 bg-border" />
                      </div>

                      <Button
                        onClick={handlePasskeyStepUp}
                        disabled={passkeyLoading}
                        variant="outline"
                        className="h-11 w-full rounded-lg"
                        aria-busy={passkeyLoading}
                      >
                        {passkeyLoading ? (
                          <>
                            <div
                              className="h-4 w-4 animate-spin rounded-full border-2 border-current opacity-30 border-t-current"
                              style={{
                                borderTopColor: "currentColor",
                                opacity: 1,
                              }}
                              aria-hidden="true"
                            />
                            <span>Waiting for your passkey...</span>
                          </>
                        ) : (
                          <>
                            <Key className="h-4 w-4" />
                            <span>Use passkey</span>
                          </>
                        )}
                      </Button>
                    </>
                  ) : null}
                </div>
              </AnimatedCollapse>

              {isForgotPassword ? (
                <p className="mt-6 text-center text-sm text-muted-foreground">
                  Remembered your password?{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("sign-in")}
                    className="font-medium text-primary transition-colors hover:text-primary/80"
                  >
                    Back to sign in
                  </button>
                </p>
              ) : (
                <p className="mt-6 text-center text-sm text-muted-foreground">
                  {isSignUp
                    ? "Already have an account?"
                    : "Don't have an account?"}{" "}
                  <button
                    type="button"
                    onClick={() => switchMode(isSignUp ? "sign-in" : "sign-up")}
                    className="font-medium text-primary transition-colors hover:text-primary/80 underline-offset-4 hover:underline"
                  >
                    {isSignUp ? "Sign in" : "Sign up"}
                  </button>
                </p>
              )}

              <p className="mt-6 text-center text-xs text-muted-foreground">
                Before continuing, please read our{" "}
                <Link
                  href="/privacy"
                  className="font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  privacy commitments
                </Link>
              </p>
            </div>
          </div>
        </div>

        <div className="relative hidden lg:block lg:w-1/2">
          <div className="absolute inset-4 overflow-hidden rounded-2xl shadow-2xl">
            <Image
              src="/wallpaper.jpg"
              alt="Solace — collaborate better"
              className="h-full w-full object-cover"
              fill
              loading="eager"
              unoptimized
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />
          </div>
        </div>
      </section>

      {overlayVisible ? (
        <PageLoadingOverlay
          isLoading={!overlayFading}
          messageContext="AUTH_FLOW"
          fadeDurationMs={300}
        />
      ) : null}
    </>
  );
}

export function LoginLoading() {
  return <PageLoadingOverlay isLoading={true} messageContext="AUTH_FLOW" />;
}
