"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createLogger } from "@workspace/logger";
import { Button } from "@workspace/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { VisuallyHidden } from "@workspace/ui/components/ui/visually-hidden";
import { KeyRound, LogOut, Shield } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import {
  ensureE2eeBootstrap,
  resetE2eeBootstrap,
  unlockE2eeWithPassword,
} from "@/lib/e2ee-bootstrap";
import { resetEncryptionPasswordForActiveSession } from "@/lib/e2ee-password-reset";
import {
  clearAuthPasswords,
  clearPendingAuthPassword,
  consumePendingAuthPassword,
  peekCachedAuthPassword,
  peekPendingAuthPassword,
} from "@/lib/e2ee-password-cache";
import {
  clearEncPasswordCookie,
  initEncPasswordFromCookie,
  setEncPasswordCookie,
} from "@/lib/enc-password-cookie";
import { signOut } from "@/lib/auth-client";

const log = createLogger("e2ee-bootstrap");
const PASSWORD_SETUP_RETRY_ATTEMPTS = 4;

type GateMode = "hidden" | "setup" | "unlock" | "legacy";

function clearCalendarQueries(
  queryClient: ReturnType<typeof useQueryClient>,
): void {
  queryClient.removeQueries({ queryKey: ["events"] });
  queryClient.removeQueries({ queryKey: ["calendars"] });
  queryClient.removeQueries({ queryKey: ["categories"] });
  queryClient.removeQueries({ queryKey: ["settings"] });
}

async function refreshEncryptedQueries(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["events"] }),
    queryClient.invalidateQueries({ queryKey: ["calendars"] }),
    queryClient.invalidateQueries({ queryKey: ["categories"] }),
  ]);
}

async function retryEncryptionPasswordSetup(
  userId: string,
  password: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < PASSWORD_SETUP_RETRY_ATTEMPTS; attempt += 1) {
    const stored = await resetEncryptionPasswordForActiveSession(
      userId,
      password,
    );

    if (stored) {
      return true;
    }

    if (attempt < PASSWORD_SETUP_RETRY_ATTEMPTS - 1) {
      await Promise.resolve();
    }
  }

  return false;
}

export function E2eeBootstrap() {
  const queryClient = useQueryClient();
  const { data: session, isPending } = useSession();
  const userId = session?.user?.id;
  const previousUserIdRef = useRef<string | null>(null);
  const [mode, setMode] = useState<GateMode>("hidden");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Track whether the current session started with email/password login so
  // we can show the right messaging in the encryption gate dialogs.
  const [isEmailPasswordUser, setIsEmailPasswordUser] = useState(false);

  const rerunBootstrap = useCallback(() => {
    setReloadKey((current) => current + 1);
  }, []);

  useEffect(() => {
    if (isPending) {
      return;
    }

    const previousUserId = previousUserIdRef.current;

    if (!userId) {
      resetE2eeBootstrap();
      queueMicrotask(() => {
        setMode("hidden");
        setPassword("");
        setConfirmPassword("");
        setError(null);
        setIsEmailPasswordUser(false);
      });

      if (previousUserId) {
        clearAuthPasswords();
        clearEncPasswordCookie();
        clearCalendarQueries(queryClient);
      }

      previousUserIdRef.current = null;
      return;
    }

    if (previousUserId && previousUserId !== userId) {
      resetE2eeBootstrap();
      clearCalendarQueries(queryClient);
    }

    previousUserIdRef.current = userId;

    let isCancelled = false;
    queueMicrotask(() => {
      if (!isCancelled) {
        setError(null);
      }
    });

    void (async () => {
      // Restore password from the encrypted cookie so cross-tab and
      // post-refresh visits work without re-prompting the user.
      await initEncPasswordFromCookie();
      if (isCancelled) return;

      // Peek (without consuming) to know whether this was an email/password login.
      // bootstrapUser in e2ee-bootstrap.ts may consume it during auto-unlock, so
      // we capture the information here before the bootstrap runs.
      const hadPendingPassword =
        !!peekPendingAuthPassword() || !!peekCachedAuthPassword();
      setIsEmailPasswordUser(hadPendingPassword);

      void ensureE2eeBootstrap(userId)
        .then(async (result) => {
          if (isCancelled) {
            return;
          }

          if (result.activated) {
            await refreshEncryptedQueries(queryClient);
          }

          if (!result.bootstrap) {
            setMode("hidden");
            return;
          }

          if (result.activated && !result.bootstrap.passwordEnvelope) {
            const pendingPassword =
              consumePendingAuthPassword() ?? peekCachedAuthPassword();

            if (pendingPassword) {
              setIsSubmitting(true);

              try {
                const stored = await retryEncryptionPasswordSetup(
                  userId,
                  pendingPassword,
                );

                if (isCancelled) {
                  return;
                }

                if (stored) {
                  setMode("hidden");
                  await refreshEncryptedQueries(queryClient);
                  return;
                }
              } catch (setupError) {
                log.warn(
                  "Failed to refresh encrypted data for password setup",
                  {
                    userId,
                    error: setupError,
                  },
                );
              } finally {
                if (!isCancelled) {
                  setIsSubmitting(false);
                }
              }
            }

            setMode("setup");
            return;
          }

          if (result.activated) {
            setMode("hidden");
            return;
          }

          if (result.bootstrap.passwordEnvelope) {
            setMode("unlock");
            return;
          }

          if (result.bootstrap.devices.length > 0) {
            setMode("legacy");
            return;
          }

          setMode("hidden");
        })
        .catch((bootstrapError) => {
          if (isCancelled) {
            return;
          }

          log.warn("Failed to initialize E2EE bootstrap", {
            userId,
            error: bootstrapError,
          });
        });
    })();

    return () => {
      isCancelled = true;
    };
  }, [isPending, queryClient, reloadKey, userId]);

  const handleSetup = useCallback(async () => {
    if (!userId) {
      return;
    }

    if (password.length < 8) {
      setError("Use at least 8 characters for your encryption password.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const stored = await resetEncryptionPasswordForActiveSession(
        userId,
        password,
      );

      if (!stored) {
        throw new Error("Encryption session is not ready on this device.");
      }

      setMode("hidden");
      setPassword("");
      setConfirmPassword("");
      void setEncPasswordCookie(password);
      await refreshEncryptedQueries(queryClient);
    } catch (setupError) {
      log.warn("Failed to refresh encrypted data for password setup", {
        userId,
        error: setupError,
      });
      setError(
        "Could not save your encryption password and refresh encrypted data.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [confirmPassword, password, queryClient, userId]);

  const handleUnlock = useCallback(async () => {
    if (!userId) {
      return;
    }

    if (!password) {
      setError(
        isEmailPasswordUser
          ? "Enter your email sign-in password."
          : "Enter your encryption password.",
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const unlocked = await unlockE2eeWithPassword(userId, password);

      if (!unlocked) {
        setError(
          isEmailPasswordUser
            ? "That password didn't match. If you recently changed your email sign-in password, use your previous one here."
            : "That password did not unlock your encrypted data.",
        );
        return;
      }

      setMode("hidden");
      setPassword("");
      void setEncPasswordCookie(password);
      await refreshEncryptedQueries(queryClient);
    } catch (unlockError) {
      log.warn("Failed to unlock E2EE password envelope", {
        userId,
        error: unlockError,
      });
      setError("Could not unlock your encrypted data. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }, [isEmailPasswordUser, password, queryClient, userId]);

  const handleSignOut = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      clearAuthPasswords();
      await signOut();
    } catch (signOutError) {
      log.warn("Failed to sign out from encryption gate", {
        userId,
        error: signOutError,
      });
    } finally {
      window.location.href = "/";
    }
  }, [userId]);

  if (mode === "hidden") {
    return null;
  }

  const isUnlock = mode === "unlock";
  const isLegacy = mode === "legacy";

  const title = isUnlock
    ? "Unlock encrypted data"
    : isLegacy
      ? "Finish encryption migration"
      : "Protect your encryption keys";

  const description = isUnlock
    ? isEmailPasswordUser
      ? "Solace normally reuses your email sign-in password to unlock encrypted data on this device. If that did not finish automatically, enter the same password here. If you recently changed it, use your previous password."
      : "Enter your encryption password to unlock encrypted data on this device."
    : isLegacy
      ? "This account still uses the older device-only key flow. Open a device that can already decrypt your data, sign in there, and save an encryption password once."
      : isEmailPasswordUser
        ? "Solace normally reuses your email sign-in password to protect your encryption keys. Re-enter it below only if automatic setup did not finish."
        : "Choose an encryption password to protect your end-to-end encryption keys for recovery and legacy device flows.";

  const Icon = isUnlock ? KeyRound : Shield;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || isLegacy) {
      return;
    }
    if (isUnlock) {
      void handleUnlock();
    } else {
      void handleSetup();
    }
  };

  const primaryLabel = isSubmitting
    ? "Working..."
    : isUnlock
      ? "Unlock"
      : isLegacy
        ? "Retry"
        : "Save password";

  const passwordLabel = isUnlock
    ? isEmailPasswordUser
      ? "Email sign-in password"
      : "Encryption password"
    : isEmailPasswordUser
      ? "Email sign-in password"
      : "Encryption password";

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        variant="spotlight"
        showClose={false}
        aria-describedby={undefined}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="overflow-hidden p-0 bg-popover border-border/50 shadow-2xl"
      >
        <VisuallyHidden>
          <DialogTitle>{title}</DialogTitle>
        </VisuallyHidden>

        <form onSubmit={handleSubmit} className="flex flex-col">
          {/* Header — command palette style */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
            <div className="flex items-center justify-center size-6 rounded-md bg-primary/10 shrink-0">
              <Icon className="size-3.5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium leading-tight truncate">
                {title}
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="px-4 py-3 space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {description}
            </p>

            {!isLegacy ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="e2ee-password"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    {passwordLabel}
                  </Label>
                  <Input
                    id="e2ee-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={
                      isUnlock ? "current-password" : "new-password"
                    }
                    disabled={isSubmitting}
                    className="h-9"
                  />
                </div>

                {mode === "setup" ? (
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="e2ee-password-confirm"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Confirm password
                    </Label>
                    <Input
                      id="e2ee-password-confirm"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
                      autoComplete="new-password"
                      disabled={isSubmitting}
                      className="h-9"
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <p
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {error}
              </p>
            ) : null}
          </div>

          {/* Footer — command palette style */}
          <div className="px-3 py-2 border-t border-border/50 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground hidden sm:flex items-center gap-1.5">
              {isLegacy ? (
                <>End-to-end encrypted</>
              ) : (
                <>
                  <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
                    Enter
                  </kbd>
                  to {isUnlock ? "unlock" : "save"}
                </>
              )}
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                disabled={isSubmitting}
                className="h-8"
              >
                <LogOut className="mr-1.5 size-3.5" />
                Sign out
              </Button>
              {isLegacy ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={rerunBootstrap}
                  disabled={isSubmitting}
                  className="h-8"
                >
                  {primaryLabel}
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting}
                  className="h-8"
                >
                  {primaryLabel}
                </Button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
