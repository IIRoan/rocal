"use client";

import { Loader2 } from "lucide-react";
import type { Dispatch } from "react";

import { AnimatedCollapse, FieldInput, InlineMessage } from "./account-settings-shared";
import { submitAccountSecurityPassword } from "./account-settings-security-submit";
import type { SecurityForm, SecurityUiAction, SecurityUiState } from "./account-settings-ui-state";

const FORM_COPY: Record<
  NonNullable<SecurityForm>,
  { helper: string; newLabel: string; confirmLabel: string; submitLabel: string }
> = {
  "change-password": {
    helper:
      "Update your email sign-in password. After email sign-in, Solace also uses it to protect your encryption keys.",
    newLabel: "New password",
    confirmLabel: "Confirm new password",
    submitLabel: "Update Password",
  },
  "set-password": {
    helper:
      "Add an email sign-in password to this account. This gives you an email/password sign-in option without changing the separate encryption password used by OAuth or passkey sign-in.",
    newLabel: "New password",
    confirmLabel: "Confirm new password",
    submitLabel: "Set Password",
  },
  "reset-encryption": {
    helper:
      "Choose a new encryption password for OAuth or passkey sign-in. This only replaces the password wrapper around your existing encryption keys and does not change your OAuth sign-in method.",
    newLabel: "New encryption password",
    confirmLabel: "Confirm new encryption password",
    submitLabel: "Reset Encryption Password",
  },
};

export function AccountSecurityForm({
  security,
  dispatch,
  activeForm,
  submission,
  handlers,
}: {
  security: SecurityUiState;
  dispatch: Dispatch<SecurityUiAction>;
  activeForm: SecurityForm;
  submission: { busy: boolean };
  handlers: {
    handleChangePassword: (values: {
      currentPassword: string;
      newPassword: string;
    }) => Promise<void>;
    handleSetPassword?: (values: { newPassword: string }) => Promise<void>;
    handleResetEncryptionPassword?: (values: {
      newPassword: string;
    }) => Promise<void>;
  };
}) {
  if (!activeForm) return null;

  const copy = FORM_COPY[activeForm];

  return (
    <AnimatedCollapse isOpen>
      <form
        className="mx-1 my-1 rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3"
        action={async () => {
          await submitAccountSecurityPassword({
            security,
            dispatch,
            activeForm,
            ...handlers,
          });
        }}
      >
        <InlineMessage msg={security.message} />
        <p className="text-xs leading-relaxed text-muted-foreground">
          {copy.helper}
        </p>
        {activeForm === "change-password" ? (
          <FieldInput
            label="Current password"
            type="password"
            value={security.currentPassword}
            onChange={(value) =>
              dispatch({ type: "setField", field: "currentPassword", value })
            }
            autoComplete="current-password"
            disabled={submission.busy}
          />
        ) : null}
        <FieldInput
          label={copy.newLabel}
          type="password"
          value={security.newPassword}
          onChange={(value) =>
            dispatch({ type: "setField", field: "newPassword", value })
          }
          autoComplete="new-password"
          disabled={submission.busy}
        />
        <FieldInput
          label={copy.confirmLabel}
          type="password"
          value={security.confirmPassword}
          onChange={(value) =>
            dispatch({ type: "setField", field: "confirmPassword", value })
          }
          autoComplete="new-password"
          disabled={submission.busy}
        />
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={submission.busy}
            className="inline-flex h-8 items-center gap-2 rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {submission.busy ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                Saving…
              </>
            ) : (
              copy.submitLabel
            )}
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: "cancelForm" })}
            disabled={submission.busy}
            className="inline-flex h-8 items-center rounded-md border border-border bg-background px-4 text-xs font-medium text-foreground transition-colors hover:bg-accent/40 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </form>
    </AnimatedCollapse>
  );
}
