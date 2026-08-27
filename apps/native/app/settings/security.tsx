import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import type { Passkey as AuthPasskey } from "@better-auth/passkey/client";
import {
  EVENT_ENCRYPTION_HINT,
  extractLinkedAuthAccounts,
  getErrorMessage,
  summarizeLinkedAuthAccounts,
  type LinkedAuthAccountLike,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { AppScreen, StackScreenHeader } from "../../src/components/layout";
import {
  SettingsActionRow,
  SettingsHintRow,
  SettingsToggleRow,
} from "../../src/components/settings/SettingsRows";
import { SettingsPasswordForm } from "../../src/components/settings/SettingsAccountForms";
import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetTitle,
} from "../../src/components/BottomSheet";
import { authClient } from "../../src/lib/auth-client";
import { getAuthCapabilities } from "../../src/lib/auth-capabilities";
import { formatStoredPasskeyDescription } from "../../src/lib/passkey-auth";
import {
  isPasskeyBridgeOriginSecure,
  resolvePasskeyBridgeBaseUrl,
} from "../../src/lib/passkey-browser-bridge";
import { getEncryptionPasswordValidationError, canResetEncryptionPassword } from "../../src/lib/settings-encryption-password";
import {
  isNativeTitleIndexEnabled,
  setNativeTitleIndexEnabled,
  subscribeNativeTitleIndexEnabled,
} from "../../src/lib/search/title-index-store";
import { useAuth } from "../../src/providers/AuthProvider";
import { useE2ee } from "../../src/providers/E2eeProvider";
import { useTheme } from "../../src/providers/ThemeProvider";
import { useToast } from "../../src/providers/ToastProvider";

export default function SecuritySettingsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { user, registerPasskey, deletePasskey } = useAuth();
  const { toast } = useToast();
  const { resetEncryptionPassword } = useE2ee();
  const passkeysQuery = authClient.useListPasskeys();
  const accountsQuery = useQuery({
    queryKey: ["auth", "accounts", user?.id ?? null],
    queryFn: async (): Promise<LinkedAuthAccountLike[]> => {
      if (typeof authClient.listAccounts !== "function") {
        return [];
      }
      return extractLinkedAuthAccounts(await authClient.listAccounts());
    },
    enabled: Boolean(user?.id) && typeof authClient.listAccounts === "function",
    staleTime: 5 * 60 * 1000,
  });

  const authCapabilities = useMemo(() => {
    const passkeyBridgeBaseUrl = resolvePasskeyBridgeBaseUrl();
    return getAuthCapabilities({
      platformOs: Platform.OS,
      hasPublicKeyCredential:
        typeof globalThis.PublicKeyCredential === "function",
      hasSecurePasskeyBridgeOrigin:
        isPasskeyBridgeOriginSecure(passkeyBridgeBaseUrl),
    });
  }, []);

  const isPasskeySupported = authCapabilities.supportsPasskeys;
  const passkeySupportMessage =
    authCapabilities.passkeyMessage ??
    "Passkeys are unavailable in the current runtime.";
  const storedPasskeys = useMemo(
    () => (Array.isArray(passkeysQuery.data) ? passkeysQuery.data : []),
    [passkeysQuery.data],
  );
  const { hasOAuthAccount } = useMemo(
    () => summarizeLinkedAuthAccounts(accountsQuery.data ?? []),
    [accountsQuery.data],
  );
  const canResetEncryption = canResetEncryptionPassword({
    hasOAuthAccount,
    passkeyCount: storedPasskeys.length,
  });

  const [titleIndexEnabled, setTitleIndexEnabled] = useState(true);
  const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false);
  const [pendingPasskeyDeletionId, setPendingPasskeyDeletionId] = useState<
    string | null
  >(null);
  const [showResetEncryption, setShowResetEncryption] = useState(false);
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isResettingEncryptionPassword, setIsResettingEncryptionPassword] =
    useState(false);

  useEffect(() => {
    let cancelled = false;
    void isNativeTitleIndexEnabled().then((value) => {
      if (!cancelled) setTitleIndexEnabled(value);
    });
    const unsubscribe = subscribeNativeTitleIndexEnabled(setTitleIndexEnabled);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const resetForm = useCallback(() => {
    setNewPasswordInput("");
    setConfirmPasswordInput("");
    setPasswordError(null);
  }, []);

  const handleRegisterPasskey = useCallback(async () => {
    setIsRegisteringPasskey(true);
    try {
      await registerPasskey();
      await passkeysQuery.refetch();
      toast("Passkey added");
    } catch (error) {
      toast(getErrorMessage(error, "Failed to add passkey"), "error");
    } finally {
      setIsRegisteringPasskey(false);
    }
  }, [passkeysQuery, registerPasskey, toast]);

  const handleDeletePasskey = useCallback(
    (passkey: AuthPasskey) => {
      const passkeyLabel = passkey.name || "this passkey";
      Alert.alert("Delete passkey?", `Remove ${passkeyLabel} from your account?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setPendingPasskeyDeletionId(passkey.id);
            deletePasskey(passkey.id)
              .then(() => {
                passkeysQuery.refetch();
                toast("Passkey removed");
              })
              .catch((error) => {
                toast(
                  getErrorMessage(error, "Failed to delete passkey"),
                  "error",
                );
              })
              .finally(() => {
                setPendingPasskeyDeletionId(null);
              });
          },
        },
      ]);
    },
    [deletePasskey, passkeysQuery, toast],
  );

  const handleResetEncryption = useCallback(async () => {
    const validationError = getEncryptionPasswordValidationError({
      newPassword: newPasswordInput,
      confirmPassword: confirmPasswordInput,
    });
    if (validationError) {
      setPasswordError(validationError);
      return;
    }
    setIsResettingEncryptionPassword(true);
    try {
      const ok = await resetEncryptionPassword(newPasswordInput);
      if (!ok) {
        throw new Error("Unable to reset your encryption password.");
      }
      toast("Encryption password updated");
      resetForm();
      setShowResetEncryption(false);
    } catch (error) {
      setPasswordError(
        getErrorMessage(error, "Failed to update your password"),
      );
    } finally {
      setIsResettingEncryptionPassword(false);
    }
  }, [
    confirmPasswordInput,
    newPasswordInput,
    resetEncryptionPassword,
    resetForm,
    toast,
  ]);

  return (
    <AppScreen header={<StackScreenHeader title="Security" />}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionItems}>
          <SettingsHintRow text={EVENT_ENCRYPTION_HINT} theme={theme} />
          <SettingsToggleRow
            icon="search"
            label="On-device search index"
            description="Keep encrypted titles of your mail and events on this device so older items stay searchable."
            value={titleIndexEnabled}
            onValueChange={(value) => {
              setTitleIndexEnabled(value);
              void setNativeTitleIndexEnabled(value);
            }}
            theme={theme}
          />
          {isPasskeySupported ? (
            <>
              <SettingsActionRow
                icon="key"
                label="Add Passkey"
                description={
                  storedPasskeys.length > 0
                    ? `${storedPasskeys.length} saved on your account`
                    : "Use this device for faster, passwordless sign-in."
                }
                onPress={handleRegisterPasskey}
                theme={theme}
                isPending={isRegisteringPasskey}
              />
              {storedPasskeys.length > 0 ? (
                storedPasskeys.map((passkey) => (
                  <View key={passkey.id} style={styles.passkeyRow}>
                    <Feather
                      name="key"
                      size={16}
                      color={theme.colors.mutedForeground}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.passkeyName} numberOfLines={1}>
                        {passkey.name || "Unnamed Passkey"}
                      </Text>
                      <Text style={styles.passkeyMeta} numberOfLines={2}>
                        {formatStoredPasskeyDescription(passkey)}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleDeletePasskey(passkey)}
                      style={({ pressed }) => [
                        styles.deleteButton,
                        pressed && { backgroundColor: theme.colors.accent },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${passkey.name || "passkey"}`}
                    >
                      {pendingPasskeyDeletionId === passkey.id ? (
                        <ActivityIndicator
                          size="small"
                          color={theme.colors.destructive}
                        />
                      ) : (
                        <Feather
                          name="trash-2"
                          size={16}
                          color={theme.colors.destructive}
                        />
                      )}
                    </Pressable>
                  </View>
                ))
              ) : (
                <SettingsHintRow
                  text="No passkeys saved yet. Add one to sign in with Face ID, Touch ID, or your device credential manager."
                  theme={theme}
                />
              )}
            </>
          ) : (
            <SettingsHintRow
              text={
                Platform.OS === "web"
                  ? passkeySupportMessage
                  : `${passkeySupportMessage} Native passkeys also need the passkey domain, apple-app-site-association, and assetlinks setup to match your build.`
              }
              theme={theme}
            />
          )}
          {canResetEncryption ? (
            <SettingsActionRow
              icon="lock"
              label="Reset encryption password"
              description="Update the password that protects your encryption keys on this device. Existing data is not re-encrypted."
              onPress={() => {
                resetForm();
                setShowResetEncryption(true);
              }}
              theme={theme}
              isPending={isResettingEncryptionPassword}
            />
          ) : null}
        </View>
      </ScrollView>

      <BottomSheet
        visible={showResetEncryption}
        onDismiss={() => {
          setShowResetEncryption(false);
          resetForm();
        }}
      >
        <BottomSheetHeader>
          <BottomSheetTitle>Reset encryption password</BottomSheetTitle>
        </BottomSheetHeader>
        <View style={{ paddingBottom: insets.bottom + 8 }}>
          <SettingsPasswordForm
            mode="reset-encryption"
            currentPassword=""
            newPassword={newPasswordInput}
            confirmPassword={confirmPasswordInput}
            onCurrentPasswordChange={() => undefined}
            onNewPasswordChange={setNewPasswordInput}
            onConfirmPasswordChange={setConfirmPasswordInput}
            onSubmit={() => void handleResetEncryption()}
            onCancel={() => {
              setShowResetEncryption(false);
              resetForm();
            }}
            error={passwordError}
            isPending={isResettingEncryptionPassword}
            theme={theme}
          />
        </View>
      </BottomSheet>
    </AppScreen>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    scrollView: { flex: 1 },
    scrollContent: { paddingBottom: theme.spacing["8"] },
    sectionItems: { paddingVertical: theme.spacing["1"] },
    passkeyRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["3"],
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
      marginHorizontal: theme.spacing["1"],
    },
    deleteButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    passkeyName: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    passkeyMeta: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
