import type { Dispatch } from "react";

import { getAccountSettingsErrorMessage } from "./account-settings-utils";
import type { SecurityForm, SecurityUiAction, SecurityUiState } from "./account-settings-ui-state";

export async function submitAccountSecurityPassword({
  security,
  dispatch,
  activeForm,
  handleChangePassword,
  handleSetPassword,
  handleResetEncryptionPassword,
}: {
  security: SecurityUiState;
  dispatch: Dispatch<SecurityUiAction>;
  activeForm: NonNullable<SecurityForm>;
  handleChangePassword: (values: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<void>;
  handleSetPassword?: (values: { newPassword: string }) => Promise<void>;
  handleResetEncryptionPassword?: (values: { newPassword: string }) => Promise<void>;
}) {
  const isChangePasswordForm = activeForm === "change-password";
  const isSetPasswordForm = activeForm === "set-password";

  dispatch({ type: "setMessage", message: null });

  if (!security.newPassword.trim()) {
    dispatch({
      type: "setMessage",
      message: {
        kind: "error",
        text: isChangePasswordForm
          ? "Enter your current password and a new password."
          : "Enter a new password and confirm it.",
      },
    });
    return;
  }
  if (isChangePasswordForm && !security.currentPassword.trim()) {
    dispatch({
      type: "setMessage",
      message: {
        kind: "error",
        text: "Enter your current password and a new password.",
      },
    });
    return;
  }
  if (security.newPassword !== security.confirmPassword) {
    dispatch({
      type: "setMessage",
      message: {
        kind: "error",
        text: "New password and confirmation must match.",
      },
    });
    return;
  }

  try {
    if (isChangePasswordForm) {
      await handleChangePassword({
        currentPassword: security.currentPassword,
        newPassword: security.newPassword,
      });
      dispatch({
        type: "setMessage",
        message: {
          kind: "success",
          text: "Your email sign-in password has been updated. After email sign-in, Solace will also use it to protect your encryption keys.",
        },
      });
    } else if (isSetPasswordForm) {
      if (!handleSetPassword) {
        dispatch({
          type: "setMessage",
          message: {
            kind: "error",
            text: "Password setup is unavailable.",
          },
        });
        return;
      }
      await handleSetPassword({ newPassword: security.newPassword });
      dispatch({
        type: "setMessage",
        message: {
          kind: "success",
          text: "An email sign-in password has been added to your account. OAuth and passkey sign-in still use your separate encryption password unless you reset it below.",
        },
      });
    } else {
      if (!handleResetEncryptionPassword) {
        dispatch({
          type: "setMessage",
          message: {
            kind: "error",
            text: "Encryption password reset is unavailable.",
          },
        });
        return;
      }
      await handleResetEncryptionPassword({
        newPassword: security.newPassword,
      });
      dispatch({
        type: "setMessage",
        message: {
          kind: "success",
          text: "Your encryption password has been reset for OAuth and passkey sign-in. This keeps your encrypted data intact and only replaces the password used to unlock your encryption keys on new devices.",
        },
      });
    }
    dispatch({ type: "finishForm" });
  } catch (error) {
    dispatch({
      type: "setMessage",
      message: { kind: "error", text: getAccountSettingsErrorMessage(error) },
    });
  }
}
