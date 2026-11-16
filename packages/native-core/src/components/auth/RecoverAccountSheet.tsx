import React, { useReducer } from "react";
import { Alert, StyleSheet, View, type ViewStyle } from "react-native";
import { recoverAccount, recoveryPost } from "@workspace/calendar-client";
import { getErrorMessage } from "@workspace/calendar-core";
import {
  FORGOT_PASSWORD_NOTICE,
  RECOVERY_KIT_USED_NOTICE,
} from "@workspace/calendar-core/product-info";
import type { ThemeTokens } from "@workspace/design-tokens";
import { createE2eeModule } from "@workspace/e2ee";
import { authClient } from "../../lib/auth-client";
import { createNativeCryptoProvider, nativeArgon2id } from "../../lib/native-crypto-provider";
import { useAuth } from "../../providers/AuthProvider";
import { useTheme } from "../../providers/ThemeProvider";
import {
  BottomSheet,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetScrollView,
  BottomSheetTitle,
} from "../BottomSheet";
import {
  SheetButton,
  SheetGroup,
  SheetMessage,
  SheetSection,
  SheetSwitchItem,
  SheetTextField,
} from "../sheet/SheetSections";

type Field = "email" | "recoveryKey" | "newPassword" | "confirmPassword";

type RecoverForm = Record<Field, string | null> & {
  removePasskeys: boolean | null;
  error: string | null;
  isPending: boolean;
};

type RecoverAction =
  | { type: "edit"; field: Field; value: string }
  | { type: "remove-passkeys"; value: boolean }
  | { type: "submit" }
  | { type: "fail"; error: string }
  | { type: "reset" };

const EMPTY_FORM: RecoverForm = {
  email: null,
  recoveryKey: null,
  newPassword: null,
  confirmPassword: null,
  removePasskeys: null,
  error: null,
  isPending: false,
};

function recoverReducer(state: RecoverForm, action: RecoverAction): RecoverForm {
  switch (action.type) {
    case "edit":
      return { ...state, [action.field]: action.value, error: null };
    case "remove-passkeys":
      return { ...state, removePasskeys: action.value };
    case "submit":
      return { ...state, error: null, isPending: true };
    case "fail":
      return { ...state, error: action.error, isPending: false };
    case "reset":
      return EMPTY_FORM;
  }
}

function getRecoverFormError(input: {
  email: string;
  recoveryKey: string;
  newPassword: string;
  confirmPassword: string;
}): string | null {
  if (!input.email.trim() || !input.recoveryKey.trim()) {
    return "Enter your email and your recovery key.";
  }
  if (!input.newPassword) {
    return "Choose a new password.";
  }
  if (input.newPassword !== input.confirmPassword) {
    return "New password and confirmation must match.";
  }
  return null;
}

/** Resets a forgotten password with the recovery kit; the lost-passkey entry also removes passkeys by default. */
export function RecoverAccountSheet({
  visible,
  initialEmail,
  lostPasskey = false,
  onDismiss,
}: {
  visible: boolean;
  initialEmail: string;
  lostPasskey?: boolean;
  onDismiss: () => void;
}) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { signIn } = useAuth();
  const [form, dispatch] = useReducer(recoverReducer, EMPTY_FORM);
  const email = form.email ?? initialEmail;
  const removePasskeys = form.removePasskeys ?? lostPasskey;
  const values = {
    email,
    recoveryKey: form.recoveryKey ?? "",
    newPassword: form.newPassword ?? "",
    confirmPassword: form.confirmPassword ?? "",
  };

  const recover = async () => {
    await recoverAccount({
      post: recoveryPost((path, options) => authClient.$fetch(path, options)),
      e2ee: createE2eeModule(createNativeCryptoProvider(), { argon2id: nativeArgon2id }),
      email: values.email.trim(),
      recoveryKey: values.recoveryKey,
      newPassword: values.newPassword,
      removePasskeys,
    });
    await signIn(values.email.trim(), values.newPassword).catch(() => {
      throw new Error("Your password was reset. Sign in with your new password.");
    });
    onDismiss();
    Alert.alert("Password reset", RECOVERY_KIT_USED_NOTICE);
  };

  const submit = async () => {
    const invalid = getRecoverFormError(values);
    if (invalid) {
      dispatch({ type: "fail", error: invalid });
      return;
    }
    dispatch({ type: "submit" });
    await recover().catch((error: unknown) => {
      dispatch({
        type: "fail",
        error: getErrorMessage(error, "Unable to reset your password. Try again."),
      });
    });
  };

  const edit = (field: Field) => (value: string) =>
    dispatch({ type: "edit", field, value });

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      onCloseComplete={() => dispatch({ type: "reset" })}
    >
      <BottomSheetHeader>
        <BottomSheetTitle>Reset password</BottomSheetTitle>
      </BottomSheetHeader>
      <BottomSheetScrollView contentContainerStyle={styles.content}>
        <SheetSection
          title="Recovery kit"
          footer="Your encrypted data stays readable. Every device is signed out."
        >
          <SheetGroup>
            <SheetTextField
              value={email}
              onChangeText={edit("email")}
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="Email"
              accessibilityLabel="Email address"
            />
            <SheetTextField
              value={values.recoveryKey}
              onChangeText={edit("recoveryKey")}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="Recovery key"
              accessibilityLabel="Recovery key"
            />
          </SheetGroup>
        </SheetSection>
        <SheetSection title="New password">
          <SheetGroup>
            <SheetTextField
              value={values.newPassword}
              onChangeText={edit("newPassword")}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder="New password"
              accessibilityLabel="New password"
            />
            <SheetTextField
              value={values.confirmPassword}
              onChangeText={edit("confirmPassword")}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder="Confirm new password"
              accessibilityLabel="Confirm new password"
            />
          </SheetGroup>
        </SheetSection>
        <SheetSection footer="Turn this off if you still have your passkeys.">
          <SheetGroup>
            <SheetSwitchItem
              icon="key"
              label="Remove passkeys (I lost them)"
              value={removePasskeys}
              onValueChange={(value) => dispatch({ type: "remove-passkeys", value })}
            />
          </SheetGroup>
        </SheetSection>
        {form.error ? <SheetMessage tone="destructive" text={form.error} /> : null}
        <SheetMessage text={FORGOT_PASSWORD_NOTICE} />
      </BottomSheetScrollView>
      <BottomSheetFooter>
        <View style={styles.actions}>
          <SheetButton
            label="Reset password"
            onPress={() => {
              submit().catch(() => undefined);
            }}
            pending={form.isPending}
          />
        </View>
      </BottomSheetFooter>
    </BottomSheet>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    content: { gap: theme.spacing["3"], paddingBottom: theme.spacing["4"] },
    actions: { gap: theme.spacing["2"] },
  } satisfies Record<string, ViewStyle>);
}
