"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { format } from "date-fns";
import { createLogger } from "@workspace/logger";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSettings } from "@/hooks/use-settings";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import { useCalendarContext } from "@workspace/ui/components/calendar";
import type { CalendarEvent } from "@workspace/ui/components/calendar";
import type { UserSettings, UpdateSettingsRequest } from "@/lib/types/calendar";
import { useCommandPaletteSearch } from "@/hooks/use-command-palette-search";
import { PasskeySettings } from "./passkey-settings";
import { SubscriptionManagement } from "./subscription-management";
import { EventEditor } from "./event-editor";
import { CalendarManager } from "./calendar-manager";
import { AccountSettings } from "./command-palette/account-settings";
import { AppearanceSettings } from "./command-palette/appearance-settings";
import { CalendarDefaultsSettings } from "./command-palette/calendar-defaults-settings";
import { type PaletteView } from "./command-palette/constants";
import { InviteSettings } from "./command-palette/invite-settings";
import { NAVIGATION_ITEMS } from "./command-palette/navigation-config";
import { NotificationSettings } from "./command-palette/notification-settings";
import { SecuritySettings } from "./command-palette/security-settings";
import { TimeRegionSettings } from "./command-palette/time-region-settings";
import { TransitionContainer } from "./command-palette/transition-container";
import { CommandPaletteMainSearchView } from "./command-palette/main-search-view";
import { createDraftCalendarEvent } from "@/lib/calendar-event-drafts";
import { parseWorkingDays } from "@/lib/calendar-view-model";
import { calendarApiService } from "@/lib/calendar-api-service";
import { authClient, signOut, useSession } from "@/lib/auth-client";
import { resetEncryptionPasswordForActiveSession } from "@/lib/e2ee-password-reset";
import {
  extractLinkedAuthAccounts,
  summarizeLinkedAuthAccounts,
} from "@workspace/calendar-core";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@workspace/ui/components/ui/drawer";
import { VisuallyHidden } from "@workspace/ui/components/ui/visually-hidden";
import {
  Settings,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { useNumberedShortcuts, useIsMobile } from "@workspace/ui/hooks";

const log = createLogger("command-palette");
import type { EventEditorMode } from "./command-palette-context";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventToEdit?: CalendarEvent | null;
  onEventSaved?: () => void;
  onEventEdit?: (event: CalendarEvent) => void;
  initialView?: string;
  initialSearchQuery?: string;
  eventEditorMode?: EventEditorMode;
  popoverAnchorPosition?: { x: number; y: number } | null;
  initialEventViewMode?: "view" | "edit";
  previewEvent?: CalendarEvent | null;
  updatePreviewEvent?: (updates: Partial<CalendarEvent>) => void;
}

function buildInitialHistory(view: PaletteView): PaletteView[] {
  const PARENT_CHAINS: Partial<Record<PaletteView, PaletteView[]>> = {
    appearance: ["main"],
    "time-region": ["main"],
    timezone: ["main", "time-region"],
    notifications: ["main"],
    "calendar-defaults": ["main"],
    account: ["main"],
    security: ["main"],
    passkeys: ["main", "security"],
    calendars: ["main"],
    "calendar-create": ["main", "calendars"],
    "calendar-edit": ["main", "calendars"],
    subscriptions: ["main"],
    "subscriptions-add-feed": ["main", "subscriptions"],
    "subscriptions-holidays": ["main", "subscriptions"],
    "subscriptions-edit": ["main", "subscriptions"],
    events: ["main"],
    "event-editor": ["main"],
    invites: ["main"],
    search: ["main"],
  };
  if (view === "main") return ["main"];
  const parents = PARENT_CHAINS[view];
  return parents ? [...parents, view] : ["main", view];
}

function useCommandPaletteState(
  open: boolean,
  onOpenChange: (open: boolean) => void,
  eventToEdit: CalendarEvent | null | undefined,
  onEventSaved: (() => void) | undefined,
  onEventEdit: ((event: CalendarEvent) => void) | undefined,
  initialView: string,
  initialSearchQuery: string,
  eventEditorMode: EventEditorMode,
  popoverAnchorPosition: { x: number; y: number } | null,
  initialEventViewMode: "view" | "edit",
  previewEvent: CalendarEvent | null,
  updatePreviewEvent: ((updates: Partial<CalendarEvent>) => void) | undefined,
) {
  const calendarData = useSharedCalendarData();
  const { calendars } = calendarData;
  const { settings, loading, updateSettings, resetSettings } = useSettings();
  const queryClient = useQueryClient();
  const { data: session, isPending: sessionLoading } = useSession();
  const accountsQuery = useQuery({
    queryKey: ["auth", "accounts", session?.user?.id ?? null],
    queryFn: async () => {
      if (typeof authClient.listAccounts !== "function") {
        return [];
      }
      return extractLinkedAuthAccounts(await authClient.listAccounts());
    },
    enabled:
      Boolean(session?.user?.id) && typeof authClient.listAccounts === "function",
    staleTime: 5 * 60 * 1000,
  });
  const { setCurrentDate, setCurrentView: setCalendarView } =
    useCalendarContext();
  const isMobile = useIsMobile();

  const [navHistory, setNavHistory] = useState<PaletteView[]>(() =>
    buildInitialHistory(initialView as PaletteView),
  );
  const currentView = navHistory[navHistory.length - 1] ?? "main";
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [passkeyAddMode, setPasskeyAddMode] = useState(false);
  const [subscriptionEditCalendarId, setSubscriptionEditCalendarId] = useState<
    string | undefined
  >(undefined);

  useEffect(() => {
    const isSubscriptionView = currentView.startsWith("subscriptions");
    if (!isSubscriptionView) {
      setSubscriptionEditCalendarId(undefined);
    }
  }, [currentView]);

  const goForward = useCallback(
    (next: PaletteView, options?: { preservePasskeyAddMode?: boolean }) => {
      setSearchQuery("");
      if (!options?.preservePasskeyAddMode) {
        setPasskeyAddMode(false);
      }
      setNavHistory((h) => [...h, next]);
    },
    [],
  );

  const goBack = () => {
    setSearchQuery("");
    setPasskeyAddMode(false);
    setNavHistory((h) => (h.length > 1 ? h.slice(0, -1) : ["main"]));
  };

  const showMainView = useCallback(() => {
    setNavHistory(["main"]);
  }, []);

  const [localSettings, setLocalSettings] = useState<UserSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [settingPassword, setSettingPassword] = useState(false);
  const [resettingEncryptionPassword, setResettingEncryptionPassword] =
    useState(false);
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [localImageOverride, setLocalImageOverride] = useState<string | null | undefined>(undefined);
  const accountImage = localImageOverride !== undefined ? localImageOverride : (session?.user?.image ?? null);
  const linkedAccounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const { hasOAuthAccount, hasPasswordAccount } = useMemo(
    () => summarizeLinkedAuthAccounts(linkedAccounts),
    [linkedAccounts],
  );

  useEffect(() => {
    if (settings) setLocalSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!open) {
      setNavHistory(buildInitialHistory(initialView as PaletteView));
      setSearchQuery("");
    }
  }, [open, initialView]);

  useEffect(() => {
    if (open) {
      setNavHistory(buildInitialHistory(initialView as PaletteView));
    }
  }, [initialView, open]);

  useNumberedShortcuts(
    NAVIGATION_ITEMS.map((item) => () => goForward(item.id as PaletteView)),
    open && currentView === "main",
  );

  const updateSetting = useCallback(
    async <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
      if (!localSettings || saving) return;

      const newSettings = { ...localSettings, [key]: value };
      setLocalSettings(newSettings);

      setSaving(true);
      try {
        const updateData: UpdateSettingsRequest = {
          theme: newSettings.theme,
          defaultView: newSettings.defaultView,
          weekStartDay: newSettings.weekStartDay,
          timezone: newSettings.timezone,
          timeFormat: newSettings.timeFormat,
          workingHoursStart: newSettings.workingHoursStart,
          workingHoursEnd: newSettings.workingHoursEnd,
          workingDays: newSettings.workingDays,
          emailNotifications: newSettings.emailNotifications,
          browserNotifications: newSettings.browserNotifications,
          reminderSound: newSettings.reminderSound,
          eventEncryptionMode: newSettings.eventEncryptionMode,
          defaultEventDuration: newSettings.defaultEventDuration,
          defaultCalendarId: newSettings.defaultCalendarId,
          compactView: newSettings.compactView,
          showWeekNumbers: newSettings.showWeekNumbers,
          showDeclinedEvents: newSettings.showDeclinedEvents,
        };

        await updateSettings(updateData);
      } catch (err: any) {
        log.error("Failed to save settings:", err);
        setLocalSettings(localSettings);
      } finally {
        setSaving(false);
      }
    },
    [localSettings, saving, updateSettings],
  );

  const handleReset = async () => {
    setSaving(true);
    try {
      await resetSettings();
      onOpenChange(false);
    } catch (err: any) {
      log.error("Failed to reset settings:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = useCallback(async () => {
    setDeletingAccount(true);
    try {
      await calendarApiService.deleteAccount();
      queryClient.clear();
      try {
        await signOut();
      } catch {
        // The session may already be invalid after the account is removed.
      }
      onOpenChange(false);
      window.location.href = "/";
    } catch (err) {
      log.error("Failed to delete account:", err);
    } finally {
      setDeletingAccount(false);
    }
  }, [onOpenChange, queryClient]);

  const handleChangePassword = useCallback(
    async ({
      currentPassword,
      newPassword,
    }: {
      currentPassword: string;
      newPassword: string;
    }) => {
      setChangingPassword(true);

      try {
        const result = await authClient.changePassword({
          currentPassword,
          newPassword,
        });

        if (result?.error) {
          throw new Error(
            result.error.message || "Unable to update your password.",
          );
        }
      } catch (error) {
        log.error("Failed to change password:", error);
        throw error;
      } finally {
        setChangingPassword(false);
      }
    },
    [],
  );

  const handleSetPassword = useCallback(
    async ({ newPassword }: { newPassword: string }) => {
      setSettingPassword(true);

      try {
        const result = await authClient.setPassword({
          newPassword,
        });

        if (result?.error) {
          throw new Error(result.error.message || "Unable to set your password.");
        }

        await accountsQuery?.refetch?.();
      } catch (error) {
        log.error("Failed to set password:", error);
        throw error;
      } finally {
        setSettingPassword(false);
      }
    },
    [accountsQuery],
  );

  const handleResetEncryptionPassword = useCallback(
    async ({ newPassword }: { newPassword: string }) => {
      if (!session?.user?.id) {
        throw new Error("Your session is unavailable. Please try again.");
      }

      setResettingEncryptionPassword(true);

      try {
        const stored = await resetEncryptionPasswordForActiveSession(
          session.user.id,
          newPassword,
        );

        if (!stored) {
          throw new Error(
            "Unlock your encrypted data on this device first, then try again.",
          );
        }
      } catch (error) {
        log.error("Failed to reset encryption password:", error);
        throw error;
      } finally {
        setResettingEncryptionPassword(false);
      }
    },
    [session?.user?.id],
  );

  const handleUpdateProfile = useCallback(
    async ({ imageUrl }: { name?: string; imageUrl?: string }) => {
      setUpdatingProfile(true);
      try {
        const result = await authClient.updateUser({
          image: imageUrl ?? null,
        });
        if (result?.error) {
          throw new Error(
            result.error.message || "Unable to update your profile.",
          );
        }
        setLocalImageOverride(imageUrl?.trim() || null);
      } catch (error) {
        log.error("Failed to update profile:", error);
        throw error;
      } finally {
        setUpdatingProfile(false);
      }
    },
    [],
  );

  const executeCommand = useCallback(
    (cmd: {
      execute: {
        action: string;
        payload?: Record<string, unknown>;
      };
    }) => {
      const { action, payload } = cmd.execute;
      switch (action) {
        case "setTheme":
          if (payload?.theme) {
            updateSetting(
              "theme",
              payload.theme as "light" | "dark" | "system",
            );
            onOpenChange(false);
          }
          break;
        case "newEvent":
          goForward("events");
          break;
        case "newCalendar":
          goForward("calendar-create");
          break;
        case "openCalendars":
          goForward("calendars");
          break;
        case "newPasskey":
          setPasskeyAddMode(true);
          goForward("passkeys", { preservePasskeyAddMode: true });
          break;
        case "openPasskeys":
          setPasskeyAddMode(false);
          goForward("passkeys");
          break;
      }
    },
    [updateSetting, onOpenChange, goForward],
  );

  const handleSearchEventSelect = (event: CalendarEvent) => {
    const eventStart = new Date(event.start);
    setCurrentDate(eventStart);
    setCalendarView("week");
    const dateParam = format(eventStart, "yyyy-MM-dd");
    const params = new URLSearchParams(window.location.search);
    params.set("date", dateParam);
    params.set("view", "week");
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.pushState(null, "", newUrl);
    onOpenChange(false);
    if (onEventEdit) {
      onEventEdit(event);
    }
  };

  const paletteSearch = useCommandPaletteSearch({
    open,
    currentView,
    initialSearchQuery,
    searchQuery,
    setSearchQuery,
    showMainView,
    onOpenChange,
    executeCommand,
    goForward,
    onSearchEventSelect: handleSearchEventSelect,
  });

  const workingDaysList = localSettings
    ? parseWorkingDays(localSettings.workingDays)
    : [];

  const getDialogTitle = () => {
    switch (currentView) {
      case "main": return "Command Palette";
      case "search": return "Search Events";
      case "appearance": return "Appearance Settings";
      case "notifications": return "Notification Settings";
      case "time-region": return "Time & Region Settings";
      case "timezone": return "Timezone Selection";
      case "calendar-defaults": return "Calendar Defaults";
      case "account": return "Account Settings";
      case "security": return "Security";
      case "passkeys": return "Passkeys";
      case "invites": return "Invites";
      case "calendars": return "Calendar Management";
      case "calendar-create": return "Create Calendar";
      case "calendar-edit": return "Edit Calendar";
      case "subscriptions": return "Calendar Subscriptions";
      case "subscriptions-add-feed": return "Add External Feed";
      case "subscriptions-holidays": return "Holiday Calendars";
      case "subscriptions-edit": return "Edit Calendar";
      case "events": return "New Event";
      default: return "Settings";
    }
  };

  const getNewEvent = (): CalendarEvent => {
    return createDraftCalendarEvent({
      defaultCalendarId: localSettings?.defaultCalendarId,
      fallbackCalendarId: calendars?.[0]?.id,
    });
  };

  const handleGoToSubscriptions = useCallback((calendarId?: string) => {
    setSubscriptionEditCalendarId(calendarId);
    if (calendarId) {
      goForward("subscriptions-edit");
    } else {
      goForward("subscriptions");
    }
  }, [goForward]);

  return {
    loading,
    isMobile,
    localSettings,
    currentView,
    paletteSearch,
    updateSetting,
    goBack,
    goForward,
    workingDaysList,
    saving,
    handleReset,
    deletingAccount,
    handleDeleteAccount,
    session,
    sessionLoading,
    changingPassword,
    settingPassword,
    resettingEncryptionPassword,
    hasPasswordAccount,
    hasOAuthAccount,
    handleChangePassword,
    handleSetPassword,
    handleResetEncryptionPassword,
    updatingProfile,
    handleUpdateProfile,
    accountImage,
    passkeyAddMode,
    subscriptionEditCalendarId,
    handleGoToSubscriptions,
    open,
    onOpenChange,
    onEventSaved,
    eventEditorMode,
    popoverAnchorPosition,
    updatePreviewEvent,
    eventToEdit,
    initialEventViewMode,
    getDialogTitle,
    getNewEvent,
    calendars,
    previewEvent,
  };
}

type SubState = ReturnType<typeof useCommandPaletteState>;

function CommandPaletteViewContent({ s }: { s: SubState }) {
  const { currentView } = s;

  if (currentView === "main" || currentView === "search") {
    return <CommandPaletteMainSearchView search={s.paletteSearch} />;
  }

  if (currentView === "appearance") {
    return (
      <AppearanceSettings
        localSettings={s.localSettings!}
        updateSetting={s.updateSetting}
        goBack={s.goBack}
      />
    );
  }

  if (currentView === "notifications") {
    return (
      <NotificationSettings
        localSettings={s.localSettings!}
        updateSetting={s.updateSetting}
        goBack={s.goBack}
      />
    );
  }

  if (currentView === "time-region" || currentView === "timezone") {
    return (
      <TimeRegionSettings
        localSettings={s.localSettings!}
        updateSetting={s.updateSetting}
        goBack={s.goBack}
        goForward={s.goForward}
        currentView={currentView}
      />
    );
  }

  if (currentView === "calendar-defaults") {
    return (
      <CalendarDefaultsSettings
        localSettings={s.localSettings!}
        updateSetting={s.updateSetting}
        goBack={s.goBack}
        workingDaysList={s.workingDaysList}
      />
    );
  }

  if (currentView === "account") {
    return (
      <AccountSettings
        goBack={s.goBack}
        saving={s.saving}
        handleReset={s.handleReset}
        deletingAccount={s.deletingAccount}
        handleDeleteAccount={s.handleDeleteAccount}
        accountName={s.session?.user?.name}
        accountEmail={s.session?.user?.email}
        accountImage={s.accountImage}
        sessionLoading={s.sessionLoading}
        changingPassword={s.changingPassword}
        settingPassword={s.settingPassword}
        resettingEncryptionPassword={s.resettingEncryptionPassword}
        hasPasswordAccount={s.hasPasswordAccount}
        hasOAuthAccount={s.hasOAuthAccount}
        handleChangePassword={s.handleChangePassword}
        handleSetPassword={s.handleSetPassword}
        handleResetEncryptionPassword={s.handleResetEncryptionPassword}
        updatingProfile={s.updatingProfile}
        handleUpdateProfile={s.handleUpdateProfile}
      />
    );
  }

  if (currentView === "security") {
    return (
      <SecuritySettings
        localSettings={s.localSettings!}
        updateSetting={s.updateSetting}
        goBack={s.goBack}
        goForward={s.goForward}
      />
    );
  }

  if (currentView === "passkeys") {
    return (
      <PasskeySettings
        open={s.open}
        onBack={() => s.goBack()}
        startInAddMode={s.passkeyAddMode}
      />
    );
  }

  if (currentView === "invites") {
    return <InviteSettings goBack={s.goBack} />;
  }

  if (
    currentView === "calendars" ||
    currentView === "calendar-create" ||
    currentView === "calendar-edit"
  ) {
    return (
      <CalendarManager
        onBack={s.goBack}
        onGoToSubscriptions={s.handleGoToSubscriptions}
        currentView={currentView}
        onNavigateTo={s.goForward}
      />
    );
  }

  if (
    currentView === "subscriptions" ||
    currentView === "subscriptions-add-feed" ||
    currentView === "subscriptions-holidays" ||
    currentView === "subscriptions-edit"
  ) {
    return (
      <SubscriptionManagement
        open={s.open}
        onBack={s.goBack}
        currentView={currentView}
        onNavigateTo={s.goForward}
        initialEditCalendarId={s.subscriptionEditCalendarId}
      />
    );
  }

  if (currentView === "events") {
    return (
      <EventEditor
        open={s.open}
        onOpenChange={s.onOpenChange}
        eventToEdit={s.getNewEvent()}
        onEventSaved={s.onEventSaved}
        onBack={() => s.goBack()}
        localSettings={s.localSettings!}
        editorMode={s.eventEditorMode}
        anchorPosition={s.popoverAnchorPosition}
        updatePreviewEvent={s.updatePreviewEvent}
        showBackButton
      />
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
        <button
          onClick={() => s.goBack()}
          className="p-1 rounded hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft className="size-4 text-muted-foreground" />
        </button>
        <span className="text-sm font-medium">Settings</span>
      </div>
      <div className="flex-1 overflow-y-auto p-1">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-md opacity-50">
          <Settings className="size-4 text-muted-foreground shrink-0" />
          <span className="text-sm">This section is coming soon</span>
        </div>
      </div>
    </div>
  );
}

export function CommandPalette({
  open,
  onOpenChange,
  eventToEdit,
  onEventSaved,
  onEventEdit,
  initialView = "main",
  initialSearchQuery = "",
  eventEditorMode = "modal",
  popoverAnchorPosition = null,
  initialEventViewMode = "view",
  previewEvent = null,
  updatePreviewEvent,
}: CommandPaletteProps) {
  const s = useCommandPaletteState(
    open,
    onOpenChange,
    eventToEdit,
    onEventSaved,
    onEventEdit,
    initialView,
    initialSearchQuery,
    eventEditorMode,
    popoverAnchorPosition,
    initialEventViewMode,
    previewEvent,
    updatePreviewEvent,
  );

  if (s.loading || !s.localSettings) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          variant="spotlight"
          showClose={false}
          aria-describedby={undefined}
          className="overflow-hidden p-0 bg-popover border-border/50 shadow-2xl"
        >
          <VisuallyHidden>
            <DialogTitle>Loading Settings</DialogTitle>
          </VisuallyHidden>
          <div className="flex items-center justify-center min-h-[200px]">
            <div className="text-center">
              <Loader2 className="size-6 animate-spin mx-auto mb-2 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Loading\u2026</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (s.currentView === "event-editor") {
    return (
      <EventEditor
        open={open}
        onOpenChange={onOpenChange}
        eventToEdit={eventToEdit}
        onEventSaved={onEventSaved}
        onBack={() => onOpenChange(false)}
        localSettings={s.localSettings}
        editorMode={eventEditorMode}
        anchorPosition={popoverAnchorPosition}
        initialEventViewMode={initialEventViewMode}
        updatePreviewEvent={updatePreviewEvent}
      />
    );
  }

  const paletteContent = (
    <>
      <TransitionContainer viewKey={s.currentView}>
        <CommandPaletteViewContent s={s} />
      </TransitionContainer>
      {s.currentView !== "events" && !s.isMobile && (
        <div className="px-3 py-2 border-t border-border/50 text-xs text-muted-foreground flex items-center justify-between shrink-0">
          <span>
            Type{" "}
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
              &gt;
            </kbd>{" "}
            for commands
          </span>
          <span className="hidden sm:flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
              \u21d5
            </kbd>{" "}
            to navigate
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
              \u21b5
            </kbd>{" "}
            to select
          </span>
        </div>
      )}
    </>
  );

  return (
    <>
      {s.isMobile ? (
        <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
          <DrawerContent
            responsive
            responsiveHeight="90svh"
            className="bg-popover border-border/50 flex flex-col overflow-hidden p-0"
          >
            <VisuallyHidden>
              <DrawerTitle>{s.getDialogTitle()}</DrawerTitle>
            </VisuallyHidden>
            {paletteContent}
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent
            variant="spotlight"
            showClose={false}
            aria-describedby={undefined}
            className="overflow-hidden p-0 bg-popover border-border/50 shadow-2xl flex flex-col"
          >
            <VisuallyHidden>
              <DialogTitle>{s.getDialogTitle()}</DialogTitle>
            </VisuallyHidden>
            {paletteContent}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
