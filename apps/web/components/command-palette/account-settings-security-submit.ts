import type { Dispatch } from "react";

import { getAccountSettingsErrorMessage } from "./account-settings-utils";
import type { SecurityUiAction, SecurityUiState } from "./account-settings-ui-state";

export async function submitAccountSecurityPassword({
  security,
  dispatch,
  handleChangePassword,
}: {
  security: SecurityUiState;
  dispatch: Dispatch<SecurityUiAction>;
  handleChangePassword: (values: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<void>;
}) {
  dispatch({ type: "setMessage", message: null });

  if (!security.newPassword.trim() || !security.currentPassword.trim()) {
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
    dispatch({ type: "finishForm" });
  } catch (error) {
    dispatch({
      type: "setMessage",
      message: { kind: "error", text: getAccountSettingsErrorMessage(error) },
    });
  }
}
