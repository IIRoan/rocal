import React, { useMemo, type ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import {
  SheetButton,
  SheetGroup,
  SheetMessage,
  SheetSection,
  SheetTextField,
} from "../sheet/SheetSections";

function PasswordField({
  label,
  value,
  onChangeText,
  autoComplete,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  autoComplete: "password" | "new-password";
}) {
  return (
    <SheetTextField
      value={value}
      onChangeText={onChangeText}
      secureTextEntry
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete={autoComplete}
      textContentType={autoComplete === "new-password" ? "newPassword" : "password"}
      placeholder={label}
      accessibilityLabel={label}
    />
  );
}

function SettingsInlineForm({
  children,
  submitLabel,
  onSubmit,
  onCancel,
  isPending,
}: {
  children: ReactNode;
  submitLabel: string;
  onSubmit: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.form}>
      {children}
      <View style={styles.actions}>
        <SheetButton label={submitLabel} onPress={onSubmit} pending={isPending} />
        <SheetButton label="Cancel" variant="secondary" onPress={onCancel} disabled={isPending} />
      </View>
    </View>
  );
}

export function SettingsPasswordForm({
  mode,
  currentPassword,
  newPassword,
  confirmPassword,
  onCurrentPasswordChange,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
  onCancel,
  error,
  isPending,
}: {
  mode: "change-password" | "set-password" | "reset-encryption";
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  onCurrentPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  error: string | null;
  isPending: boolean;
}) {
  const isChangePassword = mode === "change-password";
  const isResetEncryption = mode === "reset-encryption";

  return (
    <SettingsInlineForm
      submitLabel={
        isResetEncryption
          ? "Reset encryption password"
          : isChangePassword
            ? "Update Password"
            : "Set Password"
      }
      onSubmit={onSubmit}
      onCancel={onCancel}
      isPending={isPending}
    >
      <SheetSection
        title={
          isResetEncryption
            ? "Reset encryption password"
            : isChangePassword
              ? "Change password"
              : "Set password"
        }
        footer={
          isResetEncryption
            ? "This updates the password that protects your encryption keys on this device. It does not re-encrypt existing data. You can only do this if you have a passkey or a social sign-in option."
            : isChangePassword
              ? "Update your email sign-in password. After email sign-in, Solace also uses it to protect your encryption keys."
              : "Add an email sign-in password to this account. This gives you an email/password sign-in option without changing your existing encrypted data."
        }
      >
        <SheetGroup>
          {isChangePassword ? (
            <PasswordField
              key="current"
              label="Current password"
              value={currentPassword}
              onChangeText={onCurrentPasswordChange}
              autoComplete="password"
            />
          ) : null}
          <PasswordField
            key="new"
            label="New password"
            value={newPassword}
            onChangeText={onNewPasswordChange}
            autoComplete="new-password"
          />
          <PasswordField
            key="confirm"
            label="Confirm new password"
            value={confirmPassword}
            onChangeText={onConfirmPasswordChange}
            autoComplete="new-password"
          />
        </SheetGroup>
        {error ? <SheetMessage tone="destructive" text={error} /> : null}
      </SheetSection>
    </SettingsInlineForm>
  );
}

export function SettingsProfilePictureForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  isPending,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <SettingsInlineForm
      submitLabel="Save"
      onSubmit={onSubmit}
      onCancel={onCancel}
      isPending={isPending}
    >
      <SheetSection
        title="Profile picture"
        footer="Paste the URL of the image you want to use."
      >
        <SheetGroup>
          <SheetTextField
            value={value}
            onChangeText={onChange}
            placeholder="https://example.com/photo.png"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!isPending}
            accessibilityLabel="Image URL"
          />
        </SheetGroup>
      </SheetSection>
    </SettingsInlineForm>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    form: {
      gap: theme.spacing["3"],
    },
    actions: {
      gap: theme.spacing["2"],
    },
  } satisfies Record<string, ViewStyle>);
}
