"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createLogger } from "@workspace/logger";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { KeyRound, RefreshCw, Shield } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import {
  ensureE2eeBootstrap,
  resetE2eeBootstrap,
  unlockE2eeWithPassword,
} from "@/lib/e2ee-bootstrap";
import { resetEncryptionPasswordForActiveSession } from "@/lib/e2ee-password-reset";
import {
  clearPendingAuthPassword,
  consumePendingAuthPassword,
} from "@/lib/e2ee-password-cache";

const log = createLogger("e2ee-bootstrap");

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
      clearPendingAuthPassword();
      setMode("hidden");
      setPassword("");
      setConfirmPassword("");
      setError(null);

      if (previousUserId) {
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
    setError(null);

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
          const pendingPassword = consumePendingAuthPassword();

          if (pendingPassword) {
            setIsSubmitting(true);

            try {
              const stored = await resetEncryptionPasswordForActiveSession(
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
              log.warn("Failed to refresh encrypted data for password setup", {
                userId,
                error: setupError,
              });
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
      await refreshEncryptedQueries(queryClient);
    } catch (setupError) {
      log.warn("Failed to refresh encrypted data for password setup", {
        userId,
        error: setupError,
      });
      setError("Could not save your encryption password and refresh encrypted data.");
    } finally {
      setIsSubmitting(false);
    }
  }, [confirmPassword, password, queryClient, userId]);

  const handleUnlock = useCallback(async () => {
    if (!userId) {
      return;
    }

    if (!password) {
      setError("Enter your encryption password.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const unlocked = await unlockE2eeWithPassword(userId, password);

      if (!unlocked) {
        setError("That password did not unlock your encrypted data.");
        return;
      }

      setMode("hidden");
      setPassword("");
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
  }, [password, queryClient, userId]);

  if (mode === "hidden") {
    return null;
  }

  const title =
    mode === "unlock"
      ? "Unlock encrypted data"
      : mode === "legacy"
        ? "Finish encryption migration"
        : "Protect your encryption keys";

  const description =
    mode === "unlock"
      ? "Enter the password that wraps your end-to-end encryption keys on this device."
      : mode === "legacy"
        ? "This account still uses the older device-only key flow. Open a device that can already decrypt your data, sign in there, and set an encryption password once."
        : "Choose a password that wraps your encryption keys so you can unlock them on other devices after sign-in.";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-border/60 bg-card/95 p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {mode === "unlock" ? (
              <KeyRound className="h-5 w-5" />
            ) : (
              <Shield className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>

        {mode === "legacy" ? (
          <div className="mt-6 space-y-4">
            {error ? (
              <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button
              type="button"
              className="w-full"
              onClick={rerunBootstrap}
              disabled={isSubmitting}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="e2ee-password">Encryption password</Label>
              <Input
                id="e2ee-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "unlock" ? "current-password" : "new-password"}
                autoFocus
                disabled={isSubmitting}
              />
            </div>

            {mode === "setup" ? (
              <div className="space-y-2">
                <Label htmlFor="e2ee-password-confirm">Confirm password</Label>
                <Input
                  id="e2ee-password-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  disabled={isSubmitting}
                />
              </div>
            ) : null}

            {error ? (
              <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <div className="flex gap-3">
              {mode === "unlock" ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={rerunBootstrap}
                  disabled={isSubmitting}
                >
                  Refresh
                </Button>
              ) : null}
              <Button
                type="button"
                className="flex-1"
                onClick={mode === "unlock" ? handleUnlock : handleSetup}
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? "Working..."
                  : mode === "unlock"
                    ? "Unlock"
                    : "Save password"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}