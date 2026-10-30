"use client";

import type { Dispatch } from "react";

import { AnimatedCollapse } from "@workspace/ui/components/ui/animated-collapse";

import { FieldInput } from "./account-settings-field-input";
import { InlineMessage } from "./account-settings-inline-message";
import { submitAccountSecurityPassword } from "./account-settings-security-submit";
import type {
  SecurityForm,
  SecurityUiAction,
  SecurityUiState,
} from "./account-settings-ui-state";
import { PaletteButton, PaletteFormActions } from "./palette-ui";

export function AccountSecurityForm({
  security,
  dispatch,
  activeForm,
  submission,
  handleChangePassword,
}: {
  security: SecurityUiState;
  dispatch: Dispatch<SecurityUiAction>;
  activeForm: SecurityForm;
  submission: { busy: boolean };
  handleChangePassword: (values: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<void>;
}) {
  if (!activeForm) return null;

  return (
    <AnimatedCollapse isOpen>
      <form
        action={async () => {
          await submitAccountSecurityPassword({
            security,
            dispatch,
            handleChangePassword,
          });
        }}
      >
        {security.message ? (
          <div className="px-2 py-1">
            <InlineMessage msg={security.message} />
          </div>
        ) : null}
        <p className="p-2 text-[13px] leading-[130%] text-muted-foreground">
          Update your sign-in password. It also unlocks your encrypted data, so
          your keys are rewrapped to the new one.
        </p>
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
        <FieldInput
          label="New password"
          type="password"
          value={security.newPassword}
          onChange={(value) =>
            dispatch({ type: "setField", field: "newPassword", value })
          }
          autoComplete="new-password"
          disabled={submission.busy}
        />
        <FieldInput
          label="Confirm new password"
          type="password"
          value={security.confirmPassword}
          onChange={(value) =>
            dispatch({ type: "setField", field: "confirmPassword", value })
          }
          autoComplete="new-password"
          disabled={submission.busy}
        />
        <PaletteFormActions>
          <PaletteButton
            variant="ghost"
            onClick={() => dispatch({ type: "cancelForm" })}
            disabled={submission.busy}
          >
            Cancel
          </PaletteButton>
          <PaletteButton
            type="submit"
            variant="primary"
            loading={submission.busy}
          >
            {submission.busy ? "Saving…" : "Update Password"}
          </PaletteButton>
        </PaletteFormActions>
      </form>
    </AnimatedCollapse>
  );
}
