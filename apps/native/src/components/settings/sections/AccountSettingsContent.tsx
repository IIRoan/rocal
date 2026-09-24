import React, { useCallback, useMemo, useState } from "react";
import { Alert } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  extractLinkedAuthAccounts,
  getErrorMessage,
  summarizeLinkedAuthAccounts,
  type LinkedAuthAccountLike,
} from "@workspace/calendar-core";
import { SettingsPage } from "../SettingsPage";
import {
  SettingsPasswordForm,
  SettingsProfilePictureForm,
} from "../SettingsAccountForms";
import { BlobatarAvatar } from "../../BlobatarAvatar";
import {
  SheetGroup,
  SheetItem,
  SheetScroll,
  SheetSection,
} from "../../sheet/SheetSections";
import { authClient } from "../../../lib/auth-client";
import {
  getSettingsAccountActions,
  type SettingsAccountActionKey,
} from "../../../lib/settings-screen-utils";
import { useAuth } from "../../../providers/AuthProvider";
import { useNativeUserSettings } from "../../../hooks/use-native-user-settings";
import { calendarApiService } from "../../../lib/api";
import { useToast } from "../../../providers/ToastProvider";

const PROFILE_ACTION_KEYS: SettingsAccountActionKey[] = [
  "change-password",
  "set-password",
  "change-profile-picture",
];
const SESSION_ACTION_KEYS: SettingsAccountActionKey[] = ["sign-out", "delete-account"];

export function AccountSettingsContent() {
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
      if (key === "change-password" || key === "set-password") {
        setShowProfilePictureForm(false);
        setPasswordChangeError(null);
        setActivePasswordSheet(key);
        return;
      }
      if (key === "change-profile-picture") {
        setActivePasswordSheet(null);
        resetChangePasswordForm();
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
    [
      handleDeleteAccount,
      handleResetSettings,
      handleSignOut,
      resetChangePasswordForm,
      user?.image,
    ],
  );

  const actionPending = (key: SettingsAccountActionKey) =>
    key === "change-password"
      ? isChangingPassword
      : key === "set-password"
        ? isSettingPassword
        : key === "change-profile-picture"
          ? isUpdatingProfilePicture
          : key === "reset-preferences"
            ? resetSettingsMutation.isPending
            : key === "delete-account"
              ? isDeletingAccount
              : isSigningOut;

  const renderActions = (keys: SettingsAccountActionKey[]) =>
    accountActions.flatMap((action) =>
      keys.includes(action.key)
        ? [
            <SheetItem
              key={action.key}
              icon={action.icon}
              label={action.label}
              detail={action.description}
              tone={action.destructive ? "destructive" : "default"}
              pending={actionPending(action.key)}
              onPress={() => handleAccountAction(action.key)}
            />,
          ]
        : [],
    );

  const profileActions = renderActions(PROFILE_ACTION_KEYS);
  const preferenceActions = renderActions(["reset-preferences"]);
  const sessionActions = renderActions(SESSION_ACTION_KEYS);
  const displayName = user?.name?.trim() || null;
  const displayEmail = user?.email?.trim() || null;

  return (
    <SettingsPage title="Account">
      <SheetScroll>
        <SheetGroup>
          <SheetItem
            label={displayName ?? displayEmail ?? "Solace account"}
            detail={displayName ? (displayEmail ?? undefined) : undefined}
            leading={
              <BlobatarAvatar
                email={user?.email}
                name={user?.name}
                src={user?.image}
                size={40}
              />
            }
          />
        </SheetGroup>

        {profileActions.length > 0 ? (
          <SheetSection
            title="Profile and sign-in"
            footer={
              hasOAuthAccount
                ? hasPasswordAccount
                  ? "Email sign-in updates your login password. Existing encrypted data stays intact."
                  : "Adding an email password gives this account an email sign-in option without changing your existing encrypted data."
                : undefined
            }
          >
            <SheetGroup>{profileActions}</SheetGroup>
          </SheetSection>
        ) : null}

        {activePasswordSheet ? (
          <SettingsPasswordForm
            mode={activePasswordSheet}
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
          />
        ) : null}

        {showProfilePictureForm ? (
          <SettingsProfilePictureForm
            value={profilePictureUrlInput}
            onChange={setProfilePictureUrlInput}
            onSubmit={() => void handleSubmitProfilePicture()}
            onCancel={() => {
              setShowProfilePictureForm(false);
              setProfilePictureUrlInput("");
            }}
            isPending={isUpdatingProfilePicture}
          />
        ) : null}

        {preferenceActions.length > 0 ? (
          <SheetSection title="Preferences">
            <SheetGroup>{preferenceActions}</SheetGroup>
          </SheetSection>
        ) : null}

        {sessionActions.length > 0 ? (
          <SheetSection title="Session">
            <SheetGroup>{sessionActions}</SheetGroup>
          </SheetSection>
        ) : null}
      </SheetScroll>
    </SettingsPage>
  );
}
