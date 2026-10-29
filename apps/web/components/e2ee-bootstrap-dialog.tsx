"use client";

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
import type { E2eeGateState, GateMode } from "./e2ee-bootstrap-gate-state";

type E2eeBootstrapDialogProps = {
  gate: E2eeGateState;
  onPasswordChange: (password: string) => void;
  onConfirmPasswordChange: (confirmPassword: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onSignOut: () => void;
};

function getGateCopy(mode: GateMode) {
  const isUnlock = mode === "unlock";

  return {
    title: isUnlock ? "Unlock encrypted data" : "Protect your encryption keys",
    description: isUnlock
      ? "This device needs your password to open your encrypted data. If you changed it recently, enter the previous one."
      : "Solace reuses your email sign-in password to protect your encryption keys. Re-enter it below only if automatic setup did not finish.",
    passwordLabel: isUnlock ? "Password" : "Email sign-in password",
    primaryLabel: isUnlock ? "Unlock" : "Save password",
    Icon: isUnlock ? KeyRound : Shield,
    isUnlock,
  };
}

export function E2eeBootstrapDialog({
  gate,
  onPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
  onSignOut,
}: E2eeBootstrapDialogProps) {
  const { mode, password, confirmPassword, error, isSubmitting } = gate;
  const { title, description, passwordLabel, primaryLabel, Icon, isUnlock } =
    getGateCopy(mode);

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

        <form onSubmit={onSubmit} className="flex flex-col">
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

          <div className="px-4 py-3 space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {description}
            </p>

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
                  onChange={(event) => onPasswordChange(event.target.value)}
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
                      onConfirmPasswordChange(event.target.value)
                    }
                    autoComplete="new-password"
                    disabled={isSubmitting}
                    className="h-9"
                  />
                </div>
              ) : null}
            </div>

            {error ? (
              <p
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {error}
              </p>
            ) : null}
          </div>

          <div className="px-3 py-2 border-t border-border/50 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground hidden sm:flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
                Enter
              </kbd>
              to {isUnlock ? "unlock" : "save"}
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onSignOut}
                disabled={isSubmitting}
                className="h-8"
              >
                <LogOut className="mr-1.5 size-3.5" />
                Sign out
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting}
                className="h-8"
              >
                {isSubmitting ? "Working..." : primaryLabel}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
