"use client";

import { useReducer } from "react";

import { InlineMessage } from "./account-settings-inline-message";
import { AccountSecurityActions } from "./account-settings-security-actions";
import { AccountSecurityForm } from "./account-settings-security-form";
import {
  initialSecurityUiState,
  securityUiReducer,
} from "./account-settings-ui-state";
import { PaletteSection } from "./palette-ui";

export function AccountSecuritySection({
  isBusy,
  hasPasswordAccount,
  changingPassword,
  handleChangePassword,
}: {
  isBusy: boolean;
  hasPasswordAccount: boolean;
  changingPassword: boolean;
  handleChangePassword: (values: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<void>;
}) {
  const [security, dispatch] = useReducer(
    securityUiReducer,
    initialSecurityUiState,
  );

  const isAnySecurityFormOpen = security.activeForm !== null;

  return (
    <PaletteSection label="Security">
      {security.message && !isAnySecurityFormOpen ? (
        <div className="px-2 py-1">
          <InlineMessage msg={security.message} />
        </div>
      ) : null}
      <AccountSecurityActions
        hasPasswordAccount={hasPasswordAccount}
        busy={isBusy}
        formOpen={isAnySecurityFormOpen}
        onOpenForm={(form) => dispatch({ type: "openForm", form })}
      />
      <AccountSecurityForm
        security={security}
        dispatch={dispatch}
        activeForm={security.activeForm}
        submission={{ busy: changingPassword }}
        handleChangePassword={handleChangePassword}
      />
    </PaletteSection>
  );
}
