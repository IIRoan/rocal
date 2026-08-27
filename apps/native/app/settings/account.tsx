import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  extractLinkedAuthAccounts,
  getErrorMessage,
  summarizeLinkedAuthAccounts,
  type LinkedAuthAccountLike,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { AppScreen, StackScreenHeader } from "../../src/components/layout";
import {
  SettingsAccountCard,
  SettingsActionRow,
  SettingsHintRow,
} from "../../src/components/settings/SettingsRows";
import {
  SettingsPasswordForm,
  SettingsProfilePictureForm,
} from "../../src/components/settings/SettingsAccountForms";
import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetTitle,
} from "../../src/components/BottomSheet";
import { authClient } from "../../src/lib/auth-client";
import { getSettingsAccountActions } from "../../src/lib/settings-screen-utils";
import { useAuth } from "../../src/providers/AuthProvider";
import { useNativeUserSettings } from "../../src/hooks/use-native-user-settings";
import { calendarApiService } from "../../src/lib/api";
import { useTheme } from "../../src/providers/ThemeProvider";
import { useToast } from "../../src/providers/ToastProvider";

export default function AccountSettingsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const { resetSettingsMutation } = useNativeUserSettings();

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
  const { hasPasswordAccount, hasOAuthAccount } = useMemo(
    () => summarizeLinkedAuthAccounts(accountsQuery.data ?? []),
    [accountsQuery.data],
  );
  const accountActions = useMemo(
    () =>
      getSettingsAccountActions({
        canSignOut: Boolean(user),
        hasPasswordAccount,
        hasOAuthAccount,
      }),
    [hasOAuthAccount, hasPasswordAccount, user],
  );

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [isUpdatingProfilePicture, setIsUpdatingProfilePicture] =
    useState(false);
  const [showProfilePictureForm, setShowProfilePictureForm] = useState(false);
  const [profilePictureUrlInput, setProfilePictureUrlInput] = useState("");
  const [activePasswordSheet, setActivePasswordSheet] = useState<
    "change-password" | "set-password" | null
  >(null);
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(
    null,
  );

  const resetChangePasswordForm = useCallback(() => {
    setCurrentPasswordInput("");
    setNewPasswordInput("");
    setConfirmPasswordInput("");
    setPasswordChangeError(null);
  }, []);

  const handleResetSettings = useCallback(() => {
    Alert.alert(
      "Reset settings?",
      "This restores theme, calendar defaults, and notification preferences to their shared defaults.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => resetSettingsMutation.mutate(),
        },
      ],
    );
  }, [resetSettingsMutation]);

  const handleSignOut = useCallback(() => {
    Alert.alert("Sign out?", "End this session on this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: () => {
          setIsSigningOut(true);
          signOut()
            .catch((error) => {
              toast(getErrorMessage(error, "Failed to sign out"), "error");
            })
            .finally(() => {
              setIsSigningOut(false);
            });
        },
      },
    ]);
  }, [signOut, toast]);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      "Delete account?",
      "This permanently deletes your account, calendars, events, categories, subscriptions, passkeys, and settings. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: () => {
            setIsDeletingAccount(true);
            calendarApiService
              .deleteAccount()
              .then(async () => {
                queryClient.clear();
                await signOut();
              })
              .catch((error) => {
                toast(
                  getErrorMessage(error, "Failed to delete account"),
                  "error",
                );
              })
              .finally(() => {
                setIsDeletingAccount(false);
              });
          },
        },
      ],
    );
  }, [queryClient, signOut, toast]);

  const handleSubmitPasswordChange = useCallback(async () => {
    setPasswordChangeError(null);
    if (!newPasswordInput.trim()) {
      setPasswordChangeError(
        activePasswordSheet === "change-password"
          ? "Enter your current password and a new password."
          : "Enter a new password and confirm it.",
      );
      return;
    }
    if (
      activePasswordSheet === "change-password" &&
      !currentPasswordInput.trim()
    ) {
      setPasswordChangeError("Enter your current password and a new password.");
      return;
    }
    if (newPasswordInput !== confirmPasswordInput) {
      setPasswordChangeError("New password and confirmation must match.");
      return;
    }

    try {
      if (activePasswordSheet === "change-password") {
        setIsChangingPassword(true);
        const result = await authClient.changePassword({
          currentPassword: currentPasswordInput,
          newPassword: newPasswordInput,
        });
        if (result?.error) {
          throw new Error(
            result.error.message ?? "Unable to update your password.",
          );
        }
        toast("Password updated");
      } else {
        setIsSettingPassword(true);
        const result = await (
          authClient as typeof authClient & {
            setPassword: (input: { newPassword: string }) => Promise<{
              error?: { message?: string };
            } | void>;
          }
        ).setPassword({
          newPassword: newPasswordInput,
        });
        if (result?.error) {
          throw new Error(
            result.error.message ?? "Unable to set your password.",
          );
        }
        await accountsQuery.refetch();
        toast("Email password added");
      }
      resetChangePasswordForm();
      setActivePasswordSheet(null);
    } catch (error) {
      setPasswordChangeError(
        getErrorMessage(error, "Failed to update your password"),
      );
    } finally {
      setIsChangingPassword(false);
      setIsSettingPassword(false);
    }
  }, [
    accountsQuery,
    activePasswordSheet,
    confirmPasswordInput,
    currentPasswordInput,
    newPasswordInput,
    resetChangePasswordForm,
    toast,
  ]);

  const handleSubmitProfilePicture = useCallback(async () => {
    const trimmedUrl = profilePictureUrlInput.trim();
    setIsUpdatingProfilePicture(true);
    try {
      const result = await authClient.updateUser({ image: trimmedUrl || null });
      if ((result as { error?: { message?: string } })?.error) {
        throw new Error(
          (result as { error?: { message?: string } }).error?.message ??
            "Unable to update profile picture.",
        );
      }
      setShowProfilePictureForm(false);
      setProfilePictureUrlInput("");
      toast("Profile picture updated");
    } catch (error) {
      toast(
        getErrorMessage(error, "Failed to update profile picture"),
        "error",
      );
    } finally {
      setIsUpdatingProfilePicture(false);
    }
  }, [profilePictureUrlInput, toast]);

  const handleAccountAction = useCallback(
    (key: (typeof accountActions)[number]["key"]) => {
      if (key === "change-password") {
        setPasswordChangeError(null);
        setActivePasswordSheet("change-password");
        return;
      }
      if (key === "set-password") {
        setPasswordChangeError(null);
        setActivePasswordSheet("set-password");
        return;
      }
      if (key === "change-profile-picture") {
        setProfilePictureUrlInput(user?.image ?? "");
        setShowProfilePictureForm(true);
        return;
      }
      if (key === "reset-preferences") {
        handleResetSettings();
        return;
      }
      if (key === "delete-account") {
        handleDeleteAccount();
        return;
      }
      handleSignOut();
    },
    [handleDeleteAccount, handleResetSettings, handleSignOut, user?.image],
  );

  return (
    <AppScreen header={<StackScreenHeader title="Account" />}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionItems}>
          <SettingsAccountCard
            name={user?.name}
            email={user?.email}
            imageUrl={user?.image}
            theme={theme}
          />
          {hasOAuthAccount ? (
            <SettingsHintRow
              text={
                hasPasswordAccount
                  ? "Email sign-in updates your login password. Existing encrypted data stays intact."
                  : "Adding an email password gives this account an email sign-in option without changing your existing encrypted data."
              }
              theme={theme}
            />
          ) : null}
          {accountActions.map((action) => (
            <SettingsActionRow
              key={action.key}
              icon={action.icon}
              label={action.label}
              description={action.description}
              onPress={() => handleAccountAction(action.key)}
              theme={theme}
              destructive={action.destructive}
              isPending={
                action.key === "change-password"
                  ? isChangingPassword
                  : action.key === "set-password"
                    ? isSettingPassword
                    : action.key === "change-profile-picture"
                      ? isUpdatingProfilePicture
                      : action.key === "reset-preferences"
                        ? resetSettingsMutation.isPending
                        : action.key === "delete-account"
                          ? isDeletingAccount
                          : isSigningOut
              }
            />
          ))}
        </View>
      </ScrollView>

      <BottomSheet
        visible={showProfilePictureForm}
        onDismiss={() => {
          setShowProfilePictureForm(false);
          setProfilePictureUrlInput("");
        }}
      >
        <BottomSheetHeader>
          <BottomSheetTitle>Profile picture</BottomSheetTitle>
        </BottomSheetHeader>
        <View style={{ paddingBottom: insets.bottom + 8 }}>
          <SettingsProfilePictureForm
            value={profilePictureUrlInput}
            onChange={setProfilePictureUrlInput}
            onSubmit={() => void handleSubmitProfilePicture()}
            onCancel={() => {
              setShowProfilePictureForm(false);
              setProfilePictureUrlInput("");
            }}
            isPending={isUpdatingProfilePicture}
            theme={theme}
          />
        </View>
      </BottomSheet>

      <BottomSheet
        visible={activePasswordSheet !== null}
        onDismiss={() => {
          setActivePasswordSheet(null);
          resetChangePasswordForm();
        }}
      >
        <BottomSheetHeader>
          <BottomSheetTitle>
            {activePasswordSheet === "set-password"
              ? "Set password"
              : "Change password"}
          </BottomSheetTitle>
        </BottomSheetHeader>
        <View style={{ paddingBottom: insets.bottom + 8 }}>
          <SettingsPasswordForm
            mode={activePasswordSheet ?? "change-password"}
            currentPassword={currentPasswordInput}
            newPassword={newPasswordInput}
            confirmPassword={confirmPasswordInput}
            onCurrentPasswordChange={setCurrentPasswordInput}
            onNewPasswordChange={setNewPasswordInput}
            onConfirmPasswordChange={setConfirmPasswordInput}
            onSubmit={() => void handleSubmitPasswordChange()}
            onCancel={() => {
              setActivePasswordSheet(null);
              resetChangePasswordForm();
            }}
            error={passwordChangeError}
            isPending={isChangingPassword || isSettingPassword}
            theme={theme}
          />
        </View>
      </BottomSheet>
    </AppScreen>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    scrollView: { flex: 1 },
    scrollContent: { paddingBottom: theme.spacing["8"] },
    sectionItems: { paddingVertical: theme.spacing["1"] },
  } satisfies Record<string, ViewStyle>);
}
