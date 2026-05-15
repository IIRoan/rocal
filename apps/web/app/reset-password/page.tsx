"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { createLogger } from "@workspace/logger";
import { authClient } from "@/lib/auth-client";
import { Logo, ThemeToggle } from "@workspace/ui/components/layout";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";

const log = createLogger("reset-password");

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message;
  }

  return "Unable to reset your password.";
}

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const resetError = searchParams.get("error");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unavailableMessage = useMemo(() => {
    if (resetError === "INVALID_TOKEN") {
      return "This reset link is invalid or has expired. Request a new password reset email.";
    }

    if (!token) {
      return "This reset link is incomplete. Request a new password reset email.";
    }

    return null;
  }, [resetError, token]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError("Missing password reset token.");
      return;
    }

    if (!newPassword.trim()) {
      setError("Please enter a new password.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation must match.");
      return;
    }

    setSubmitting(true);

    try {
      const result = await authClient.resetPassword({
        token,
        newPassword,
      });

      if (result?.error) {
        throw new Error(
          result.error.message || "Unable to reset your password.",
        );
      }

      router.replace("/login?reset=success");
    } catch (submitError) {
      log.error("Password reset failed:", submitError);
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-secondary/20 via-background to-background px-6 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-background/95 p-6 shadow-xl backdrop-blur">
        <div className="mb-8 flex items-center justify-between">
          <Logo
            width={40}
            height={40}
            className="text-primary"
            aria-label="Solace"
          />
          <ThemeToggle />
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Choose a new email sign-in password
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Reset the password you use to sign in to Solace with email.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            If you sign in with email and password, Solace also uses this
            password to protect your encryption keys after you sign in.
          </p>
        </div>

        {unavailableMessage ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3">
            <p className="text-sm text-destructive">{unavailableMessage}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {error ? (
              <div
                className="rounded-lg border border-destructive/20 bg-destructive/10 p-3"
                role="alert"
              >
                <p className="text-sm text-destructive">{error}</p>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="newPassword" className="text-sm font-medium">
                New email sign-in password
              </Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                disabled={submitting}
                className="h-11 rounded-lg"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-medium">
                Confirm new password
              </Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={submitting}
                className="h-11 rounded-lg"
              />
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="h-11 w-full rounded-lg font-medium"
            >
              {submitting ? (
                <>
                  <div
                    className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
                    aria-hidden="true"
                  />
                  <span>Updating password…</span>
                </>
              ) : (
                <>
                  <span>Update password</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link
            href="/login"
            className="font-medium text-primary transition-colors hover:text-primary/80"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </section>
  );
}
