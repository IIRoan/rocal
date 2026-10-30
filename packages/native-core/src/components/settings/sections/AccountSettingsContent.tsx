import React, { useCallback, useMemo, useReducer, useState } from "react";
import { Alert } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { changePasswordWithEnvelope } from "@workspace/calendar-client";
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
import { rememberDeviceEnvelopeSalt } from "../../../lib/native-e2ee-provider";
import { useToast } from "../../../providers/ToastProvider";

const PROFILE_ACTION_KEYS: SettingsAccountActionKey[] = [
  "change-password",
  "change-profile-picture",
];
const SESSION_ACTION_KEYS: SettingsAccountActionKey[] = ["sign-out", "delete-account"];

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

function getPasswordFormError(form: PasswordFormState): string | null {
  if (!form.newPassword.trim() || !form.currentPassword.trim()) {
    return "Enter your current password and a new password.";
  }
  if (form.newPassword !== form.confirmPassword) {
    return "New password and confirmation must match.";
  }
  return null;
}

export function AccountPasswordForm({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { createPasswordEnvelope, uploadPasswordEnvelope } = useE2ee();
  const { toast } = useToast();
  const [form, dispatch] = useReducer(passwordFormReducer, EMPTY_PASSWORD_FORM);

  const changePassword = async () => {
    const envelope = await createPasswordEnvelope(form.newPassword);
    // The envelope travels with the new password so the server stores both or neither.
    await changePasswordWithEnvelope({
      envelope,
      change: async (passwordEnvelope) => {
        const result = await authClient.changePassword({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
          email: user?.email ?? "",
          passwordEnvelope,
        });
        if (result.error) {
          throw new Error(
            result.error.message ?? "Unable to update your password.",
          );
        }
        return result.data;
      },
      upload: uploadPasswordEnvelope,
    });
    await rememberDeviceEnvelopeSalt(envelope.kdfSalt).catch(() => undefined);
    toast("Password updated");
    onClose();
  };

  const submit = async () => {
    const invalid = getPasswordFormError(form);
    if (invalid) {
      dispatch({ type: "fail", error: invalid });
      return;
    }
    dispatch({ type: "submit" });
    await changePassword().catch((error: unknown) => {
      dispatch({
        type: "fail",
        error: getErrorMessage(error, "Failed to update your password"),
      });
    });
  };

  return (
    <SettingsPasswordForm
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
  const { hasPasswordAccount } = useMemo(
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
        hasProfilePicture,
      }),
    [hasPasswordAccount, hasProfilePicture, user],
  );

  const [pendingAction, setPendingAction] = useState<
    "sign-out" | "delete-account" | "change-profile-picture" | null
  >(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
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
      if (key === "change-password") {
        setIsChangingPassword(true);
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
          <SheetSection title="Profile and sign-in">
            <SheetGroup>{profileActions}</SheetGroup>
          </SheetSection>
        ) : null}

        {isChangingPassword ? (
          <AccountPasswordForm onClose={() => setIsChangingPassword(false)} />
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
