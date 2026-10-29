"use client";

import { useId, useReducer } from "react";
import { getErrorMessage } from "@workspace/calendar-core";
import { Lock } from "lucide-react";
import { InlineMessage } from "./account-settings-inline-message";
import {
  initialSecurityUiState,
  securityUiReducer,
} from "./account-settings-ui-state";
import {
  PaletteButton,
  PaletteField,
  PaletteFormActions,
  PaletteNavRow,
} from "./palette-ui";
import { PALETTE_INPUT_CLASS } from "./palette-styles";

interface PasswordSectionProps {
  hasPasswordAccount: boolean;
  hasOAuthAccount: boolean;
  changingPassword: boolean;
  settingPassword: boolean;
  handleChangePassword: (v: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<void>;
  handleSetPassword?: (v: { newPassword: string }) => Promise<void>;
}

export function PasswordSection({
  hasPasswordAccount,
  hasOAuthAccount,
  changingPassword,
  settingPassword,
  handleChangePassword,
  handleSetPassword,
}: PasswordSectionProps) {
  const fieldId = useId();
  const [security, dispatch] = useReducer(
    securityUiReducer,
    initialSecurityUiState,
  );
  const {
    activeForm,
    currentPassword: currentPwd,
    newPassword: newPwd,
    confirmPassword: confirmPwd,
    message: msg,
  } = security;
  const setMsg = (message: typeof msg) =>
    dispatch({ type: "setMessage", message });

  const hasOAuthOnlyAccess = hasOAuthAccount && !hasPasswordAccount;
  const isBusy = changingPassword || settingPassword;
  const isFormOpen = activeForm !== null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!newPwd.trim()) {
      setMsg({ kind: "error", text: "Enter a new password." });
      return;
    }
    if (activeForm === "change-password" && !currentPwd.trim()) {
      setMsg({ kind: "error", text: "Enter your current password." });
      return;
    }
    if (newPwd !== confirmPwd) {
      setMsg({ kind: "error", text: "Passwords do not match." });
      return;
    }
    const submit =
      (activeForm === "change-password"
        ? () =>
            handleChangePassword({
              currentPassword: currentPwd,
              newPassword: newPwd,
            })
        : handleSetPassword) ?? (async () => {});
    try {
      await submit({ newPassword: newPwd });
      setMsg({ kind: "success", text: "Password updated." });
      dispatch({ type: "finishForm" });
    } catch (err) {
      setMsg({
        kind: "error",
        text: getErrorMessage(err, "Something went wrong."),
      });
    }
  };

  if (!hasPasswordAccount && !hasOAuthOnlyAccess) return null;

  const newLabel = "New password";
  const confirmLabel = "Confirm new password";

  return (
    <div>
      {msg && !isFormOpen ? (
        <div className="px-2 py-1">
          <InlineMessage msg={msg} />
        </div>
      ) : null}
      {!isFormOpen ? (
        <>
          {hasPasswordAccount ? (
            <PaletteNavRow
              icon={Lock}
              label="Change Password"
              description="Update your email sign-in password"
              trailing={null}
              onClick={() =>
                dispatch({ type: "openForm", form: "change-password" })
              }
              disabled={isBusy}
            />
          ) : null}
          {hasOAuthOnlyAccess ? (
            <PaletteNavRow
              icon={Lock}
              label="Set Email Password"
              description="Add an email sign-in password"
              trailing={null}
              onClick={() =>
                dispatch({ type: "openForm", form: "set-password" })
              }
              disabled={isBusy}
            />
          ) : null}
        </>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)}>
          {msg ? (
            <div className="px-2 py-1">
              <InlineMessage msg={msg} />
            </div>
          ) : null}
          {activeForm === "change-password" ? (
            <PaletteField
              label="Current password"
              htmlFor={`${fieldId}-current`}
            >
              <input
                id={`${fieldId}-current`}
                aria-label="Current password"
                type="password"
                value={currentPwd}
                onChange={(e) =>
                  dispatch({
                    type: "setField",
                    field: "currentPassword",
                    value: e.target.value,
                  })
                }
                autoComplete="current-password"
                disabled={isBusy}
                className={PALETTE_INPUT_CLASS}
              />
            </PaletteField>
          ) : null}
          <PaletteField label={newLabel} htmlFor={`${fieldId}-new`}>
            <input
              id={`${fieldId}-new`}
              aria-label={newLabel}
              type="password"
              value={newPwd}
              onChange={(e) =>
                dispatch({
                  type: "setField",
                  field: "newPassword",
                  value: e.target.value,
                })
              }
              autoComplete="new-password"
              disabled={isBusy}
              className={PALETTE_INPUT_CLASS}
            />
          </PaletteField>
          <PaletteField label={confirmLabel} htmlFor={`${fieldId}-confirm`}>
            <input
              id={`${fieldId}-confirm`}
              aria-label={confirmLabel}
              type="password"
              value={confirmPwd}
              onChange={(e) =>
                dispatch({
                  type: "setField",
                  field: "confirmPassword",
                  value: e.target.value,
                })
              }
              autoComplete="new-password"
              disabled={isBusy}
              className={PALETTE_INPUT_CLASS}
            />
          </PaletteField>
          <PaletteFormActions>
            <PaletteButton
              variant="ghost"
              onClick={() => dispatch({ type: "cancelForm" })}
              disabled={isBusy}
            >
              Cancel
            </PaletteButton>
            <PaletteButton type="submit" variant="primary" loading={isBusy}>
              {activeForm === "change-password"
                ? "Update Password"
                : "Set Password"}
            </PaletteButton>
          </PaletteFormActions>
        </form>
      )}
    </div>
  );
}
