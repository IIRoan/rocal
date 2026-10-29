import type { Dispatch } from "react";

import { getAccountSettingsErrorMessage } from "./account-settings-utils";
import type { SecurityForm, SecurityUiAction, SecurityUiState } from "./account-settings-ui-state";

export async function submitAccountSecurityPassword({
  security,
  dispatch,
  activeForm,
  handleChangePassword,
  handleSetPassword,
}: {
  security: SecurityUiState;
  dispatch: Dispatch<SecurityUiAction>;
  activeForm: NonNullable<SecurityForm>;
  handleChangePassword: (values: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<void>;
  handleSetPassword?: (values: { newPassword: string }) => Promise<void>;
}) {
  const isChangePasswordForm = activeForm === "change-password";

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
          text: "Your password has been updated. It also unlocks your encrypted data when you sign in.",
        },
      });
    } else {
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
          text: "An email sign-in password has been added to your account. It also unlocks your encrypted data when you sign in.",
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
