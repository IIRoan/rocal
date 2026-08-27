import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { ThemeTokens } from "@workspace/design-tokens";
import {
  SheetActions,
  SheetPrimaryButton,
  SheetSecondaryButton,
} from "../sheet";
export function SettingsPasswordField({
  label,
  value,
  onChangeText,
  autoComplete,
  theme,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  autoComplete: "password" | "new-password";
  theme: ThemeTokens;
}) {
  return (
    <View>
      <Text
        style={{
          marginBottom: theme.spacing["1"],
          fontSize: theme.typography.fontSize.xs.size,
          lineHeight: theme.typography.fontSize.xs.lineHeight,
          color: theme.colors.mutedForeground,
        }}
      >
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={autoComplete}
        textContentType={
          autoComplete === "new-password" ? "newPassword" : "password"
        }
        placeholder={label}
        placeholderTextColor={theme.colors.mutedForeground}
        style={{
          borderWidth: 1,
          borderColor: theme.colors.input,
          borderRadius: theme.borderRadius.md,
          paddingHorizontal: theme.spacing["3"],
          paddingVertical: theme.spacing["3"],
          fontSize: theme.typography.fontSize.base.size,
          color: theme.colors.foreground,
          backgroundColor: theme.colors.background,
        }}
      />
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
  theme,
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
  theme: ThemeTokens;
}) {
  const isChangePassword = mode === "change-password";
  const isResetEncryption = mode === "reset-encryption";

  return (
    <ScrollView
      contentContainerStyle={{
        padding: theme.spacing["4"],
        gap: theme.spacing["4"],
      }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={{
          fontSize: theme.typography.fontSize.sm.size,
          lineHeight: theme.typography.fontSize.sm.lineHeight,
          color: theme.colors.mutedForeground,
        }}
      >
        {isResetEncryption
          ? "This updates the password that protects your encryption keys on this device. It does not re-encrypt existing data. You can only do this if you have a passkey or a social sign-in option."
          : isChangePassword
            ? "Update your email sign-in password. After email sign-in, Solace also uses it to protect your encryption keys."
            : "Add an email sign-in password to this account. This gives you an email/password sign-in option without changing your existing encrypted data."}
      </Text>

      {error ? (
        <View
          style={{
            borderRadius: theme.borderRadius.md,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.colors.destructive + "40",
            backgroundColor: theme.colors.destructive + "18",
            paddingHorizontal: theme.spacing["3"],
            paddingVertical: 10,
          }}
        >
          <Text
            style={{
              fontSize: theme.typography.fontSize.sm.size,
              lineHeight: theme.typography.fontSize.sm.lineHeight,
              color: theme.colors.destructive,
            }}
          >
            {error}
          </Text>
        </View>
      ) : null}

      <View style={{ gap: theme.spacing["3"] }}>
        {isChangePassword ? (
          <SettingsPasswordField
            label="Current password"
            value={currentPassword}
            onChangeText={onCurrentPasswordChange}
            autoComplete="password"
            theme={theme}
          />
        ) : null}
        <SettingsPasswordField
          label="New password"
          value={newPassword}
          onChangeText={onNewPasswordChange}
          autoComplete="new-password"
          theme={theme}
        />
        <SettingsPasswordField
          label="Confirm new password"
          value={confirmPassword}
          onChangeText={onConfirmPasswordChange}
          autoComplete="new-password"
          theme={theme}
        />
      </View>

      <SheetActions>
        <SheetPrimaryButton
          label={
            isResetEncryption
              ? "Reset encryption password"
              : isChangePassword
                ? "Update Password"
                : "Set Password"
          }
          onPress={onSubmit}
          loading={isPending}
          disabled={isPending}
        />
        <SheetSecondaryButton
          label="Cancel"
          onPress={onCancel}
          disabled={isPending}
        />
      </SheetActions>
    </ScrollView>
  );
}

export function SettingsProfilePictureForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  isPending,
  theme,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isPending: boolean;
  theme: ThemeTokens;
}) {
  return (
    <View style={{ padding: theme.spacing["4"], gap: theme.spacing["4"] }}>
      <Text
        style={{
          fontSize: theme.typography.fontSize.sm.size,
          lineHeight: theme.typography.fontSize.sm.lineHeight,
          color: theme.colors.mutedForeground,
        }}
      >
        Paste the URL of the image you want to use.
      </Text>
      <View style={{ gap: 6 }}>
        <Text
          style={{
            fontSize: theme.typography.fontSize.xs.size,
            lineHeight: theme.typography.fontSize.xs.lineHeight,
            color: theme.colors.mutedForeground,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          Image URL
        </Text>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="https://example.com/photo.png"
          placeholderTextColor={theme.colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!isPending}
          style={{
            height: 44,
            borderRadius: theme.borderRadius.lg,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.muted + "50",
            paddingHorizontal: theme.spacing["3"],
            fontSize: theme.typography.fontSize.sm.size,
            color: theme.colors.foreground,
          }}
        />
      </View>
      <SheetActions>
        <SheetPrimaryButton
          label="Save"
          onPress={onSubmit}
          loading={isPending}
          disabled={isPending}
        />
        <SheetSecondaryButton
          label="Cancel"
          onPress={onCancel}
          disabled={isPending}
        />
      </SheetActions>
    </View>
  );
}
