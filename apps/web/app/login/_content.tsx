"use client";

import { useState, useEffect, useEffectEvent, useLayoutEffect, useRef, useReducer } from "react";
import Image from "next/image";
import Link from "next/link";
import { authClient, signIn, signUp, useSession } from "@/lib/auth-client";
import { createLogger } from "@workspace/logger";
import { resolveAuthRedirectTarget } from "@/lib/api-url";
import { FORGOT_PASSWORD_NOTICE } from "@workspace/calendar-core/product-info";
import {
  completeAuthNavigation,
  isAuthNavigationPending,
} from "@/lib/auth-navigation";
import { Key, Eye, EyeOff, ArrowRight, Check, X, Ticket } from "lucide-react";
import { useSmoothRouter } from "@/hooks/use-smooth-router";
import { afterPaint, getErrorMessage } from "@workspace/calendar-core";
import { Logo, ThemeToggle } from "@workspace/ui/components/layout";
import { PageLoadingOverlay } from "@workspace/ui/components/ui";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { accountApiService, inviteApiService } from "@/lib/api-clients";
import {
  clearPendingAuthPassword,
  peekPendingAuthPassword,
  storePendingAuthPassword,
} from "@/lib/e2ee-password-cache";
import { unlockWithSignInPassword } from "@/lib/e2ee-bootstrap";
import {
  clearOrphanedClientAuthArtifacts,
  endLockedSession,
  reconcileAuthSession,
} from "@/lib/auth-local-state";
import { isPasskeyAuthCancelled } from "@/lib/native-passkey-bridge";
import { AnimatedCollapse } from "@workspace/ui/components/ui/animated-collapse";
import { MOTION_EASING, slideFadeIn } from "@workspace/ui/lib/motion";
import {
  createInitialLoginFormChrome,
  createInitialLoginFormFields,
  emailAvailabilityUiReducer,
  initialEmailAvailabilityUi,
  initialInviteValidationUi,
  inviteValidationUiReducer,
  loginFormChromeReducer,
  loginFormFieldsReducer,
  type AuthMode,
  type LoginField,
} from "./login-form-state";
import type { LoginSearchParams } from "./login-form-params";

const log = createLogger("login");
const DEFAULT_SIGNUP_DOMAIN = "solace.onl";
const AUTH_STATUS_RETRY_DELAYS_MS = [0, 150, 400] as const;
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
    return {
      valid: false as const,
      reason: "Unable to check the invite token. Check your connection and try again.",
    };
  }
}

async function findAuthenticatedSessionForEmail(normalizedEmail: string) {
  try {
    const result = await authClient.getSession({
      query: { disableCookieCache: true },
    });
    const sessionEmail = result?.data?.user?.email?.trim().toLowerCase();

    return sessionEmail === normalizedEmail ? result.data : null;
  } catch {
    return null;
  }
}

/** The sign-in password lives only in this page's memory, so the keys are opened with it before the reload forgets it. */
async function unlockBeforeLeaving() {
  if (!peekPendingAuthPassword()) return null;
  const session = await authClient.getSession({
    query: { disableCookieCache: true },
  });
  const userId = session?.data?.user?.id;
  return userId ? unlockWithSignInPassword(userId) : null;
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

  let authStatus: AuthStatusResult;
  try {
    authStatus = await refreshAuthStatus();
  } catch {
    return settleAuthStatusAtIndex(
      refreshAuthStatus,
      index + 1,
      lastStatus,
      options,
    );
  }

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
    <ul
      id="password-hint"
      className="mt-2 space-y-1"
      aria-label="Password requirements"
    >
      {requirements.map((req) => (
        <li key={req.label} className="flex items-center gap-2">
          {req.met ? (
            <Check className="size-3.5 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <X className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="sr-only">{req.met ? "Met:" : "Not met:"}</span>
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
    loginSearchParams.e2eeLock,
    createInitialLoginFormChrome,
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
  const { passkeyLoading, emailLoading, error, errorField, notice } = chrome;
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
  const isLeavingRef = useRef(false);

  const {
    data: session,
    isPending,
    refetch: refetchSession,
  } = useSession();
  const router = useSmoothRouter();
  const isCheckingSession = isPending;
  const { nextPath, callbackUrl, stepUpRequired } =
    loginSearchParams;

  const isSignUp = authMode === "sign-up";
  const { overlayVisible, overlayFading, requiresPasskeyStepUp } = loginSessionUi;

  const getRedirectTarget = () =>
    resolveAuthRedirectTarget(nextPath, callbackUrl);

  /** Shows a field's error, then focuses that field once the error has rendered so it is announced with it. */
  function failField(field: LoginField, message: string) {
    dispatchChrome({ type: "set-error", error: message, field });
    afterPaint(() => document.getElementById(field)?.focus());
  }

  function fieldErrorProps(
    field: LoginField,
    describedBy?: string,
    invalidHint = false,
  ) {
    const hasError = errorField === field;
    return {
      "aria-invalid": hasError || invalidHint || undefined,
      "aria-describedby":
        [hasError ? "login-error" : null, describedBy].filter(Boolean).join(" ") ||
        undefined,
    };
  }

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
      void fetchSignupEmailAvailability(trimmed)
        .then((result) => {
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
        })
        .catch((error) => {
          log.error("Failed to check email availability:", error);
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
      void fetchInviteTokenValidation(trimmed)
        .then((result) => {
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
              reason:
                invalid.reason ?? "This invite token is not valid. Ask for a new invite.",
            },
          });
        })
        .catch((error) => {
          log.error("Failed to validate the invite token:", error);
        });
    }, FIELD_VALIDATION_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      if (inviteValidateTimerRef.current)
        clearTimeout(inviteValidateTimerRef.current);
    };
  }, [inviteToken, isSignUp]);

  function redirectAfterAuth() {
    if (isAuthNavigationPending() || isLeavingRef.current) return;
    isLeavingRef.current = true;
    const target = getRedirectTarget();
    router.startRouteTransition({
      messageContext: "AUTH_FLOW",
      minimumVisibleMs: 120,
    });
    unlockBeforeLeaving()
      .catch((error: unknown) => {
        log.warn("Could not open the encryption keys before leaving sign-in", {
          error,
        });
        return null;
      })
      .then((lock) => {
        clearPendingAuthPassword();
        if (lock) {
          endLockedSession(lock);
          return;
        }
        completeAuthNavigation(target.href);
      })
      .catch((error: unknown) => {
        isLeavingRef.current = false;
        log.error("Failed to leave the sign-in page", { error });
      });
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

  async function handlePasskeyStepUp() {
    if (passkeyLoading) return;
    dispatchChrome({ type: "start-passkey-auth" });

    const verifyPasskey = async () => {
      const result = await authClient.signIn.passkey();

      if (result?.error) {
        if (isPasskeyAuthCancelled(result.error)) {
          dispatchChrome({
            type: "set-notice",
            notice: "Passkey authentication was cancelled.",
          });
          dispatchChrome({ type: "finish-passkey-auth" });
          return;
        }

        log.error("Passkey login failed:", result.error);
        dispatchChrome({
          type: "set-error",
          error:
            result.error.message ||
            "Passkey authentication failed. Try again.",
        });
        dispatchChrome({ type: "finish-passkey-auth" });
        return;
      }

      const authStatus = await waitForSettledAuthStatusForLogin();

      if (authStatus?.authenticated && authStatus.requiresPasskeyStepUp) {
        dispatchChrome({
          type: "set-error",
          error: "Passkey verification is still required. Try again.",
        });
        dispatchChrome({ type: "finish-passkey-auth" });
        return;
      }

      redirectAfterAuth();
      dispatchChrome({ type: "finish-passkey-auth" });
    };
    await verifyPasskey().catch((error: unknown) => {
      if (isPasskeyAuthCancelled(error)) {
        dispatchChrome({
          type: "set-notice",
          notice: "Passkey authentication was cancelled.",
        });
        dispatchChrome({ type: "finish-passkey-auth" });
        return;
      }

      log.error("Passkey login failed:", error);
      dispatchChrome({
        type: "set-error",
        error: getErrorMessage(
          error,
          "Passkey authentication failed. Try again.",
        ),
      });
      dispatchChrome({ type: "finish-passkey-auth" });
    });
  }

  function triggerAutoPasskeyStepUp() {
    hasAutoPromptedStepUpRef.current = true;
    dispatchChrome({
      type: "set-notice",
      notice: "Check your device to finish signing in with your passkey.",
    });
    void handlePasskeyStepUp();
  }

  const handleSessionRedirect = useEffectEvent(
    async (isCancelled: () => boolean) => {
      if (isAuthNavigationPending() || emailLoading || passkeyLoading) return;
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

      if (isCancelled()) return;

      if (reconciliation.status === "recovered") {
        await refetchSession?.({
          query: { disableCookieCache: true },
        });
        if (isCancelled()) return;
        setLoginSessionUi({
          overlayVisible: false,
          overlayFading: true,
          requiresPasskeyStepUp: false,
        });
        hasAutoPromptedStepUpRef.current = false;
        return;
      }

      if (reconciliation.status === "unauthenticated") {
        return;
      }

      const authStatus = await waitForSettledAuthStatusForLogin({
        allowPasskeyStepUp: true,
      });
      if (isCancelled()) return;
      const requiresStepUp = Boolean(
        authStatus?.authenticated && authStatus.requiresPasskeyStepUp,
      );
      const awaitingStepUpStatus =
        stepUpRequired &&
        (!authStatus ||
          (authStatus.authenticated && authStatus.requiresPasskeyStepUp));

      if (requiresStepUp || awaitingStepUpStatus) {
        setLoginSessionUi({
          overlayVisible: false,
          overlayFading: true,
          requiresPasskeyStepUp: true,
        });

        if (!hasAutoPromptedStepUpRef.current) {
          if (isPasskeySupported) {
            triggerAutoPasskeyStepUp();
          } else {
            dispatchChrome({
              type: "set-notice",
              notice:
                "This device still needs to verify your passkey. Continue from a device that can complete passkey verification.",
            });
          }
        }
        return;
      }

      redirectAfterAuth();
    },
  );

  const sessionUserId = session?.user?.id ?? null;
  const sessionId = session?.session?.id ?? null;
  useEffect(() => {
    if (!isPending && !emailLoading && !passkeyLoading) {
      let cancelled = false;
      queueMicrotask(() => {
        if (cancelled) {
          return;
        }
        void handleSessionRedirect(() => cancelled).catch((error) => {
          log.error("Session redirect check failed:", error);
        });
      });
      return () => {
        cancelled = true;
      };
    }
  }, [sessionUserId, sessionId, isPending, emailLoading, passkeyLoading]);

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

  // The first title is already painted (SSR); only a switch of auth mode animates it in.
  const animatedAuthModeRef = useRef(authMode);
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el || animatedAuthModeRef.current === authMode) return;
    animatedAuthModeRef.current = authMode;
    const animation = slideFadeIn(el, { y: 8 }, {
      duration: 220,
      easing: MOTION_EASING.soft,
    });
    return () => animation?.cancel();
  }, [authMode]);

  async function finalizePasswordAuth(submittedPassword: string) {
    storePendingAuthPassword(submittedPassword);

    // The credential response is authoritative. Auth status is a non-destructive follow-up used only to decide whether passkey step-up is required; a delayed or unavailable status endpoint must not undo login.
    const authStatus = await waitForSettledAuthStatusForLogin({
      allowPasskeyStepUp: true,
    });

    if (authStatus?.authenticated && authStatus.requiresPasskeyStepUp) {
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

    redirectAfterAuth();
    return true;
  }

  async function resolveAvailableSignupEmail(rawDesiredEmail: string) {
    const normalizedDesiredEmail = normalizeFormValue(rawDesiredEmail);

    if (!normalizedDesiredEmail) {
      failField("desired-email", `Choose your @${signupDomain} email.`);
      return null;
    }

    const availability = await accountApiService.checkEmailAvailability(
      normalizedDesiredEmail,
    );

    if (!availability.available) {
      failField("desired-email", availability.message);
      return null;
    }

    return availability;
  }

  async function claimRequiredInvite(normalizedEmail: string) {
    const trimmedToken = inviteToken.trim();
    if (!trimmedToken) {
      failField(
        "invite-token",
        "Enter the invite token shared with you to create an account.",
      );
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
    if (emailLoading) return;
    const normalizedEmail = normalizeFormValue(email);
    const trimmedName = name.trim();

    if (!password) {
      failField("password", "Enter your password.");
      return;
    }

    dispatchChrome({ type: "start-email-auth" });

    if (isSignUp) {
      if (!trimmedName) {
        failField("name", "Enter your name.");
        dispatchChrome({ type: "finish-email-auth" });
        return;
      }

      if (!meetsMinPasswordRequirements(password)) {
        failField(
          "password",
          "Choose a password that meets every requirement below.",
        );
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

      storePendingAuthPassword(password);
      const signUpResult = await signUp.email({
        email: availability.normalizedEmail,
        password,
        name: trimmedName,
      });

      if (signUpResult?.error) {
        clearPendingAuthPassword();
        dispatchChrome({
          type: "set-error",
          error:
            signUpResult.error.message ||
            "Unable to create your account. Try again.",
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
        failField("email", "Enter your account email address.");
        dispatchChrome({ type: "finish-email-auth" });
        return;
      }

      clearOrphanedClientAuthArtifacts();

      storePendingAuthPassword(password);
      let signInResult: Awaited<ReturnType<typeof signIn.email>> | undefined;
      try {
        signInResult = await signIn.email({
          email: normalizedEmail,
          password,
        });
      } catch (err) {
        const recoveredSession =
          await findAuthenticatedSessionForEmail(normalizedEmail);

        if (!recoveredSession) {
          clearPendingAuthPassword();
          log.error("Email auth failed:", err);
          dispatchChrome({
            type: "set-error",
            error: getErrorMessage(
              err,
              "Unable to sign in. Check your connection and try again.",
            ),
          });
          dispatchChrome({ type: "finish-email-auth" });
          return;
        }
      }

      if (signInResult?.error) {
        const recoveredSession =
          await findAuthenticatedSessionForEmail(normalizedEmail);

        if (!recoveredSession) {
          clearPendingAuthPassword();
          dispatchChrome({
            type: "set-error",
            error:
              signInResult.error.message ||
              "Email or password is incorrect. Check both and try again.",
          });
          dispatchChrome({ type: "finish-email-auth" });
          return;
        }
      }
    }

    try {
      await finalizePasswordAuth(password);
    } catch (err) {
      log.error("Email auth failed:", err);
      dispatchChrome({
        type: "set-error",
        error: getErrorMessage(
          err,
          "Unable to sign in. Check your connection and try again.",
        ),
      });
    }

    dispatchChrome({ type: "finish-email-auth" });
  };

  const title = isSignUp
    ? "Create an account"
    : requiresPasskeyStepUp
      ? "Verify your passkey"
      : "Welcome back";

  const subtitle = isSignUp
    ? `Choose your @${signupDomain} Solace email and password. Your Solace email becomes both your account address and mailbox, and this password is used locally to protect your encrypted mail vault.`
    : requiresPasskeyStepUp
      ? "This device still needs to verify a passkey registered on another device."
      : "Sign in with your email and password. If your account has passkeys, you'll verify with one right after.";

  const primaryButtonLabel = isSignUp ? "Create account" : "Sign in";

  const primaryLoadingLabel = isSignUp ? "Creating account…" : "Signing in…";

  return (
    <>
      <main className="flex min-h-[100dvh]">
        <div className="relative flex w-full flex-col justify-center px-6 py-10 sm:px-12 lg:w-1/2 lg:px-16 xl:px-24">
          <div className="relative z-10 mx-auto w-full max-w-md">
            <div className="mb-10 flex items-center justify-between">
              <Logo
                width={44}
                height={44}
                className="text-accent"
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
              <div role="status">
                {notice ? (
                  <div className="mb-5 rounded-lg border border-secondary/20 bg-secondary/10 p-3">
                    <p className="text-sm text-foreground">{notice}</p>
                  </div>
                ) : null}
              </div>

              <div id="login-error" role="alert">
                {error ? (
                  <div className="mb-5 rounded-lg border border-destructive/20 bg-destructive/10 p-3">
                    <p className="text-sm text-destructive">{error}</p>
                  </div>
                ) : null}
              </div>

              <form onSubmit={handleEmailAuth} className="space-y-5">
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
                      readOnly={emailLoading}
                      className="h-11 rounded-lg"
                      {...fieldErrorProps("name")}
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
                          ? "border-input-border"
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
                        readOnly={emailLoading}
                        className="h-full flex-1 rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                        {...fieldErrorProps(
                          "desired-email",
                          "desired-email-hint",
                          emailAvailability?.available === false,
                        )}
                      />
                      <span className="flex items-center border-l border-input px-3 text-sm text-muted-foreground">
                        @{signupDomain}
                      </span>
                    </div>
                    {emailChecking && (
                      <p id="desired-email-hint" className="text-xs text-muted-foreground">
                        Checking availability…
                      </p>
                    )}
                    {!emailChecking && emailAvailability !== null && (
                      <p
                        id="desired-email-hint"
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
                      <p id="desired-email-hint" className="text-xs text-muted-foreground">
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
                      <Ticket
                        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                      />
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
                        readOnly={emailLoading}
                        {...fieldErrorProps(
                          "invite-token",
                          "invite-token-hint",
                          inviteValidation?.valid === false,
                        )}
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
                      <p id="invite-token-hint" className="text-xs text-muted-foreground">
                        Validating token…
                      </p>
                    )}
                    {!inviteValidating && inviteValidation !== null && (
                      <p
                        id="invite-token-hint"
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
                      <p id="invite-token-hint" className="text-xs text-muted-foreground">
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
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder={`you@${signupDomain}`}
                      value={email}
                      onChange={(e) =>
                        dispatchFields({
                          type: "set-email",
                          email: e.target.value,
                        })
                      }
                      required={!isSignUp}
                      readOnly={emailLoading}
                      className="h-11 rounded-lg"
                      {...fieldErrorProps("email")}
                    />
                  </div>
                </AnimatedCollapse>

                <div className="space-y-2 pb-0.5">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="password" className="text-sm font-medium">
                      Password
                    </Label>
                    {!isSignUp ? (
                      <button
                        type="button"
                        onClick={() =>
                          dispatchChrome({
                            type: "set-notice",
                            notice: FORGOT_PASSWORD_NOTICE,
                          })
                        }
                        className="text-xs font-medium text-accent transition-colors hover:text-accent/80"
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
                      required
                      readOnly={emailLoading}
                      className="h-11 rounded-lg pr-10"
                      {...fieldErrorProps(
                        "password",
                        isSignUp ? "password-hint" : undefined,
                      )}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        dispatchFields({ type: "toggle-show-password" })
                      }
                      className="absolute right-1.5 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="size-4" aria-hidden="true" />
                      ) : (
                        <Eye className="size-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {isSignUp && password.length > 0 && (
                    <PasswordRequirements password={password} />
                  )}
                  {isSignUp && password.length === 0 && (
                    <p id="password-hint" className="text-xs text-muted-foreground">
                      Min. 8 characters with uppercase, lowercase, number
                      &amp; special character.
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  aria-disabled={emailLoading}
                  className="mt-2 h-11 w-full rounded-lg font-medium"
                  aria-busy={emailLoading}
                >
                  {emailLoading ? (
                    <>
                      <div
                        className="size-4 animate-spin rounded-full border-2 border-accent-foreground/30 border-t-accent-foreground"
                        aria-hidden="true"
                      />
                      <span>{primaryLoadingLabel}</span>
                    </>
                  ) : (
                    <>
                      <span>{primaryButtonLabel}</span>
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </>
                  )}
                </Button>
              </form>

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
                      aria-disabled={passkeyLoading}
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
                          <Key className="size-4" aria-hidden="true" />
                          <span>Use passkey</span>
                        </>
                      )}
                    </Button>
                  </>
                ) : null}
              </div>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                {isSignUp
                  ? "Already have an account?"
                  : "Don't have an account?"}{" "}
                <button
                  type="button"
                  onClick={() => switchMode(isSignUp ? "sign-in" : "sign-up")}
                  className="font-medium text-accent underline underline-offset-4 transition-colors hover:text-accent/80"
                >
                  {isSignUp ? "Sign in" : "Sign up"}
                </button>
              </p>

              <p className="mt-6 text-center text-xs text-muted-foreground">
                Before continuing, read Solace&apos;s{" "}
                <Link
                  href="/privacy"
                  className="font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
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
              alt=""
              className="size-full object-cover"
              fill
              sizes="50vw"
              loading="eager"
              unoptimized
            />
            {/* repo-rules-allow theme-tokens-only: photo scrim over the wallpaper image for depth, not a styled UI surface. */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />
          </div>
        </div>
      </main>

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
