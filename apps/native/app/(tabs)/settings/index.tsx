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
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import type { Passkey as AuthPasskey } from "@better-auth/passkey/client";
import type {
  Calendar,
  CalendarView,
  UserSettings,
  UpdateSettingsRequest,
  getErrorMessage as getErrorMessageType,
} from "@workspace/calendar-core";
import {
  getErrorMessage,
  partitionCalendarsByKind,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import {
  useTheme,
  type ThemePreference,
} from "../../../src/providers/ThemeProvider";
import { authClient } from "../../../src/lib/auth-client";
import { useAuth } from "../../../src/providers/AuthProvider";
import { calendarApiService } from "../../../src/lib/api";
import { SETTINGS_TIMEZONE_ROUTE } from "../../../src/lib/auth-routing";
import { formatStoredPasskeyDescription } from "../../../src/lib/passkey-auth";
import { getAuthCapabilities } from "../../../src/lib/auth-capabilities";
import {
  isPasskeyBridgeOriginSecure,
  resolvePasskeyBridgeBaseUrl,
} from "../../../src/lib/passkey-browser-bridge";
import { QUERY_KEYS } from "../../../src/lib/query-keys";
import { getSettingsAccountActions } from "../../../src/lib/settings-screen-utils";
import { ScreenHeader } from "../../../src/components/ScreenHeader";

// ─── Types ───────────────────────────────────────────────────────────────────

type FeatherIcon = React.ComponentProps<typeof Feather>["name"];

// ─── Constants ───────────────────────────────────────────────────────────────

const THEME_OPTIONS: {
  label: string;
  value: ThemePreference;
  icon: FeatherIcon;
}[] = [
  { label: "Light", value: "light", icon: "sun" },
  { label: "Dark", value: "dark", icon: "moon" },
  { label: "System", value: "system", icon: "monitor" },
];

const VIEW_OPTIONS: {
  label: string;
  value: CalendarView;
  icon: FeatherIcon;
}[] = [
  { label: "Month View", value: "month", icon: "grid" },
  { label: "Week View", value: "week", icon: "columns" },
  { label: "Day View", value: "day", icon: "square" },
  { label: "3-Day View", value: "3day", icon: "sidebar" },
  { label: "Agenda View", value: "agenda", icon: "list" },
];

const WEEK_START_OPTIONS: { label: string; value: number }[] = [
  { label: "Sunday", value: 0 },
  { label: "Monday", value: 1 },
];

const TIME_FORMAT_OPTIONS: { label: string; value: "12h" | "24h" }[] = [
  { label: "12 Hour (1:00 PM)", value: "12h" },
  { label: "24 Hour (13:00)", value: "24h" },
];

const WEEKDAY_OPTIONS: { label: string; value: number }[] = [
  { label: "Sunday", value: 0 },
  { label: "Monday", value: 1 },
  { label: "Tuesday", value: 2 },
  { label: "Wednesday", value: 3 },
  { label: "Thursday", value: 4 },
  { label: "Friday", value: 5 },
  { label: "Saturday", value: 6 },
];

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

// ─── Component ───────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { theme, themePreference, setThemePreference } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();
  const router = useRouter();
  const { user, signOut, registerPasskey, deletePasskey } = useAuth();
  const passkeysQuery = authClient.useListPasskeys();
  const authCapabilities = useMemo(() => {
    const passkeyBridgeBaseUrl = resolvePasskeyBridgeBaseUrl();

    return getAuthCapabilities({
      platformOs: Platform.OS,
      expoExecutionEnvironment: Constants.executionEnvironment,
      expoAppOwnership: Constants.appOwnership,
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
  const [showChangePasswordForm, setShowChangePasswordForm] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(
    null,
  );
  const accountActions = useMemo(
    () => getSettingsAccountActions({ canSignOut: Boolean(user) }),
    [user],
  );
  const storedPasskeys = useMemo(
    () => (Array.isArray(passkeysQuery.data) ? passkeysQuery.data : []),
    [passkeysQuery.data],
  );

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

      Alert.alert(
        "Unable to update default calendar",
        getErrorMessage(error, "Failed to update default calendar"),
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
      Alert.alert(
        "Settings reset",
        "Your mobile preferences have been restored to the shared defaults.",
      );
    },
    onError: (error) => {
      Alert.alert(
        "Unable to reset settings",
        getErrorMessage(error, "Failed to reset settings"),
      );
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
              Alert.alert(
                "Unable to sign out",
                getErrorMessage(error, "Failed to sign out"),
              );
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
                Alert.alert(
                  "Unable to delete account",
                  getErrorMessage(error, "Failed to delete account"),
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

    if (!currentPasswordInput.trim() || !newPasswordInput.trim()) {
      setPasswordChangeError("Enter your current password and a new password.");
      return;
    }

    if (newPasswordInput !== confirmPasswordInput) {
      setPasswordChangeError("New password and confirmation must match.");
      return;
    }

    setIsChangingPassword(true);

    try {
      const result = await authClient.changePassword({
        currentPassword: currentPasswordInput,
        newPassword: newPasswordInput,
      });

      if (result?.error) {
        throw new Error(
          result.error.message ?? "Unable to update your password.",
        );
      }

      resetChangePasswordForm();
      setShowChangePasswordForm(false);
      Alert.alert(
        "Password updated",
        "Use your new password the next time you sign in with email.",
      );
    } catch (error) {
      setPasswordChangeError(
        getErrorMessage(error, "Failed to update your password"),
      );
    } finally {
      setIsChangingPassword(false);
    }
  }, [
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
      Alert.alert(
        "Profile picture updated",
        "Your profile picture has been saved.",
      );
    } catch (error) {
      Alert.alert(
        "Unable to update profile picture",
        getErrorMessage(error, "Failed to update profile picture"),
      );
    } finally {
      setIsUpdatingProfilePicture(false);
    }
  }, [profilePictureUrlInput]);

  const handleAccountAction = useCallback(
    (key: (typeof accountActions)[number]["key"]) => {
      if (key === "change-password") {
        setShowChangePasswordForm((current) => {
          const next = !current;
          if (!next) {
            resetChangePasswordForm();
          } else {
            setPasswordChangeError(null);
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
      Alert.alert(
        "Passkey added",
        "You can now sign in faster on supported devices.",
      );
    } catch (error) {
      Alert.alert(
        "Unable to add passkey",
        getErrorMessage(error, "Failed to add passkey"),
      );
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
                .then(() => passkeysQuery.refetch())
                .catch((error) => {
                  Alert.alert(
                    "Unable to delete passkey",
                    getErrorMessage(error, "Failed to delete passkey"),
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
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primaryBase} />
        <Text style={styles.loadingText}>Loading settings…</Text>
      </SafeAreaView>
    );
  }

  // ─── Error state ───────────────────────────────────────────────────────────

  if (isError) {
    const errorMessage =
      error && typeof error === "object" && "message" in error
        ? (error as { message: string }).message
        : "Failed to load settings";
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>{errorMessage}</Text>
      </SafeAreaView>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScreenHeader title="Settings" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Appearance ───────────────────────────────────────────────── */}
        <SectionLabel text="Appearance" theme={theme} />
        <View style={styles.sectionItems}>
          {THEME_OPTIONS.map((opt) => (
            <SelectionRow
              key={opt.value}
              icon={opt.icon}
              label={opt.label}
              isSelected={themePreference === opt.value}
              onPress={() => handleThemeChange(opt.value)}
              isPending={pendingKeys.has("theme")}
              theme={theme}
            />
          ))}
          {VIEW_OPTIONS.map((opt) => (
            <SelectionRow
              key={opt.value}
              icon={opt.icon}
              label={opt.label}
              isSelected={(settings?.defaultView ?? "month") === opt.value}
              onPress={() => updateSetting({ defaultView: opt.value })}
              isPending={pendingKeys.has("defaultView")}
              theme={theme}
            />
          ))}
        </View>

        {/* ── Time & Region ────────────────────────────────────────────── */}
        <SectionLabel text="Time & Region" theme={theme} isFirst={false} />
        <View style={styles.sectionItems}>
          {TIME_FORMAT_OPTIONS.map((opt) => (
            <SelectionRow
              key={opt.value}
              icon="clock"
              label={opt.label}
              isSelected={(settings?.timeFormat ?? "12h") === opt.value}
              onPress={() => updateSetting({ timeFormat: opt.value })}
              isPending={pendingKeys.has("timeFormat")}
              theme={theme}
            />
          ))}
          <NavigationRow
            icon="globe"
            label="Timezone"
            value={
              settings?.timezone ??
              Intl.DateTimeFormat().resolvedOptions().timeZone
            }
            onPress={() => router.push(SETTINGS_TIMEZONE_ROUTE)}
            theme={theme}
          />
        </View>

        {/* ── Calendar Defaults ────────────────────────────────────────── */}
        <SectionLabel text="Calendar Defaults" theme={theme} isFirst={false} />
        <View style={styles.sectionItems}>
          {sortedOwnedCalendars.length === 0 ? (
            <HintRow
              text="Create a calendar first to pick a default calendar for new events."
              theme={theme}
            />
          ) : (
            sortedOwnedCalendars.map((calendar) => (
              <SelectionRow
                key={calendar.id}
                icon="star"
                label={calendar.name}
                description={calendar.isVisible ? "Visible" : "Hidden"}
                isSelected={calendar.isDefault}
                onPress={() => setDefaultCalendarMutation.mutate(calendar.id)}
                isPending={pendingDefaultCalendarId === calendar.id}
                theme={theme}
              />
            ))
          )}
          {WEEK_START_OPTIONS.map((opt) => (
            <SelectionRow
              key={opt.value}
              icon="calendar"
              label={opt.label}
              description="First day of week"
              isSelected={(settings?.weekStartDay ?? 0) === opt.value}
              onPress={() => updateSetting({ weekStartDay: opt.value })}
              isPending={pendingKeys.has("weekStartDay")}
              theme={theme}
            />
          ))}
          {WEEKDAY_OPTIONS.map((day) => {
            const isActive = workingDaysSet.has(day.value);
            return (
              <SelectionRow
                key={day.value}
                icon="calendar"
                label={day.label}
                description="Working day"
                isSelected={isActive}
                onPress={() => handleToggleWorkingDay(day.value)}
                isPending={false}
                theme={theme}
              />
            );
          })}
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
          <SettingToggleRow
            icon="shield"
            label="Full Event Encryption"
            description="Keep event content ciphertext-only on the server"
            value={(settings?.eventEncryptionMode ?? "hybrid") === "full"}
            onValueChange={(v) =>
              updateSetting({ eventEncryptionMode: v ? "full" : "hybrid" })
            }
            isPending={pendingKeys.has("eventEncryptionMode")}
            theme={theme}
          />
          {settings?.eventEncryptionMode === "full" && (
            <View style={styles.hintRow}>
              <Text style={styles.hintText}>
                Reminder emails will only include timing details when full
                encryption is active.
              </Text>
            </View>
          )}
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
                Platform.OS === "web" || Constants.appOwnership === "expo"
                  ? passkeySupportMessage
                  : `${passkeySupportMessage} Native passkeys also need the passkey domain, apple-app-site-association, and assetlinks setup to match your build.`
              }
              theme={theme}
            />
          )}
        </View>

        {/* ── Management ───────────────────────────────────────────────── */}
        <SectionLabel text="Management" theme={theme} isFirst={false} />
        <View style={styles.sectionItems}>
          <NavigationRow
            icon="tag"
            label="Categories"
            value="Manage event categories"
            onPress={() => router.push("/category-manage")}
            theme={theme}
          />
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
          {showProfilePictureForm ? (
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
          ) : null}
          {showChangePasswordForm ? (
            <PasswordChangeCard
              currentPassword={currentPasswordInput}
              newPassword={newPasswordInput}
              confirmPassword={confirmPasswordInput}
              onCurrentPasswordChange={setCurrentPasswordInput}
              onNewPasswordChange={setNewPasswordInput}
              onConfirmPasswordChange={setConfirmPasswordInput}
              onSubmit={handleSubmitPasswordChange}
              onCancel={() => {
                setShowChangePasswordForm(false);
                resetChangePasswordForm();
              }}
              error={passwordChangeError}
              isPending={isChangingPassword}
              theme={theme}
            />
          ) : null}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
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
function SelectionRow({
  icon,
  label,
  description,
  isSelected,
  onPress,
  isPending,
  theme,
}: {
  icon: FeatherIcon;
  label: string;
  description?: string;
  isSelected: boolean;
  onPress: () => void;
  isPending: boolean;
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
          paddingVertical: theme.spacing["2"],
          borderRadius: theme.borderRadius.md,
          marginHorizontal: theme.spacing["1"],
        },
        pressed && { backgroundColor: theme.colors.accent },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={label}
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
      {description ? (
        <Text
          style={{
            fontSize: theme.typography.fontSize.xs.size,
            lineHeight: theme.typography.fontSize.xs.lineHeight,
            color: theme.colors.mutedForeground,
          }}
          numberOfLines={1}
        >
          {description}
        </Text>
      ) : null}
      {isPending ? (
        <ActivityIndicator size="small" />
      ) : isSelected ? (
        <Feather name="check" size={16} color={theme.colors.primaryBase} />
      ) : null}
    </Pressable>
  );
}

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

  return (
    <View
      style={{
        flexDirection: "row",
        gap: theme.spacing["3"],
        paddingHorizontal: theme.spacing["3"],
        paddingVertical: theme.spacing["3"],
        marginHorizontal: theme.spacing["1"],
        marginBottom: theme.spacing["1"],
        borderRadius: theme.borderRadius.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.muted + "30",
      }}
    >
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
  return (
    <View
      style={{
        marginHorizontal: theme.spacing["1"],
        marginTop: theme.spacing["1"],
        borderRadius: theme.borderRadius.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.background,
        padding: theme.spacing["3"],
        gap: theme.spacing["3"],
      }}
    >
      <View>
        <Text
          style={{
            fontSize: theme.typography.fontSize.sm.size,
            lineHeight: theme.typography.fontSize.sm.lineHeight,
            color: theme.colors.foreground,
            fontWeight: theme.typography.fontWeight
              .medium as TextStyle["fontWeight"],
          }}
        >
          Change Password
        </Text>
        <Text
          style={{
            marginTop: theme.spacing["1"],
            fontSize: theme.typography.fontSize.xs.size,
            lineHeight: theme.typography.fontSize.xs.lineHeight,
            color: theme.colors.mutedForeground,
          }}
        >
          Update the password used for email sign-in.
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
            paddingVertical: theme.spacing["2"],
          }}
        >
          <Text
            style={{
              fontSize: theme.typography.fontSize.xs.size,
              lineHeight: theme.typography.fontSize.xs.lineHeight,
              color: theme.colors.destructive,
            }}
          >
            {error}
          </Text>
        </View>
      ) : null}

      <PasswordField
        label="Current password"
        value={currentPassword}
        onChangeText={onCurrentPasswordChange}
        autoComplete="password"
        theme={theme}
      />
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

      <View style={{ flexDirection: "row", gap: theme.spacing["2"] }}>
        <Pressable
          onPress={onSubmit}
          disabled={isPending}
          style={({ pressed }) => [
            {
              flex: 1,
              minHeight: 44,
              borderRadius: theme.borderRadius.md,
              backgroundColor: theme.colors.primaryBase,
              alignItems: "center",
              justifyContent: "center",
            },
            pressed && { opacity: 0.9 },
            isPending && { opacity: 0.6 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Update password"
        >
          {isPending ? (
            <ActivityIndicator color={theme.colors.primaryForeground} />
          ) : (
            <Text
              style={{
                fontSize: theme.typography.fontSize.sm.size,
                lineHeight: theme.typography.fontSize.sm.lineHeight,
                color: theme.colors.primaryForeground,
                fontWeight: theme.typography.fontWeight
                  .semibold as TextStyle["fontWeight"],
              }}
            >
              Update Password
            </Text>
          )}
        </Pressable>
        <Pressable
          onPress={onCancel}
          disabled={isPending}
          style={({ pressed }) => [
            {
              minHeight: 44,
              paddingHorizontal: theme.spacing["4"],
              borderRadius: theme.borderRadius.md,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.colors.border,
              alignItems: "center",
              justifyContent: "center",
            },
            pressed && { backgroundColor: theme.colors.accent },
            isPending && { opacity: 0.6 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Cancel password change"
        >
          <Text
            style={{
              fontSize: theme.typography.fontSize.sm.size,
              lineHeight: theme.typography.fontSize.sm.lineHeight,
              color: theme.colors.foreground,
              fontWeight: theme.typography.fontWeight
                .medium as TextStyle["fontWeight"],
            }}
          >
            Cancel
          </Text>
        </Pressable>
      </View>
    </View>
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
  return (
    <View
      style={{
        marginHorizontal: theme.spacing["1"],
        marginTop: theme.spacing["1"],
        borderRadius: theme.borderRadius.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.background,
        padding: theme.spacing["3"],
        gap: theme.spacing["3"],
      }}
    >
      <Text
        style={{
          fontSize: theme.typography.fontSize.xs.size,
          lineHeight: theme.typography.fontSize.xs.lineHeight,
          color: theme.colors.mutedForeground,
        }}
      >
        Paste the URL of the image you want to use as your profile picture.
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
          height: 40,
          borderRadius: theme.borderRadius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.muted + "30",
          paddingHorizontal: theme.spacing["3"],
          fontSize: theme.typography.fontSize.sm.size,
          color: theme.colors.foreground,
        }}
      />
      <View style={{ flexDirection: "row", gap: theme.spacing["2"] }}>
        <Pressable
          onPress={onSubmit}
          disabled={isPending}
          style={({ pressed }) => ({
            flex: 1,
            height: 40,
            borderRadius: theme.borderRadius.md,
            backgroundColor: theme.colors.primaryBase,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed || isPending ? 0.7 : 1,
          })}
        >
          {isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text
              style={{
                fontSize: theme.typography.fontSize.sm.size,
                color: "#fff",
                fontWeight: theme.typography.fontWeight
                  .medium as TextStyle["fontWeight"],
              }}
            >
              Save
            </Text>
          )}
        </Pressable>
        <Pressable
          onPress={onCancel}
          disabled={isPending}
          style={({ pressed }) => ({
            flex: 1,
            height: 40,
            borderRadius: theme.borderRadius.md,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.colors.border,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed || isPending ? 0.7 : 1,
          })}
        >
          <Text
            style={{
              fontSize: theme.typography.fontSize.sm.size,
              color: theme.colors.foreground,
            }}
          >
            Cancel
          </Text>
        </Pressable>
      </View>
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
          paddingVertical: theme.spacing["2"],
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
          paddingVertical: theme.spacing["2"],
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
          paddingVertical: theme.spacing["2"],
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
    loadingText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
      marginTop: theme.spacing["2"],
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
