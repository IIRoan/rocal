import React, { useCallback, useMemo, useReducer, useState } from "react";
import { Alert } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  getErrorMessage,
  solaceProfileImageQueryKey,
  summarizeLinkedAuthAccounts,
} from "@workspace/calendar-core";
import { SettingsPage } from "../SettingsPage";
import { SettingsPasswordForm } from "../SettingsAccountForms";
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
import { useE2ee } from "../../../providers/E2eeProvider";
import { useNativeUserSettings } from "../../../hooks/use-native-user-settings";
import { useLinkedAuthAccounts } from "../../../hooks/use-linked-auth-accounts";
import { calendarApiService } from "../../../lib/api";
import { pickProfilePicture } from "../../../lib/profile-picture";
import { useToast } from "../../../providers/ToastProvider";

const PROFILE_ACTION_KEYS: SettingsAccountActionKey[] = [
  "change-password",
  "set-password",
  "change-profile-picture",
];
const SESSION_ACTION_KEYS: SettingsAccountActionKey[] = ["sign-out", "delete-account"];

type PasswordMode = "change-password" | "set-password";

interface PasswordFormState {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  error: string | null;
  isPending: boolean;
}

type PasswordFormAction =
  | {
      type: "edit";
      field: "currentPassword" | "newPassword" | "confirmPassword";
      value: string;
    }
  | { type: "submit" }
  | { type: "fail"; error: string };

const EMPTY_PASSWORD_FORM: PasswordFormState = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
  error: null,
  isPending: false,
};

function passwordFormReducer(
  state: PasswordFormState,
  action: PasswordFormAction,
): PasswordFormState {
  switch (action.type) {
    case "edit":
      return { ...state, [action.field]: action.value };
    case "submit":
      return { ...state, error: null, isPending: true };
    case "fail":
      return { ...state, error: action.error, isPending: false };
  }
}

function getPasswordFormError(
  mode: PasswordMode,
  form: PasswordFormState,
): string | null {
  if (!form.newPassword.trim()) {
    return mode === "change-password"
      ? "Enter your current password and a new password."
      : "Enter a new password and confirm it.";
  }
  if (mode === "change-password" && !form.currentPassword.trim()) {
    return "Enter your current password and a new password.";
  }
  if (form.newPassword !== form.confirmPassword) {
    return "New password and confirmation must match.";
  }
  return null;
}

function AccountPasswordForm({
  mode,
  onClose,
}: {
  mode: PasswordMode;
  onClose: () => void;
}) {
  const { resetEncryptionPassword } = useE2ee();
  const { toast } = useToast();
  const accountsQuery = useLinkedAuthAccounts();
  const [form, dispatch] = useReducer(passwordFormReducer, EMPTY_PASSWORD_FORM);

  const submit = async () => {
    const invalid = getPasswordFormError(mode, form);
    if (invalid) {
      dispatch({ type: "fail", error: invalid });
      return;
    }
    dispatch({ type: "submit" });

    try {
      if (mode === "change-password") {
        const result = await authClient.changePassword({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        });
        if (result?.error) {
          throw new Error(
            result.error.message ?? "Unable to update your password.",
          );
        }
        toast("Password updated");
      } else {
        const result = await (
          authClient as typeof authClient & {
            setPassword: (input: { newPassword: string }) => Promise<{
              error?: { message?: string };
            } | void>;
          }
        ).setPassword({
          newPassword: form.newPassword,
        });
        if (result?.error) {
          throw new Error(
            result.error.message ?? "Unable to set your password.",
          );
        }
        await accountsQuery.refetch();
        toast("Email password added");
      }
      // The envelope follows the sign-in password; if this fails, the next device asks for the previous one and re-wraps.
      await resetEncryptionPassword(form.newPassword).catch(() => false);
      onClose();
    } catch (error) {
      dispatch({
        type: "fail",
        error: getErrorMessage(error, "Failed to update your password"),
      });
    }
  };

  return (
    <SettingsPasswordForm
      mode={mode}
      currentPassword={form.currentPassword}
      newPassword={form.newPassword}
      confirmPassword={form.confirmPassword}
      onCurrentPasswordChange={(value) =>
        dispatch({ type: "edit", field: "currentPassword", value })
      }
      onNewPasswordChange={(value) =>
        dispatch({ type: "edit", field: "newPassword", value })
      }
      onConfirmPasswordChange={(value) =>
        dispatch({ type: "edit", field: "confirmPassword", value })
      }
      onSubmit={() => void submit()}
      onCancel={onClose}
      error={form.error}
      isPending={form.isPending}
    />
  );
}

export function AccountSettingsContent() {
  const queryClient = useQueryClient();
  const { user, signOut, refreshUser } = useAuth();
  const { toast } = useToast();
  const { resetSettingsMutation } = useNativeUserSettings();

  const accountsQuery = useLinkedAuthAccounts();
  const { hasPasswordAccount, hasOAuthAccount } = useMemo(
    () => summarizeLinkedAuthAccounts(accountsQuery.data ?? []),
    [accountsQuery.data],
  );
  const [pictureLoaded, setPictureLoaded] = useState(false);
  // A broken or still-loading picture shows the Blobatar, so treat it as no picture.
  const hasProfilePicture = Boolean(user?.image) && pictureLoaded;
  const accountActions = useMemo(
    () =>
      getSettingsAccountActions({
        canSignOut: Boolean(user),
        hasPasswordAccount,
        hasOAuthAccount,
        hasProfilePicture,
      }),
    [hasOAuthAccount, hasPasswordAccount, hasProfilePicture, user],
  );

  const [pendingAction, setPendingAction] = useState<
    "sign-out" | "delete-account" | "change-profile-picture" | null
  >(null);
  const [activePasswordSheet, setActivePasswordSheet] =
    useState<PasswordMode | null>(null);
  const settleAction = useCallback(
    (key: NonNullable<typeof pendingAction>) =>
      setPendingAction((current) => (current === key ? null : current)),
    [],
  );

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
          setPendingAction("sign-out");
          signOut()
            .catch((error) => {
              toast(getErrorMessage(error, "Failed to sign out"), "error");
            })
            .finally(() => {
              settleAction("sign-out");
            });
        },
      },
    ]);
  }, [settleAction, signOut, toast]);

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
            setPendingAction("delete-account");
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
                settleAction("delete-account");
              });
          },
        },
      ],
    );
  }, [queryClient, settleAction, signOut, toast]);

  const saveProfilePicture = useCallback(
    async (mode: "upload" | "remove") => {
      try {
        const image = mode === "upload" ? await pickProfilePicture() : null;
        if (mode === "upload" && !image) return;
        setPendingAction("change-profile-picture");
        await (image
          ? calendarApiService.uploadProfileAvatar({ image })
          : calendarApiService.removeProfileAvatar());
        await refreshUser();
        void queryClient.invalidateQueries({
          queryKey: solaceProfileImageQueryKey(user?.email),
        });
        toast(image ? "Profile picture updated" : "Profile picture removed");
      } catch (error) {
        toast(
          getErrorMessage(error, "Failed to update profile picture"),
          "error",
        );
      } finally {
        settleAction("change-profile-picture");
      }
    },
    [queryClient, refreshUser, settleAction, toast, user?.email],
  );

  const handleChangeProfilePicture = useCallback(() => {
    if (!hasProfilePicture) {
      void saveProfilePicture("upload");
      return;
    }
    Alert.alert("Profile picture", undefined, [
      { text: "Choose Photo", onPress: () => void saveProfilePicture("upload") },
      {
        text: "Remove Photo",
        style: "destructive",
        onPress: () => void saveProfilePicture("remove"),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [hasProfilePicture, saveProfilePicture]);

  const handleAccountAction = useCallback(
    (key: (typeof accountActions)[number]["key"]) => {
      if (key === "change-password" || key === "set-password") {
        setActivePasswordSheet(key);
        return;
      }
      if (key === "change-profile-picture") {
        handleChangeProfilePicture();
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
      handleChangeProfilePicture,
      handleDeleteAccount,
      handleResetSettings,
      handleSignOut,
    ],
  );

  const actionPending = (key: SettingsAccountActionKey) =>
    key === "reset-preferences"
      ? resetSettingsMutation.isPending
      : key === pendingAction;

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
            // oxlint-disable-next-line react-doctor/jsx-no-jsx-as-prop -- SheetItem is not memoized, so a fresh element costs nothing.
            leading={
              <BlobatarAvatar
                email={user?.email}
                name={user?.name}
                src={user?.image}
                size={40}
                onImageLoadedChange={setPictureLoaded}
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
          <AccountPasswordForm
            key={activePasswordSheet}
            mode={activePasswordSheet}
            onClose={() => setActivePasswordSheet(null)}
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
