"use client";

import { useId, useReducer } from "react";
import { recoverAccount, recoveryPost } from "@workspace/calendar-client";
import { getErrorMessage } from "@workspace/calendar-core";
import {
  FORGOT_PASSWORD_NOTICE,
  RECOVERY_KIT_USED_NOTICE,
} from "@workspace/calendar-core/product-info";
import { Button } from "@workspace/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { Switch } from "@workspace/ui/components/ui/switch";
import { toast } from "@workspace/ui/lib/toast";
import { authClient } from "@/lib/auth-client";
import { e2eeModule } from "@/lib/e2ee-crypto";

const post = recoveryPost((path, options) => authClient.$fetch(path, options));

type Field = "email" | "recoveryKey" | "newPassword" | "confirmPassword";

type FormState = Record<Field, string> & {
  removePasskeys: boolean;
  error: string | null;
  pending: boolean;
};

type FormAction =
  | { type: "edit"; field: Field; value: string }
  | { type: "remove-passkeys"; value: boolean }
  | { type: "submit" }
  | { type: "fail"; error: string };

function reducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "edit":
      return { ...state, [action.field]: action.value, error: null };
    case "remove-passkeys":
      return { ...state, removePasskeys: action.value };
    case "submit":
      return { ...state, error: null, pending: true };
    case "fail":
      return { ...state, error: action.error, pending: false };
  }
}

function formError(form: FormState): string | null {
  if (!form.email.trim() || !form.recoveryKey.trim()) {
    return "Enter your account email and recovery key.";
  }
  if (!form.newPassword) return "Choose a new password.";
  if (form.newPassword !== form.confirmPassword) {
    return "New password and confirmation must match.";
  }
  return null;
}

const FIELDS: { field: Field; label: string; type: string; autoComplete: string }[] = [
  { field: "email", label: "Account email", type: "email", autoComplete: "username" },
  { field: "recoveryKey", label: "Recovery key", type: "text", autoComplete: "off" },
  { field: "newPassword", label: "New password", type: "password", autoComplete: "new-password" },
  {
    field: "confirmPassword",
    label: "Confirm new password",
    type: "password",
    autoComplete: "new-password",
  },
];

function RecoverAccountForm({
  initialEmail,
  onCancel,
  onRecovered,
}: {
  initialEmail: string;
  onCancel: () => void;
  onRecovered: (email: string, password: string) => void;
}) {
  const id = useId();
  const [form, dispatch] = useReducer(reducer, {
    email: initialEmail,
    recoveryKey: "",
    newPassword: "",
    confirmPassword: "",
    removePasskeys: false,
    error: null,
    pending: false,
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const invalid = formError(form);
    if (invalid) {
      dispatch({ type: "fail", error: invalid });
      return;
    }
    dispatch({ type: "submit" });
    const email = form.email.trim();
    recoverAccount({
      post,
      e2ee: e2eeModule,
      email,
      recoveryKey: form.recoveryKey,
      newPassword: form.newPassword,
      removePasskeys: form.removePasskeys,
    }).then(
      () => {
        toast(RECOVERY_KIT_USED_NOTICE);
        onRecovered(email, form.newPassword);
      },
      (error: unknown) => {
        dispatch({
          type: "fail",
          error: getErrorMessage(error, "Unable to reset your password. Try again."),
        });
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {FIELDS.map(({ field, label, type, autoComplete }) => (
        <div key={field} className="space-y-1.5">
          <Label htmlFor={`${id}-${field}`} className="text-sm font-medium">
            {label}
          </Label>
          <Input
            id={`${id}-${field}`}
            type={type}
            autoComplete={autoComplete}
            autoCapitalize={field === "recoveryKey" ? "characters" : "none"}
            spellCheck={false}
            value={form[field]}
            onChange={(event) => dispatch({ type: "edit", field, value: event.target.value })}
            readOnly={form.pending}
            aria-invalid={form.error ? true : undefined}
            aria-describedby={form.error ? `${id}-error` : undefined}
            className="h-11 rounded-lg"
          />
        </div>
      ))}
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={`${id}-remove-passkeys`} className="text-sm font-medium">
          Remove passkeys (I lost them)
        </Label>
        <Switch
          id={`${id}-remove-passkeys`}
          checked={form.removePasskeys}
          onCheckedChange={(value) => dispatch({ type: "remove-passkeys", value })}
          disabled={form.pending}
        />
      </div>
      <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
        {form.error}
      </p>
      <p className="text-xs text-muted-foreground">{FORGOT_PASSWORD_NOTICE}</p>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={form.pending}>
          Cancel
        </Button>
        <Button type="submit" aria-busy={form.pending} disabled={form.pending}>
          {form.pending ? "Resetting…" : "Reset password"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** "Forgot password?": resets the password with the recovery kit, keeping every encrypted item readable. */
export function RecoverAccountDialog({
  open,
  onOpenChange,
  initialEmail,
  onRecovered,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialEmail: string;
  onRecovered: (email: string, password: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100dvw-1rem)] sm:w-auto sm:max-w-md">
        <DialogHeader className="pr-12">
          <DialogTitle>Reset your password</DialogTitle>
          <DialogDescription>
            Enter the recovery key you saved. Your encrypted data stays readable, every device is
            signed out, and the key is used up.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <RecoverAccountForm
            initialEmail={initialEmail}
            onCancel={() => onOpenChange(false)}
            onRecovered={onRecovered}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
