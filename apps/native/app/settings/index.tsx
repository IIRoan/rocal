import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image as ImageNative,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import type { Passkey as AuthPasskey } from "@better-auth/passkey/client";
import type {
  Calendar,
  CalendarView,
  UserSettings,
  UpdateSettingsRequest,
  LinkedAuthAccountLike,
} from "@workspace/calendar-core";
import {
  extractLinkedAuthAccounts,
  getErrorMessage,
  partitionCalendarsByKind,
  summarizeLinkedAuthAccounts,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import {
  useTheme,
  type ThemePreference,
} from "../../src/providers/ThemeProvider";
import { useToast } from "../../src/providers/ToastProvider";
import { authClient } from "../../src/lib/auth-client";
import { useAuth } from "../../src/providers/AuthProvider";
import { calendarApiService } from "../../src/lib/api";
import { SETTINGS_TIMEZONE_ROUTE } from "../../src/lib/auth-routing";
import { formatStoredPasskeyDescription } from "../../src/lib/passkey-auth";
import { getAuthCapabilities } from "../../src/lib/auth-capabilities";
import {
  isPasskeyBridgeOriginSecure,
  resolvePasskeyBridgeBaseUrl,
} from "../../src/lib/passkey-browser-bridge";
import { QUERY_KEYS } from "../../src/lib/query-keys";
import {
  THEME_OPTIONS,
  VIEW_OPTIONS,
  WEEK_START_OPTIONS,
  TIME_FORMAT_OPTIONS,
  WEEKDAY_OPTIONS,
} from "../../src/lib/settings-options";
import { getSettingsAccountActions } from "../../src/lib/settings-screen-utils";
import { StackScreenHeader } from "../../src/components/StackScreenHeader";
import { BottomSheet } from "../../src/components/BottomSheet";
import {
  SheetActions,
  SheetPrimaryButton,
  SheetSecondaryButton,
} from "../../src/components/sheet";
import { LoadingScreen } from "../../src/components/ui/loading";

// ─── Types ───────────────────────────────────────────────────────────────────

type FeatherIcon = React.ComponentProps<typeof Feather>["name"];

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseWorkingDayValue(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 && value <= 6 ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 6
      ? parsed
      : null;
  }

  return null;
}

/** Parse persisted working days into a Set, supporting both JSON and legacy CSV. */
function parseWorkingDays(workingDays: string): Set<number> {
  if (!workingDays) return new Set(DEFAULT_WORKING_DAYS);

  try {
    const parsed = JSON.parse(workingDays);
    if (Array.isArray(parsed)) {
      return new Set(
        parsed.map(parseWorkingDayValue).filter((n): n is number => n !== null),
      );
    }
  } catch {
    // Fall through to legacy CSV parsing.
  }

  return new Set(
    workingDays
      .split(",")
      .map(parseWorkingDayValue)
      .filter((n): n is number => n !== null),
  );
}

/** Serialize working days to the same JSON shape the web client uses. */
function serializeWorkingDays(days: Set<number>): string {
  return JSON.stringify(Array.from(days).sort((a, b) => a - b));
}

/** Format a set of working days to a short readable label. */
function formatWorkingDaysLabel(daysSet: Set<number>): string {
  const count = daysSet.size;
  if (count === 0) return "None";
  if (count === 7) return "Every day";
  if (count === 5 && !daysSet.has(0) && !daysSet.has(6)) return "Mon – Fri";
  return `${count} day${count !== 1 ? "s" : ""}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { theme, themePreference, setThemePreference } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();
  const { push } = useRouter();
  const { user, signOut, registerPasskey, deletePasskey } = useAuth();
  const { toast } = useToast();
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

  // ─── Data fetching ─────────────────────────────────────────────────────────

  const {
    data: settings,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: QUERY_KEYS.settings(),
    queryFn: () => calendarApiService.getUserSettings(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: calendars = [] } = useQuery({
    queryKey: QUERY_KEYS.calendars(),
    queryFn: () => calendarApiService.getCalendars(),
    staleTime: 5 * 60 * 1000,
  });

  const { ownedCalendars } = useMemo(
    () => partitionCalendarsByKind(calendars),
    [calendars],
  );

  const sortedOwnedCalendars = useMemo(
    () =>
      [...ownedCalendars].sort((left, right) => {
        if (left.isDefault !== right.isDefault) {
          return left.isDefault ? -1 : 1;
        }

        return left.name.localeCompare(right.name);
      }),
    [ownedCalendars],
  );

  // ─── Optimistic update mutation ────────────────────────────────────────────

  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [pendingDefaultCalendarId, setPendingDefaultCalendarId] = useState<
    string | null
  >(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isUpdatingProfilePicture, setIsUpdatingProfilePicture] =
    useState(false);
  const [showProfilePictureForm, setShowProfilePictureForm] = useState(false);
  const [profilePictureUrlInput, setProfilePictureUrlInput] = useState("");
  const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false);
  const [pendingPasskeyDeletionId, setPendingPasskeyDeletionId] = useState<
    string | null
  >(null);
  const [activePasswordSheet, setActivePasswordSheet] = useState<
    "change-password" | "set-password" | null
  >(null);
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(
    null,
  );
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const linkedAccounts = useMemo(
    () => accountsQuery.data ?? ([] as LinkedAuthAccountLike[]),
    [accountsQuery.data],
  );
  const { hasPasswordAccount, hasOAuthAccount } = useMemo(
    () => summarizeLinkedAuthAccounts(linkedAccounts),
    [linkedAccounts],
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
  const storedPasskeys = useMemo(
    () => (Array.isArray(passkeysQuery.data) ? passkeysQuery.data : []),
    [passkeysQuery.data],
  );

  // ─── Picker sheet state ──────────────────────────────────────────────────────
  type PickerKey =
    | "theme"
    | "defaultView"
    | "timeFormat"
    | "weekStart"
    | "defaultCalendar"
    | "workingDays";
  const [activePicker, setActivePicker] = useState<PickerKey | null>(null);
  const [lastPicker, setLastPicker] = useState<PickerKey | null>(null);
  const openPicker = useCallback((key: PickerKey) => {
    setLastPicker(key);
    setActivePicker(key);
  }, []);

  const updateSettingsMutation = useMutation({
    mutationFn: (update: UpdateSettingsRequest) =>
      calendarApiService.updateUserSettings(update),
    onMutate: async (update) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.settings() });
      const previous = queryClient.getQueryData<UserSettings>(
        QUERY_KEYS.settings(),
      );
      if (previous) {
        queryClient.setQueryData<UserSettings>(QUERY_KEYS.settings(), {
          ...previous,
          ...update,
        });
      }
      const keys = Object.keys(update);
      setPendingKeys((prev) => {
        const next = new Set(prev);
        for (const k of keys) next.add(k);
        return next;
      });
      return { previous };
    },
    onError: (_err, _update, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEYS.settings(), context.previous);
      }
    },
    onSettled: (_data, _error, update) => {
      const keys = Object.keys(update);
      setPendingKeys((prev) => {
        const next = new Set(prev);
        for (const k of keys) next.delete(k);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings() });
    },
  });

  const updateSetting = useCallback(
    (update: UpdateSettingsRequest) => {
      updateSettingsMutation.mutate(update);
    },
    [updateSettingsMutation],
  );

  const setDefaultCalendarMutation = useMutation({
    mutationFn: (calendarId: string) =>
      calendarApiService.updateCalendar(calendarId, { isDefault: true }),
    onMutate: async (calendarId) => {
      setPendingDefaultCalendarId(calendarId);
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.calendars() });

      const previous = queryClient.getQueryData<Calendar[]>(
        QUERY_KEYS.calendars(),
      );

      if (previous) {
        queryClient.setQueryData<Calendar[]>(
          QUERY_KEYS.calendars(),
          previous.map((calendar) => ({
            ...calendar,
            isDefault: calendar.id === calendarId,
          })),
        );
      }

      return { previous };
    },
    onError: (error, _calendarId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEYS.calendars(), context.previous);
      }

      toast(
        getErrorMessage(error, "Failed to update default calendar"),
        "error",
      );
    },
    onSettled: () => {
      setPendingDefaultCalendarId(null);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.calendars() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings() });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  const resetSettingsMutation = useMutation({
    mutationFn: () => calendarApiService.resetUserSettings(),
    onSuccess: () => {
      setThemePreference("system");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.calendars() });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast("Settings reset to defaults");
    },
    onError: (error) => {
      toast(getErrorMessage(error, "Failed to reset settings"), "error");
    },
  });

  // ─── Theme handler ────────────────────────────────────────────────────────

  const handleThemeChange = useCallback(
    (pref: ThemePreference) => {
      setThemePreference(pref);
      updateSetting({ theme: pref });
    },
    [setThemePreference, updateSetting],
  );

  // ─── Working days handler ──────────────────────────────────────────────────

  const workingDaysSet = useMemo(
    () => parseWorkingDays(settings?.workingDays ?? "[1,2,3,4,5]"),
    [settings?.workingDays],
  );

  const handleToggleWorkingDay = useCallback(
    (day: number) => {
      const next = new Set(workingDaysSet);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      updateSetting({ workingDays: serializeWorkingDays(next) });
    },
    [workingDaysSet, updateSetting],
  );

  // ─── Picker display labels ───────────────────────────────────────────────────
  const themeLabel =
    THEME_OPTIONS.find((o) => o.value === themePreference)?.label ?? "System";
  const viewLabel =
    VIEW_OPTIONS.find((o) => o.value === (settings?.defaultView ?? "month"))
      ?.label ?? "Month View";
  const timeFormatLabel =
    TIME_FORMAT_OPTIONS.find((o) => o.value === (settings?.timeFormat ?? "12h"))
      ?.label ?? "12h";
  const weekStartLabel =
    WEEK_START_OPTIONS.find((o) => o.value === (settings?.weekStartDay ?? 0))
      ?.label ?? "Sunday";
  const defaultCalendarLabel =
    sortedOwnedCalendars.find((c) => c.isDefault)?.name ??
    sortedOwnedCalendars[0]?.name ??
    "Not set";
  const workingDaysLabel = formatWorkingDaysLabel(workingDaysSet);

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
  }, [signOut]);

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
  }, [queryClient, signOut]);

  const resetChangePasswordForm = useCallback(() => {
    setCurrentPasswordInput("");
    setNewPasswordInput("");
    setConfirmPasswordInput("");
    setPasswordChangeError(null);
  }, []);

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
      } else if (activePasswordSheet === "set-password") {
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

        await accountsQuery?.refetch?.();
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
  ]);

  const handleSubmitProfilePicture = useCallback(async () => {
    const trimmedUrl = profilePictureUrlInput.trim();
    setIsUpdatingProfilePicture(true);
    try {
      const result = await authClient.updateUser({ image: trimmedUrl || null });
      if ((result as any)?.error) {
        throw new Error(
          (result as any).error?.message ?? "Unable to update profile picture.",
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
  }, [profilePictureUrlInput]);

  const handleAccountAction = useCallback(
    (key: (typeof accountActions)[number]["key"]) => {
      if (key === "change-password") {
        setPasswordChangeError(null);
        setActivePasswordSheet((current) => {
          const next = current === "change-password" ? null : "change-password";
          if (!next) {
            resetChangePasswordForm();
          }
          return next;
        });
        return;
      }

      if (key === "set-password") {
        setPasswordChangeError(null);
        setActivePasswordSheet((current) => {
          const next = current === "set-password" ? null : "set-password";
          if (!next) {
            resetChangePasswordForm();
          }
          return next;
        });
        return;
      }

      if (key === "change-profile-picture") {
        setShowProfilePictureForm((current) => {
          if (!current) {
            setProfilePictureUrlInput(user?.image ?? "");
          }
          return !current;
        });
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
  }, [passkeysQuery, registerPasskey]);

  const handleDeletePasskey = useCallback(
    (passkey: AuthPasskey) => {
      const passkeyLabel = passkey.name || "this passkey";

      Alert.alert(
        "Delete passkey?",
        `Remove ${passkeyLabel} from your account?`,
        [
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
        ],
      );
    },
    [deletePasskey, passkeysQuery],
  );

  // ─── Loading state ─────────────────────────────────────────────────────────

  if (isLoading) {
    return <LoadingScreen theme={theme} message="Loading settings…" />;
  }

  // ─── Error state ───────────────────────────────────────────────────────────

  if (isError) {
    const errorMessage =
      error && typeof error === "object" && "message" in error
        ? (error as { message: string }).message
        : "Failed to load settings";
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <StackScreenHeader title="Settings" />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StackScreenHeader title="Settings" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Appearance ───────────────────────────────────────────────── */}
        <SectionLabel text="Appearance" theme={theme} />
        <View style={styles.sectionItems}>
          <PickerRow
            icon="sun"
            label="Theme"
            value={themeLabel}
            onPress={() => openPicker("theme")}
            theme={theme}
            isPending={pendingKeys.has("theme")}
          />
          <PickerRow
            icon="grid"
            label="Default View"
            value={viewLabel}
            onPress={() => openPicker("defaultView")}
            theme={theme}
            isPending={pendingKeys.has("defaultView")}
          />
        </View>

        {/* ── Time & Region ────────────────────────────────────────────── */}
        <SectionLabel text="Time & Region" theme={theme} isFirst={false} />
        <View style={styles.sectionItems}>
          <PickerRow
            icon="clock"
            label="Time Format"
            value={timeFormatLabel}
            onPress={() => openPicker("timeFormat")}
            theme={theme}
            isPending={pendingKeys.has("timeFormat")}
          />
          <NavigationRow
            icon="globe"
            label="Timezone"
            value={
              settings?.timezone ??
              Intl.DateTimeFormat().resolvedOptions().timeZone
            }
            onPress={() => push(SETTINGS_TIMEZONE_ROUTE)}
            theme={theme}
          />
        </View>

        {/* ── Calendar Defaults ────────────────────────────────────────── */}
        <SectionLabel text="Calendar Defaults" theme={theme} isFirst={false} />
        <View style={styles.sectionItems}>
          <PickerRow
            icon="star"
            label="Default Calendar"
            value={defaultCalendarLabel}
            onPress={() => openPicker("defaultCalendar")}
            theme={theme}
            isPending={Boolean(pendingDefaultCalendarId)}
          />
          <PickerRow
            icon="calendar"
            label="Week Starts On"
            value={weekStartLabel}
            onPress={() => openPicker("weekStart")}
            theme={theme}
            isPending={pendingKeys.has("weekStartDay")}
          />
          <PickerRow
            icon="briefcase"
            label="Working Days"
            value={workingDaysLabel}
            onPress={() => openPicker("workingDays")}
            theme={theme}
          />
        </View>

        {/* ── Notifications ────────────────────────────────────────────── */}
        <SectionLabel text="Notifications" theme={theme} isFirst={false} />
        <View style={styles.sectionItems}>
          <SettingToggleRow
            icon="mail"
            label="Email Notifications"
            description="Receive event reminders via email"
            value={settings?.emailNotifications ?? true}
            onValueChange={(v) => updateSetting({ emailNotifications: v })}
            isPending={pendingKeys.has("emailNotifications")}
            theme={theme}
          />
        </View>

        {/* ── Security ─────────────────────────────────────────────────── */}
        <SectionLabel text="Security" theme={theme} isFirst={false} />
        <View style={styles.sectionItems}>
          <HintRow
            text="Event content is always end-to-end encrypted on mobile. Reminder emails only include timing details."
            theme={theme}
          />
          {isPasskeySupported ? (
            <>
              <ActionRow
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
                  <PasskeyRow
                    key={passkey.id}
                    passkey={passkey}
                    onDelete={() => handleDeletePasskey(passkey)}
                    theme={theme}
                    isPending={pendingPasskeyDeletionId === passkey.id}
                  />
                ))
              ) : (
                <HintRow
                  text="No passkeys saved yet. Add one to sign in with Face ID, Touch ID, or your device credential manager."
                  theme={theme}
                />
              )}
            </>
          ) : (
            <HintRow
              text={
                Platform.OS === "web"
                  ? passkeySupportMessage
                  : `${passkeySupportMessage} Native passkeys also need the passkey domain, apple-app-site-association, and assetlinks setup to match your build.`
              }
              theme={theme}
            />
          )}
        </View>

        {/* ── Account ──────────────────────────────────────────────────── */}
        <SectionLabel text="Account" theme={theme} isFirst={false} />
        <View style={styles.sectionItems}>
          <AccountInfoCard
            name={user?.name}
            email={user?.email}
            imageUrl={user?.image}
            theme={theme}
          />
          {hasOAuthAccount ? (
            <HintRow
              text={
                hasPasswordAccount
                  ? "Email sign-in updates your login password. Existing encrypted data stays intact."
                  : "Adding an email password gives this account an email sign-in option without changing your existing encrypted data."
              }
              theme={theme}
            />
          ) : null}
          {accountActions.map((action) => (
            <ActionRow
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

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Picker bottom sheet */}
      <BottomSheet
        visible={activePicker !== null}
        onDismiss={() => setActivePicker(null)}
      >
        <View style={{ paddingVertical: 8, paddingBottom: insets.bottom + 8 }}>
          {lastPicker === "theme" &&
            THEME_OPTIONS.map((opt) => (
              <SheetPickerOption
                key={opt.value}
                icon={opt.icon}
                label={opt.label}
                isSelected={themePreference === opt.value}
                onPress={() => {
                  handleThemeChange(opt.value);
                  setActivePicker(null);
                }}
                theme={theme}
              />
            ))}
          {lastPicker === "defaultView" &&
            VIEW_OPTIONS.map((opt) => (
              <SheetPickerOption
                key={opt.value}
                icon={opt.icon}
                label={opt.label}
                isSelected={(settings?.defaultView ?? "month") === opt.value}
                onPress={() => {
                  updateSetting({ defaultView: opt.value });
                  setActivePicker(null);
                }}
                theme={theme}
              />
            ))}
          {lastPicker === "timeFormat" &&
            TIME_FORMAT_OPTIONS.map((opt) => (
              <SheetPickerOption
                key={opt.value}
                label={opt.label}
                isSelected={(settings?.timeFormat ?? "12h") === opt.value}
                onPress={() => {
                  updateSetting({ timeFormat: opt.value });
                  setActivePicker(null);
                }}
                theme={theme}
              />
            ))}
          {lastPicker === "weekStart" &&
            WEEK_START_OPTIONS.map((opt) => (
              <SheetPickerOption
                key={opt.value}
                label={opt.label}
                isSelected={(settings?.weekStartDay ?? 0) === opt.value}
                onPress={() => {
                  updateSetting({ weekStartDay: opt.value });
                  setActivePicker(null);
                }}
                theme={theme}
              />
            ))}
          {lastPicker === "defaultCalendar" &&
            (sortedOwnedCalendars.length === 0 ? (
              <View
                style={{
                  paddingHorizontal: 20,
                  paddingVertical: theme.spacing["3"],
                }}
              >
                <Text
                  style={{
                    fontSize: theme.typography.fontSize.sm.size,
                    color: theme.colors.mutedForeground,
                  }}
                >
                  No calendars yet. Create one first.
                </Text>
              </View>
            ) : (
              sortedOwnedCalendars.map((calendar) => (
                <SheetPickerOption
                  key={calendar.id}
                  label={calendar.name}
                  isSelected={calendar.isDefault}
                  onPress={() => {
                    setDefaultCalendarMutation.mutate(calendar.id);
                    setActivePicker(null);
                  }}
                  theme={theme}
                />
              ))
            ))}
          {lastPicker === "workingDays" &&
            WEEKDAY_OPTIONS.map((day) => {
              const isActive = workingDaysSet.has(day.value);
              return (
                <SheetPickerOption
                  key={day.value}
                  label={day.label}
                  isSelected={isActive}
                  onPress={() => handleToggleWorkingDay(day.value)}
                  theme={theme}
                  multiSelect
                />
              );
            })}
        </View>
      </BottomSheet>

      {/* Profile picture bottom sheet */}
      <BottomSheet
        visible={showProfilePictureForm}
        onDismiss={() => {
          setShowProfilePictureForm(false);
          setProfilePictureUrlInput("");
        }}
      >
        <View style={{ paddingBottom: insets.bottom + 8 }}>
          <ProfilePictureCard
            value={profilePictureUrlInput}
            onChange={setProfilePictureUrlInput}
            onSubmit={handleSubmitProfilePicture}
            onCancel={() => {
              setShowProfilePictureForm(false);
              setProfilePictureUrlInput("");
            }}
            isPending={isUpdatingProfilePicture}
            theme={theme}
          />
        </View>
      </BottomSheet>

      {/* Change password bottom sheet */}
      <BottomSheet
        visible={activePasswordSheet !== null}
        onDismiss={() => {
          setActivePasswordSheet(null);
          resetChangePasswordForm();
        }}
      >
        <View style={{ paddingBottom: insets.bottom + 8 }}>
          <PasswordChangeCard
            mode={activePasswordSheet ?? "change-password"}
            currentPassword={currentPasswordInput}
            newPassword={newPasswordInput}
            confirmPassword={confirmPasswordInput}
            onCurrentPasswordChange={setCurrentPasswordInput}
            onNewPasswordChange={setNewPasswordInput}
            onConfirmPasswordChange={setConfirmPasswordInput}
            onSubmit={handleSubmitPasswordChange}
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
    </SafeAreaView>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Small uppercase section label, matching the web command palette style. */
function SectionLabel({
  text,
  theme,
  isFirst = true,
}: {
  text: string;
  theme: ThemeTokens;
  isFirst?: boolean;
}) {
  return (
    <View
      style={{
        paddingHorizontal: theme.spacing["4"],
        paddingTop: isFirst ? theme.spacing["3"] : theme.spacing["2"],
        paddingBottom: theme.spacing["1"],
        ...(isFirst
          ? {}
          : {
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: theme.colors.border,
              marginTop: theme.spacing["2"],
            }),
      }}
    >
      <Text
        style={{
          fontSize: theme.typography.fontSize.xs.size,
          lineHeight: theme.typography.fontSize.xs.lineHeight,
          fontWeight: theme.typography.fontWeight
            .medium as TextStyle["fontWeight"],
          color: theme.colors.mutedForeground,
        }}
        accessibilityRole="header"
      >
        {text}
      </Text>
    </View>
  );
}

/** A pressable row with icon, label, and a check mark when selected. */
function HintRow({ text, theme }: { text: string; theme: ThemeTokens }) {
  return (
    <View
      style={{
        paddingHorizontal: theme.spacing["3"],
        paddingVertical: theme.spacing["2"],
      }}
    >
      <Text
        style={{
          fontSize: theme.typography.fontSize.xs.size,
          lineHeight: theme.typography.fontSize.xs.lineHeight,
          color: theme.colors.mutedForeground,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

/** A pressable row that opens a picker sheet, with icon, label, current value, and chevron. */
function PickerRow({
  icon,
  label,
  value,
  onPress,
  theme,
  isPending,
}: {
  icon: FeatherIcon;
  label: string;
  value: string;
  onPress: () => void;
  theme: ThemeTokens;
  isPending?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: theme.spacing["3"],
          paddingHorizontal: theme.spacing["3"],
          paddingVertical: theme.spacing["3"],
          minHeight: 48,
          borderRadius: theme.borderRadius.md,
          marginHorizontal: theme.spacing["1"],
        },
        pressed && { backgroundColor: theme.colors.accent },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      <Feather name={icon} size={16} color={theme.colors.mutedForeground} />
      <Text
        style={{
          flex: 1,
          fontSize: theme.typography.fontSize.sm.size,
          lineHeight: theme.typography.fontSize.sm.lineHeight,
          color: theme.colors.foreground,
        }}
      >
        {label}
      </Text>
      {isPending ? (
        <ActivityIndicator size="small" />
      ) : (
        <>
          <Text
            style={{
              fontSize: theme.typography.fontSize.sm.size,
              lineHeight: theme.typography.fontSize.sm.lineHeight,
              color: theme.colors.mutedForeground,
            }}
            numberOfLines={1}
          >
            {value}
          </Text>
          <Feather
            name="chevron-right"
            size={14}
            color={theme.colors.mutedForeground}
            style={{ opacity: 0.4 }}
          />
        </>
      )}
    </Pressable>
  );
}

/** A single-select (or multi-select) option row inside a picker BottomSheet. */
function SheetPickerOption({
  icon,
  label,
  isSelected,
  onPress,
  theme,
  multiSelect = false,
}: {
  icon?: FeatherIcon;
  label: string;
  isSelected: boolean;
  onPress: () => void;
  theme: ThemeTokens;
  multiSelect?: boolean;
}) {
  const activeColor = theme.colors.primaryBase;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: theme.spacing["4"],
          paddingHorizontal: 20,
          minHeight: 52,
          paddingVertical: theme.spacing["3"],
          backgroundColor: isSelected
            ? activeColor + "14"
            : ("transparent" as const),
        },
        pressed && { opacity: 0.7 },
      ]}
      accessibilityRole={multiSelect ? "switch" : "menuitem"}
      accessibilityState={
        multiSelect ? { checked: isSelected } : { selected: isSelected }
      }
      accessibilityLabel={label}
    >
      {icon ? (
        <Feather
          name={icon}
          size={18}
          color={isSelected ? activeColor : theme.colors.mutedForeground}
        />
      ) : null}
      <Text
        style={{
          flex: 1,
          fontSize: theme.typography.fontSize.base.size,
          lineHeight: theme.typography.fontSize.base.lineHeight,
          color: isSelected ? activeColor : theme.colors.foreground,
          fontWeight: (isSelected ? "600" : "400") as TextStyle["fontWeight"],
        }}
      >
        {label}
      </Text>
      {isSelected && <Feather name="check" size={16} color={activeColor} />}
    </Pressable>
  );
}

function AccountInfoCard({
  name,
  email,
  imageUrl,
  theme,
}: {
  name?: string | null;
  email?: string | null;
  imageUrl?: string | null;
  theme: ThemeTokens;
}) {
  const [imgError, setImgError] = useState(false);
  const displayName = name?.trim() || null;
  const displayEmail = email?.trim() || null;
  const title = displayName ?? displayEmail ?? "Solace account";
  const initial = title.charAt(0).toUpperCase() || "S";
  const cardStyle = {
    flexDirection: "row" as const,
    gap: theme.spacing["3"],
    paddingHorizontal: theme.spacing["3"],
    paddingVertical: theme.spacing["3"],
    marginHorizontal: theme.spacing["1"],
    marginBottom: theme.spacing["1"],
    borderRadius: theme.borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.muted + "30",
  };

  return (
    <View style={cardStyle}>
      {/* Avatar */}
      {imageUrl && !imgError ? (
        <ImageNative
          source={{ uri: imageUrl }}
          onError={() => setImgError(true)}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
          }}
        />
      ) : (
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.colors.primaryBase + "18",
          }}
        >
          <Text
            style={{
              fontSize: theme.typography.fontSize.base.size,
              lineHeight: theme.typography.fontSize.base.lineHeight,
              fontWeight: theme.typography.fontWeight
                .semibold as TextStyle["fontWeight"],
              color: theme.colors.primaryBase,
            }}
          >
            {initial}
          </Text>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0, justifyContent: "center" }}>
        <Text
          style={{
            fontSize: theme.typography.fontSize.sm.size,
            lineHeight: theme.typography.fontSize.sm.lineHeight,
            color: theme.colors.foreground,
            fontWeight: theme.typography.fontWeight
              .medium as TextStyle["fontWeight"],
          }}
          numberOfLines={1}
        >
          {title}
        </Text>
        {displayEmail ? (
          <Text
            style={{
              marginTop: theme.spacing["0.5"] ?? 2,
              fontSize: theme.typography.fontSize.xs.size,
              lineHeight: theme.typography.fontSize.xs.lineHeight,
              color: theme.colors.mutedForeground,
            }}
            numberOfLines={1}
          >
            {displayEmail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function PasswordChangeCard({
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
  mode: "change-password" | "set-password";
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

  return (
    <ScrollView
      contentContainerStyle={{
        padding: theme.spacing["4"],
        gap: theme.spacing["4"],
      }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={{ gap: theme.spacing["1"] }}>
        <Text
          style={{
            fontSize: theme.typography.fontSize.base.size,
            lineHeight: theme.typography.fontSize.base.lineHeight,
            color: theme.colors.foreground,
            fontWeight: theme.typography.fontWeight
              .semibold as TextStyle["fontWeight"],
          }}
        >
          {isChangePassword ? "Change Password" : "Set Email Password"}
        </Text>
        <Text
          style={{
            fontSize: theme.typography.fontSize.sm.size,
            lineHeight: theme.typography.fontSize.sm.lineHeight,
            color: theme.colors.mutedForeground,
          }}
        >
          {isChangePassword
            ? "Update your email sign-in password. After email sign-in, Solace also uses it to protect your encryption keys."
            : "Add an email sign-in password to this account. This gives you an email/password sign-in option without changing your existing encrypted data."}
        </Text>
      </View>

      {error ? (
        <View
          style={{
            borderRadius: theme.borderRadius.md,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.colors.destructive + "40",
            backgroundColor: theme.colors.destructive + "18",
            paddingHorizontal: theme.spacing["3"],
            paddingVertical: theme.spacing["2.5"] ?? 10,
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
          <PasswordField
            label="Current password"
            value={currentPassword}
            onChangeText={onCurrentPasswordChange}
            autoComplete="password"
            theme={theme}
          />
        ) : null}
        <PasswordField
          label="New password"
          value={newPassword}
          onChangeText={onNewPasswordChange}
          autoComplete="new-password"
          theme={theme}
        />
        <PasswordField
          label="Confirm new password"
          value={confirmPassword}
          onChangeText={onConfirmPasswordChange}
          autoComplete="new-password"
          theme={theme}
        />
      </View>

      <SheetActions>
        <SheetPrimaryButton
          label={isChangePassword ? "Update Password" : "Set Password"}
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

function ProfilePictureCard({
  value,
  onChange,
  onSubmit,
  onCancel,
  isPending,
  theme,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isPending: boolean;
  theme: ThemeTokens;
}) {
  const urlInputStyle = {
    height: 44,
    borderRadius: theme.borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.muted + "50",
    paddingHorizontal: theme.spacing["3"],
    fontSize: theme.typography.fontSize.sm.size,
    color: theme.colors.foreground,
  };

  return (
    <View
      style={{
        padding: theme.spacing["4"],
        gap: theme.spacing["4"],
      }}
    >
      {/* Header */}
      <View style={{ gap: theme.spacing["1"] }}>
        <Text
          style={{
            fontSize: theme.typography.fontSize.base.size,
            lineHeight: theme.typography.fontSize.base.lineHeight,
            color: theme.colors.foreground,
            fontWeight: theme.typography.fontWeight
              .semibold as TextStyle["fontWeight"],
          }}
        >
          Change Profile Picture
        </Text>
        <Text
          style={{
            fontSize: theme.typography.fontSize.sm.size,
            lineHeight: theme.typography.fontSize.sm.lineHeight,
            color: theme.colors.mutedForeground,
          }}
        >
          Paste the URL of the image you want to use.
        </Text>
      </View>

      <View style={{ gap: theme.spacing["1.5"] ?? 6 }}>
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
          style={urlInputStyle}
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

function PasswordField({
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
  const inputStyle = {
    borderWidth: 1,
    borderColor: theme.colors.input,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing["3"],
    paddingVertical: theme.spacing["3"],
    fontSize: theme.typography.fontSize.base.size,
    color: theme.colors.foreground,
    backgroundColor: theme.colors.background,
  };

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
        style={inputStyle}
      />
    </View>
  );
}

/** A pressable row that navigates to a sub-page, with icon, label, current value, and chevron. */
function NavigationRow({
  icon,
  label,
  value,
  onPress,
  theme,
}: {
  icon: FeatherIcon;
  label: string;
  value: string;
  onPress: () => void;
  theme: ThemeTokens;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: theme.spacing["3"],
          paddingHorizontal: theme.spacing["3"],
          paddingVertical: theme.spacing["3"],
          borderRadius: theme.borderRadius.md,
          marginHorizontal: theme.spacing["1"],
        },
        pressed && { backgroundColor: theme.colors.accent },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      <Feather name={icon} size={16} color={theme.colors.mutedForeground} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: theme.typography.fontSize.sm.size,
            lineHeight: theme.typography.fontSize.sm.lineHeight,
            color: theme.colors.foreground,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: theme.typography.fontSize.xs.size,
            lineHeight: theme.typography.fontSize.xs.lineHeight,
            color: theme.colors.mutedForeground,
          }}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
      <Feather
        name="chevron-right"
        size={14}
        color={theme.colors.mutedForeground}
        style={{ opacity: 0.4 }}
      />
    </Pressable>
  );
}

/** A toggle row with icon, label, description, and a switch. */
function SettingToggleRow({
  icon,
  label,
  description,
  value,
  onValueChange,
  isPending,
  theme,
}: {
  icon: FeatherIcon;
  label: string;
  description: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  isPending: boolean;
  theme: ThemeTokens;
}) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      style={({ pressed }) => [
        {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: theme.spacing["3"],
          paddingHorizontal: theme.spacing["3"],
          paddingVertical: theme.spacing["3"],
          borderRadius: theme.borderRadius.md,
          marginHorizontal: theme.spacing["1"],
        },
        pressed && { backgroundColor: theme.colors.accent },
      ]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
    >
      <Feather
        name={icon}
        size={16}
        color={theme.colors.mutedForeground}
        style={{ marginTop: 2 }}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: theme.typography.fontSize.sm.size,
            lineHeight: theme.typography.fontSize.sm.lineHeight,
            color: theme.colors.foreground,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: theme.typography.fontSize.xs.size,
            lineHeight: theme.typography.fontSize.xs.lineHeight,
            color: theme.colors.mutedForeground,
          }}
        >
          {description}
        </Text>
      </View>
      {isPending ? (
        <ActivityIndicator size="small" />
      ) : (
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{
            false: theme.colors.input,
            true: theme.colors.primaryBase,
          }}
          thumbColor="#ffffff"
          style={{ transform: [{ scale: 0.85 }] }}
        />
      )}
    </Pressable>
  );
}

function ActionRow({
  icon,
  label,
  description,
  onPress,
  theme,
  destructive = false,
  isPending = false,
}: {
  icon: FeatherIcon;
  label: string;
  description: string;
  onPress: () => void;
  theme: ThemeTokens;
  destructive?: boolean;
  isPending?: boolean;
}) {
  const foregroundColor = destructive
    ? theme.colors.destructive
    : theme.colors.foreground;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: theme.spacing["3"],
          paddingHorizontal: theme.spacing["3"],
          paddingVertical: theme.spacing["3"],
          borderRadius: theme.borderRadius.md,
          marginHorizontal: theme.spacing["1"],
        },
        pressed && { backgroundColor: theme.colors.accent },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Feather name={icon} size={16} color={foregroundColor} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: theme.typography.fontSize.sm.size,
            lineHeight: theme.typography.fontSize.sm.lineHeight,
            color: foregroundColor,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: theme.typography.fontSize.xs.size,
            lineHeight: theme.typography.fontSize.xs.lineHeight,
            color: theme.colors.mutedForeground,
          }}
        >
          {description}
        </Text>
      </View>
      {isPending ? (
        <ActivityIndicator size="small" color={foregroundColor} />
      ) : (
        <Feather
          name="chevron-right"
          size={14}
          color={theme.colors.mutedForeground}
        />
      )}
    </Pressable>
  );
}

function PasskeyRow({
  passkey,
  onDelete,
  theme,
  isPending,
}: {
  passkey: AuthPasskey;
  onDelete: () => void;
  theme: ThemeTokens;
  isPending: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing["3"],
        paddingHorizontal: theme.spacing["3"],
        paddingVertical: theme.spacing["2"],
        borderRadius: theme.borderRadius.md,
        marginHorizontal: theme.spacing["1"],
      }}
    >
      <Feather name="key" size={16} color={theme.colors.mutedForeground} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: theme.typography.fontSize.sm.size,
            lineHeight: theme.typography.fontSize.sm.lineHeight,
            color: theme.colors.foreground,
          }}
          numberOfLines={1}
        >
          {passkey.name || "Unnamed Passkey"}
        </Text>
        <Text
          style={{
            fontSize: theme.typography.fontSize.xs.size,
            lineHeight: theme.typography.fontSize.xs.lineHeight,
            color: theme.colors.mutedForeground,
          }}
          numberOfLines={2}
        >
          {formatStoredPasskeyDescription(passkey)}
        </Text>
      </View>
      <Pressable
        onPress={onDelete}
        style={({ pressed }) => [
          {
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: "center" as const,
            justifyContent: "center" as const,
          },
          pressed && { backgroundColor: theme.colors.accent },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${passkey.name || "passkey"}`}
      >
        {isPending ? (
          <ActivityIndicator size="small" color={theme.colors.destructive} />
        ) : (
          <Feather name="trash-2" size={16} color={theme.colors.destructive} />
        )}
      </Pressable>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    centered: {
      flex: 1,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      backgroundColor: theme.colors.background,
      padding: theme.spacing["4"],
    },
    header: {
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["3"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: theme.spacing["8"],
    },
    sectionItems: {
      paddingVertical: theme.spacing["1"],
    },
    hintRow: {
      paddingHorizontal: theme.spacing["3"],
      paddingBottom: theme.spacing["2"],
      marginHorizontal: theme.spacing["1"],
      paddingLeft: theme.spacing["3"] + 16 + theme.spacing["3"], // align with text after icon
    },
    bottomSpacer: {
      height: theme.spacing["8"],
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    headerTitle: {
      fontSize: theme.typography.fontSize["xl"].size,
      lineHeight: theme.typography.fontSize["xl"].lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    errorText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.destructive,
      textAlign: "center" as const,
    },
    hintText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}

// Exported for testing
export { parseWorkingDays, serializeWorkingDays };
