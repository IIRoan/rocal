"use client";

import { useReducer } from "react";

import { InlineMessage } from "./account-settings-inline-message";
import { AccountSecurityActions } from "./account-settings-security-actions";
import type { SecurityAccessKind } from "./account-settings-types";
import { AccountSecurityForm } from "./account-settings-security-form";
import {
  initialSecurityUiState,
  securityUiReducer,
} from "./account-settings-ui-state";
import { PaletteSection } from "./palette-ui";

export function AccountSecuritySection({
  isBusy,
  hasPasswordAccount,
  hasOAuthAccount,
  changingPassword,
  settingPassword,
  handleChangePassword,
  handleSetPassword,
}: {
  isBusy: boolean;
  hasPasswordAccount: boolean;
  hasOAuthAccount: boolean;
  changingPassword: boolean;
  settingPassword: boolean;
  handleChangePassword: (values: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<void>;
  handleSetPassword?: (values: { newPassword: string }) => Promise<void>;
}) {
  const [security, dispatch] = useReducer(
    securityUiReducer,
    initialSecurityUiState,
  );

  const isAnySecurityFormOpen = security.activeForm !== null;
  const securityFormBusy = changingPassword || settingPassword;
  const accessKind: SecurityAccessKind =
    hasOAuthAccount && hasPasswordAccount
      ? "oauth-and-password"
      : hasOAuthAccount
        ? "oauth-only"
        : hasPasswordAccount
          ? "password"
          : "none";

  return (
    <PaletteSection label="Security">
      {security.message && !isAnySecurityFormOpen ? (
        <div className="px-2 py-1">
          <InlineMessage msg={security.message} />
        </div>
      ) : null}
      <AccountSecurityActions
        accessKind={accessKind}
        busy={isBusy}
        formOpen={isAnySecurityFormOpen}
        onOpenForm={(form) => dispatch({ type: "openForm", form })}
      />
      <AccountSecurityForm
        security={security}
        dispatch={dispatch}
        activeForm={security.activeForm}
        submission={{ busy: securityFormBusy }}
        handlers={{
          handleChangePassword,
          handleSetPassword,
        }}
      />
    </PaletteSection>
  );
}
