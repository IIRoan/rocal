"use client";

import { useState, useEffect, useRef, useReducer } from "react";
import Image from "next/image";
import Link from "next/link";
import { authClient, signIn, signUp, useSession } from "@/lib/auth-client";
import { createLogger } from "@workspace/logger";
import { getAppBaseUrl, resolveAuthRedirectTarget } from "@/lib/api-url";
import { completeAuthNavigation } from "@/lib/auth-navigation";
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
import {
  clearOrphanedClientAuthArtifacts,
  recoverFromStaleAuthState,
  reconcileAuthSession,
} from "@/lib/auth-local-state";
import { gsap, useGSAP } from "@workspace/ui/lib/gsap";
import { usePrefersReducedMotion } from "@workspace/ui/hooks";
import {
  createInitialLoginFormFields,
  emailAvailabilityUiReducer,
  initialEmailAvailabilityUi,
  initialInviteValidationUi,
  initialLoginFormChrome,
  inviteValidationUiReducer,
  loginFormChromeReducer,
  loginFormFieldsReducer,
  type AuthMode,
} from "./login-form-state";
import type { LoginSearchParams } from "./login-form-params";

const log = createLogger("login");
const DEFAULT_SIGNUP_DOMAIN = "solace.onl";
const AUTH_STATUS_RETRY_DELAYS_MS = [0, 100, 250, 500, 1000, 1500] as const;
const LOCAL_STATE_RESET_MESSAGE =
  "Your sign-in could not be confirmed. Local browser state was reset — please try again.";
const FIELD_VALIDATION_DEBOUNCE_MS = 500;

async function fetchSignupEmailAvailability(trimmed: string) {
  try {
    return await accountApiService.checkEmailAvailability(trimmed);
  } catch {
    return null;
  }
}

async function fetchInviteTokenValidation(trimmed: string) {
  try {
    return await inviteApiService.validateInviteToken(trimmed);
  } catch {
    return { valid: false as const, reason: "Could not validate token" };
  }
}

async function requestPasswordResetForLogin(email: string, redirectTo: string) {
  try {
    const result = await authClient.requestPasswordReset({
      email,
      redirectTo,
    });

    if (result?.error) {
      return {
        errorMessage:
          result.error.message ||
          "Unable to send a password reset link for your email sign-in password.",
        notice: null,
      };
    }

    return {
      errorMessage: null,
      notice:
        "If an account exists for that email, Solace sent a password reset link for your email sign-in password.",
    };
  } catch (err: any) {
    log.error("Password reset request failed:", err);
    return {
      errorMessage:
        err.message ||
        "Unable to send a password reset link for your email sign-in password.",
      notice: null,
    };
  }
}

type AuthStatusResult = Awaited<
  ReturnType<typeof accountApiService.getAuthStatus>
>;

async function settleAuthStatusAtIndex(
  refreshAuthStatus: () => Promise<AuthStatusResult>,
  index: number,
  lastStatus: AuthStatusResult | null,
  options?: { allowPasskeyStepUp?: boolean },
): Promise<AuthStatusResult | null> {
  if (index >= AUTH_STATUS_RETRY_DELAYS_MS.length) {
    return lastStatus;
  }

  const delayMs = AUTH_STATUS_RETRY_DELAYS_MS[index];
  if (delayMs > 0) {
    await new Promise((resolve) => window.setTimeout(resolve, delayMs));
  }

  const authStatus = await refreshAuthStatus();

  if (!authStatus.authenticated) {
    return settleAuthStatusAtIndex(
      refreshAuthStatus,
      index + 1,
      authStatus,
      options,
    );
  }

  if (options?.allowPasskeyStepUp || !authStatus.requiresPasskeyStepUp) {
    return authStatus;
  }

  return settleAuthStatusAtIndex(
    refreshAuthStatus,
    index + 1,
    authStatus,
    options,
  );
}

async function waitForSettledAuthStatus(
  refreshAuthStatus: () => Promise<AuthStatusResult>,
  options?: { allowPasskeyStepUp?: boolean },
): Promise<AuthStatusResult | null> {
  return settleAuthStatusAtIndex(refreshAuthStatus, 0, null, options);
}

type LoginSessionUi = {
  overlayVisible: boolean;
  overlayFading: boolean;
  requiresPasskeyStepUp: boolean;
};

const initialLoginSessionUi: LoginSessionUi = {
  overlayVisible: true,
  overlayFading: false,
  requiresPasskeyStepUp: false,
};

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
  const [shouldRender, setShouldRender] = useState(false);
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
            <Check className="size-3.5 shrink-0 text-success" />
          ) : (
            <X className="size-3.5 shrink-0 text-muted-foreground/50" />
          )}
          <span
            className={`text-xs ${
              req.met
                ? "text-success"
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

type LoginFormBodyProps = {
  loginSearchParams: LoginSearchParams;
};

export function LoginFormBody({ loginSearchParams }: LoginFormBodyProps) {
  const [chrome, dispatchChrome] = useReducer(
    loginFormChromeReducer,
    initialLoginFormChrome,
  );
  const [fields, dispatchFields] = useReducer(
    loginFormFieldsReducer,
    loginSearchParams,
    (params) =>
      createInitialLoginFormFields(
        params.inviteToken,
        DEFAULT_SIGNUP_DOMAIN,
      ),
  );
  const [emailAvailabilityUi, dispatchEmailAvailability] = useReducer(
    emailAvailabilityUiReducer,
    initialEmailAvailabilityUi,
  );
  const [inviteValidationUi, dispatchInviteValidation] = useReducer(
    inviteValidationUiReducer,
    initialInviteValidationUi,
  );
  const [isPasskeySupported] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.PublicKeyCredential !== "undefined",
  );
  const [loginSessionUi, setLoginSessionUi] =
    useState<LoginSessionUi>(initialLoginSessionUi);

  const {
    authMode,
    name,
    email,
    desiredEmail,
    password,
    inviteToken,
    showPassword,
    signupDomain,
  } = fields;
  const { passkeyLoading, emailLoading, error, notice } = chrome;
  const { availability: emailAvailability, checking: emailChecking } =
    emailAvailabilityUi;
  const { validation: inviteValidation, validating: inviteValidating } =
    inviteValidationUi;

  const emailCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inviteValidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const titleRef = useRef<HTMLDivElement>(null);
  const hasAutoPromptedStepUpRef = useRef(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  const { data: session, isPending } = useSession();
  const router = useSmoothRouter();
  const { theme: currentTheme } = useTheme();
  const isCheckingSession = isPending;
  const { nextPath, callbackUrl, resetSucceeded } = loginSearchParams;

  const isSignUp = authMode === "sign-up";
  const isForgotPassword = authMode === "forgot-password";
  const { overlayVisible, overlayFading, requiresPasskeyStepUp } = loginSessionUi;

  const getRedirectTarget = () =>
    resolveAuthRedirectTarget(nextPath, callbackUrl);

  function switchMode(mode: AuthMode) {
    dispatchFields({ type: "switch-mode", mode });
    dispatchChrome({ type: "clear-messages" });
    dispatchEmailAvailability({ type: "reset", checking: false });
    dispatchInviteValidation({ type: "reset", validating: false });
    hasAutoPromptedStepUpRef.current = false;
  }

  // Debounced email availability check
  useEffect(() => {
    if (!isSignUp) return;
    const trimmed = desiredEmail.trim().toLowerCase();
    if (emailCheckTimerRef.current) clearTimeout(emailCheckTimerRef.current);
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      dispatchEmailAvailability({
        type: "reset",
        checking: Boolean(trimmed),
      });
    });
    if (!trimmed) {
      return () => {
        cancelled = true;
      };
    }

    emailCheckTimerRef.current = setTimeout(() => {
      void fetchSignupEmailAvailability(trimmed).then((result) => {
        if (cancelled) {
          return;
        }

        if (!result) {
          dispatchEmailAvailability({ type: "set-result", availability: null });
          return;
        }

        dispatchEmailAvailability({
          type: "set-result",
          availability: result.available
            ? { available: true }
            : { available: false, message: result.message },
        });
      });
    }, FIELD_VALIDATION_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      if (emailCheckTimerRef.current) clearTimeout(emailCheckTimerRef.current);
    };
  }, [desiredEmail, isSignUp]);

  // Debounced invite token validation
  useEffect(() => {
    if (!isSignUp) return;
    const trimmed = inviteToken.trim();
    if (inviteValidateTimerRef.current)
      clearTimeout(inviteValidateTimerRef.current);
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      dispatchInviteValidation({
        type: "reset",
        validating: Boolean(trimmed),
      });
    });
    if (!trimmed) {
      return () => {
        cancelled = true;
      };
    }

    inviteValidateTimerRef.current = setTimeout(() => {
      void fetchInviteTokenValidation(trimmed).then((result) => {
        if (cancelled) {
          return;
        }

        if (result.valid) {
          dispatchInviteValidation({
            type: "set-result",
            validation: {
              valid: true,
              inviterName: result.inviterName,
            },
          });
          return;
        }

        const invalid = result as { valid: false; reason: string };
        dispatchInviteValidation({
          type: "set-result",
          validation: {
            valid: false,
            reason: invalid.reason ?? "Invalid token",
          },
        });
      });
    }, FIELD_VALIDATION_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      if (inviteValidateTimerRef.current)
        clearTimeout(inviteValidateTimerRef.current);
    };
  }, [inviteToken, isSignUp]);

  function redirectAfterAuth() {
    const target = getRedirectTarget();
    router.startRouteTransition({
      messageContext: "AUTH_FLOW",
      minimumVisibleMs: 120,
    });
    completeAuthNavigation(target.href);
  }

  function redirectAfterCompletedAuth() {
    const target = getRedirectTarget();
    router.startRouteTransition({
      messageContext: "AUTH_FLOW",
      minimumVisibleMs: 120,
    });
    completeAuthNavigation(target.href);
  }

  async function syncThemeAfterAuth() {
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
  }

  async function refreshAuthStatus() {
    const authStatus = await accountApiService.getAuthStatus();
    setLoginSessionUi((ui) => ({
      ...ui,
      requiresPasskeyStepUp: authStatus.requiresPasskeyStepUp,
    }));
    return authStatus;
  }

  async function waitForSettledAuthStatusForLogin(
    options?: { allowPasskeyStepUp?: boolean },
  ) {
    return waitForSettledAuthStatus(refreshAuthStatus, options);
  }

  const handleSessionRedirectRef = useRef<(() => Promise<void>) | null>(null);

  async function handleSessionRedirect() {
    if (!session?.user) {
      setLoginSessionUi((ui) => ({
        ...ui,
        requiresPasskeyStepUp: false,
      }));
      hasAutoPromptedStepUpRef.current = false;
      return;
    }

    const reconciliation = await reconcileAuthSession({
      hasClientSession: true,
      reason: "login-page-reconcile",
    });

    if (reconciliation.status === "recovered") {
      setLoginSessionUi({
        overlayVisible: false,
        overlayFading: true,
        requiresPasskeyStepUp: false,
      });
      hasAutoPromptedStepUpRef.current = false;
      return;
    }

    const authStatus = await refreshAuthStatus();

    if (authStatus.authenticated && !authStatus.requiresPasskeyStepUp) {
      redirectAfterAuth();
    }
  }

  useEffect(() => {
    handleSessionRedirectRef.current = handleSessionRedirect;
  });

  useEffect(() => {
    if (!isPending) {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) {
          void handleSessionRedirectRef.current?.();
        }
      });
      return () => {
        cancelled = true;
      };
    }
  }, [session, isPending]);

  useEffect(() => {
    if (!isPending && !isCheckingSession && !session?.user) {
      let cancelled = false;
      const fadeTimer = window.setTimeout(() => {
        if (!cancelled) {
          setLoginSessionUi((ui) => ({ ...ui, overlayFading: true }));
        }
      }, 0);
      const hideTimer = window.setTimeout(() => {
        if (!cancelled) {
          setLoginSessionUi((ui) => ({ ...ui, overlayVisible: false }));
        }
      }, 300);
      return () => {
        cancelled = true;
        window.clearTimeout(fadeTimer);
        window.clearTimeout(hideTimer);
      };
    }
  }, [isPending, isCheckingSession, session?.user]);

  useEffect(() => {
    if (!isPending && !session?.user) {
      clearOrphanedClientAuthArtifacts();
    }
  }, [isPending, session?.user]);

  // Load signup domain on mount
  useEffect(() => {
    let cancelled = false;

    void accountApiService
      .getSignupConfig()
      .then((config) => {
        if (!cancelled) {
          dispatchFields({
            type: "set-signup-domain",
            signupDomain: config.defaultEmailDomain,
          });
        }
      })
      .catch((error) => {
        log.error("Failed to load signup config:", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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

  async function handlePasskeyStepUp() {
    dispatchChrome({ type: "start-passkey-auth" });

    const result = await authClient.signIn.passkey({
      autoFocus: true,
    });

    if (result?.error) {
      log.error("Passkey login failed:", result.error);
      dispatchChrome({
        type: "set-error",
        error:
          result.error.message ||
          "Passkey authentication failed. Please try again.",
      });
      dispatchChrome({ type: "finish-passkey-auth" });
      return;
    }

    const authStatus = await waitForSettledAuthStatusForLogin();

    if (!authStatus?.authenticated) {
      dispatchChrome({
        type: "set-error",
        error: "Your session could not be confirmed. Please try again.",
      });
      dispatchChrome({ type: "finish-passkey-auth" });
      return;
    }

    if (authStatus.requiresPasskeyStepUp) {
      dispatchChrome({
        type: "set-error",
        error: "Passkey verification is still required. Please try again.",
      });
      dispatchChrome({ type: "finish-passkey-auth" });
      return;
    }

    await syncThemeAfterAuth();
    redirectAfterCompletedAuth();
    dispatchChrome({ type: "finish-passkey-auth" });
  }

  function triggerAutoPasskeyStepUp() {
    hasAutoPromptedStepUpRef.current = true;
    dispatchChrome({
      type: "set-notice",
      notice: "Check your device to finish signing in with your passkey.",
    });
    void handlePasskeyStepUp();
  }

  async function finalizePasswordAuth(submittedPassword: string) {
    storePendingAuthPassword(submittedPassword);
    try {
      await setEncPasswordCookie(submittedPassword);
    } catch (cookieError) {
      log.warn("Failed to persist encrypted password cookie after auth", {
        error: cookieError,
      });
    }

    // Wait for the session cookie to become visible to auth-status before
    // treating an unsettled response as corrupt local state.
    const authStatus = await waitForSettledAuthStatusForLogin({
      allowPasskeyStepUp: true,
    });
    if (!authStatus?.authenticated) {
      await recoverFromStaleAuthState("post-sign-in-unsettled");
      dispatchChrome({
        type: "set-error",
        error: LOCAL_STATE_RESET_MESSAGE,
      });
      return false;
    }

    if (authStatus.requiresPasskeyStepUp) {
      if (isPasskeySupported) {
        triggerAutoPasskeyStepUp();
      } else {
        dispatchChrome({
          type: "set-notice",
          notice:
            "Password accepted. Check your device to finish signing in with your passkey.",
        });
      }
      return false;
    }

    await syncThemeAfterAuth();
    redirectAfterCompletedAuth();
    return true;
  }

  async function resolveAvailableSignupEmail(rawDesiredEmail: string) {
    const normalizedDesiredEmail = normalizeFormValue(rawDesiredEmail);

    if (!normalizedDesiredEmail) {
      dispatchChrome({
        type: "set-error",
        error: `Please choose your @${signupDomain} email.`,
      });
      return null;
    }

    const availability = await accountApiService.checkEmailAvailability(
      normalizedDesiredEmail,
    );

    if (!availability.available) {
      dispatchChrome({ type: "set-error", error: availability.message });
      return null;
    }

    return availability;
  }

  async function claimRequiredInvite(normalizedEmail: string) {
    const trimmedToken = inviteToken.trim();
    if (!trimmedToken) {
      dispatchChrome({
        type: "set-error",
        error: "An invite token is required to create an account.",
      });
      return false;
    }

    const claimResult = await inviteApiService.claimInviteToken(
      trimmedToken,
      normalizedEmail,
    );

    if (!claimResult.success) {
      dispatchChrome({
        type: "set-error",
        error: (claimResult as { success: false; reason: string }).reason,
      });
      return false;
    }

    return true;
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    const normalizedEmail = normalizeFormValue(email);
    const trimmedName = name.trim();

    if (!password) {
      dispatchChrome({
        type: "set-error",
        error: "Please enter your password.",
      });
      return;
    }

    dispatchChrome({ type: "start-email-auth" });

    if (isSignUp) {
      if (!trimmedName) {
        dispatchChrome({
          type: "set-error",
          error: "Please enter your name.",
        });
        dispatchChrome({ type: "finish-email-auth" });
        return;
      }

      if (!meetsMinPasswordRequirements(password)) {
        dispatchChrome({
          type: "set-error",
          error:
            "Your password doesn't meet the requirements. Please check the list below.",
        });
        dispatchChrome({ type: "finish-email-auth" });
        return;
      }

      const availability = await resolveAvailableSignupEmail(desiredEmail);
      if (!availability) {
        dispatchChrome({ type: "finish-email-auth" });
        return;
      }

      if (!(await claimRequiredInvite(availability.normalizedEmail))) {
        dispatchChrome({ type: "finish-email-auth" });
        return;
      }

      const signUpResult = await signUp.email({
        email: availability.normalizedEmail,
        password,
        name: trimmedName,
      });

      if (signUpResult?.error) {
        dispatchChrome({
          type: "set-error",
          error: signUpResult.error.message || "Sign up failed. Please try again.",
        });
        dispatchChrome({ type: "finish-email-auth" });
        return;
      }

      dispatchFields({
        type: "set-email",
        email: availability.normalizedEmail,
      });
    } else {
      if (!normalizedEmail) {
        dispatchChrome({
          type: "set-error",
          error: "Please enter your account email address.",
        });
        dispatchChrome({ type: "finish-email-auth" });
        return;
      }

      clearOrphanedClientAuthArtifacts();

      let signInResult: Awaited<ReturnType<typeof signIn.email>> | undefined;
      try {
        signInResult = await signIn.email({
          email: normalizedEmail,
          password,
        });
      } catch (err: any) {
        log.error("Email auth failed:", err);
        await recoverFromStaleAuthState("post-sign-in-unsettled");
        dispatchChrome({
          type: "set-error",
          error: getErrorMessage(err, "Authentication failed. Please try again."),
        });
        dispatchChrome({ type: "finish-email-auth" });
        return;
      }

      if (signInResult?.error) {
        dispatchChrome({
          type: "set-error",
          error: signInResult.error.message || "Invalid email or password.",
        });
        dispatchChrome({ type: "finish-email-auth" });
        return;
      }
    }

    try {
      await finalizePasswordAuth(password);
    } catch (err: any) {
      log.error("Email auth failed:", err);
      await recoverFromStaleAuthState("post-sign-in-unsettled");
      dispatchChrome({
        type: "set-error",
        error: getErrorMessage(err, "Authentication failed. Please try again."),
      });
    }

    dispatchChrome({ type: "finish-email-auth" });
  };

  async function handleForgotPassword(event: React.FormEvent) {
    event.preventDefault();
    dispatchChrome({ type: "start-email-auth" });

    if (!email.trim()) {
      dispatchChrome({
        type: "set-error",
        error: "Please enter your email address.",
      });
      dispatchChrome({ type: "finish-email-auth" });
      return;
    }

    const resetResult = await requestPasswordResetForLogin(
      email.trim(),
      new URL("/reset-password", getAppBaseUrl()).toString(),
    );

    if (resetResult.errorMessage) {
      dispatchChrome({ type: "set-error", error: resetResult.errorMessage });
      dispatchChrome({ type: "finish-email-auth" });
      return;
    }

    dispatchChrome({ type: "set-notice", notice: resetResult.notice });
    dispatchChrome({ type: "finish-email-auth" });
  };

  const title = isForgotPassword
    ? "Reset your email sign-in password"
    : isSignUp
      ? "Create an account"
      : "Welcome back";

  const subtitle = isForgotPassword
    ? "Enter your Solace account email and Solace will send a reset link for your email sign-in password."
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
                      onChange={(e) =>
                        dispatchFields({ type: "set-name", name: e.target.value })
                      }
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
                            ? "border-success ring-1 ring-success/30"
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
                        onChange={(e) =>
                          dispatchFields({
                            type: "set-desired-email",
                            desiredEmail: e.target.value,
                          })
                        }
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
                            ? "text-success"
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
                      <Ticket className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="invite-token"
                        name="invite-token"
                        type="text"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        placeholder="Paste your invite token"
                        value={inviteToken}
                        onChange={(e) =>
                          dispatchFields({
                            type: "set-invite-token",
                            inviteToken: e.target.value,
                          })
                        }
                        disabled={emailLoading}
                        className={`h-11 rounded-lg pl-9 transition-colors ${
                          inviteValidation === null
                            ? ""
                            : inviteValidation.valid
                              ? "border-success ring-1 ring-success/30"
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
                            ? "text-success"
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
                      onChange={(e) =>
                        dispatchFields({
                          type: "set-email",
                          email: e.target.value,
                        })
                      }
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
                        onChange={(e) =>
                          dispatchFields({
                            type: "set-password",
                            password: e.target.value,
                          })
                        }
                        required={!isForgotPassword}
                        disabled={emailLoading}
                        className="h-11 rounded-lg pr-10"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          dispatchFields({ type: "toggle-show-password" })
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                      >
                        {showPassword ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
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
                        className="size-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
                        aria-hidden="true"
                      />
                      <span>{primaryLoadingLabel}</span>
                    </>
                  ) : (
                    <>
                      <span>{primaryButtonLabel}</span>
                      <ArrowRight className="size-4" />
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
                              className="size-4 animate-spin rounded-full border-2 border-current opacity-30 border-t-current"
                              style={{
                                borderTopColor: "currentColor",
                                opacity: 1,
                              }}
                              aria-hidden="true"
                            />
                            <span>Waiting for your passkey…</span>
                          </>
                        ) : (
                          <>
                            <Key className="size-4" />
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
                Before continuing, please read Solace&apos;s{" "}
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
              alt="Solace, collaborate better"
              className="size-full object-cover"
              fill
              sizes="50vw"
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
