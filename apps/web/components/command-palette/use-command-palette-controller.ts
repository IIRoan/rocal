"use client";

import { useState, useEffect, useReducer } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UnifiedSearchResult } from "@workspace/calendar-core";
import { formatCalendarDayKey } from "@workspace/calendar-core";
import { useSettings } from "@/hooks/use-settings";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import { useCalendarContext } from "@workspace/ui/components/calendar";
import type { CalendarEvent } from "@workspace/ui/components/calendar";
import type { UserSettings } from "@/lib/types/calendar";
import { useCommandPaletteSearch } from "@/hooks/use-command-palette-search";
import { NAVIGATION_ITEMS } from "./navigation-config";
import type { PaletteView } from "./constants";
import { getDialogTitle } from "./command-palette-nav";
import {
  createInitialChromeState,
  initialBusyState,
  paletteBusyReducer,
  paletteChromeReducer,
} from "./command-palette-ui-state";
import {
  persistAccountDeletion,
  persistEncryptionPasswordReset,
  persistPasswordChange,
  persistPasswordSet,
  persistProfileUpdate,
  persistSettingsReset,
  persistSettingsUpdate,
} from "./command-palette-actions";
import { authClient, useSession } from "@/lib/auth-client";
import {
  extractLinkedAuthAccounts,
  summarizeLinkedAuthAccounts,
} from "@workspace/calendar-core";
import { useNumberedShortcuts, useIsMobile } from "@workspace/ui/hooks";
import type { JmapEmailMessage } from "@/lib/mail/types";
import { buildMailUrlFromIds } from "@/lib/mail/mail-url";

type UseCommandPaletteControllerOptions = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEventEdit?: (event: CalendarEvent) => void;
  initialView: string;
  initialSearchQuery: string;
};

export function useCommandPaletteController({
  open,
  onOpenChange,
  onEventEdit,
  initialView,
  initialSearchQuery,
}: UseCommandPaletteControllerOptions) {
  const calendarData = useSharedCalendarData();
  const { calendars } = calendarData;
  const { settings, loading, updateSettings, resetSettings } = useSettings();
  const queryClient = useQueryClient();
  const { data: session, isPending: sessionLoading } = useSession();
  const sessionUserId = session?.user?.id ?? null;
  const accountsQuery = useQuery({
    queryKey: ["auth", "accounts", sessionUserId],
    queryFn: async () => {
      if (typeof authClient.listAccounts !== "function") {
        return [];
      }

      return extractLinkedAuthAccounts(await authClient.listAccounts());
    },
    enabled:
      Boolean(sessionUserId) && typeof authClient.listAccounts === "function",
    staleTime: 5 * 60 * 1000,
  });
  const { setCurrentDate, setCurrentView: setCalendarView } =
    useCalendarContext();

  const isMobile = useIsMobile();

  const [chrome, dispatchChrome] = useReducer(
    paletteChromeReducer,
    undefined,
    () =>
      createInitialChromeState(
        initialView as PaletteView,
        initialSearchQuery,
      ),
  );
  const currentView = chrome.navHistory[chrome.navHistory.length - 1] ?? "main";
  const [busy, dispatchBusy] = useReducer(paletteBusyReducer, initialBusyState);
  const [localSettings, setLocalSettings] = useState<UserSettings | null>(null);

  const activeSubscriptionEditCalendarId = currentView.startsWith(
    "subscriptions",
  )
    ? chrome.subscriptionEditCalendarId
    : undefined;

  const goForward = (
    next: PaletteView,
    options?: { preservePasskeyAddMode?: boolean },
  ) => {
    dispatchChrome({
      type: "goForward",
      view: next,
      preservePasskeyAddMode: options?.preservePasskeyAddMode,
    });
  };

  const goBack = () => {
    dispatchChrome({ type: "goBack" });
  };

  const showMainView = () => {
    dispatchChrome({ type: "showMain" });
  };

  const linkedAccounts = accountsQuery.data ?? [];
  const { hasOAuthAccount, hasPasswordAccount } =
    summarizeLinkedAuthAccounts(linkedAccounts);
  const accountImage =
    busy.localImageOverride !== undefined
      ? busy.localImageOverride
      : (session?.user?.image ?? null);

  useEffect(() => {
    if (!settings) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setLocalSettings(settings);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [settings]);

  useEffect(() => {
    if (!open) {
      let cancelled = false;
      queueMicrotask(() => {
        if (cancelled) return;
        dispatchChrome({
          type: "resetHistory",
          view: initialView as PaletteView,
        });
      });
      return () => {
        cancelled = true;
      };
    }
  }, [open, initialView]);

  useEffect(() => {
    if (open) {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) {
          dispatchChrome({
            type: "resetHistory",
            view: initialView as PaletteView,
          });
        }
      });
      return () => {
        cancelled = true;
      };
    }
  }, [initialView, open]);

  useNumberedShortcuts(
    NAVIGATION_ITEMS.flatMap((item) =>
      item.parent === null ? [() => goForward(item.id as PaletteView)] : [],
    ),
    open && currentView === "main",
  );

  const updateSetting = async <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K],
  ) => {
    if (!localSettings || busy.saving) return;

    const previous = localSettings;
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);

    dispatchBusy({ type: "setSaving", value: true });
    const result = await persistSettingsUpdate({
      updateSettings,
      next: newSettings,
    });
    if (!result.ok) {
      setLocalSettings(previous);
    }
    dispatchBusy({ type: "setSaving", value: false });
  };

  const handleReset = async () => {
    dispatchBusy({ type: "setSaving", value: true });
    const result = await persistSettingsReset({ resetSettings });
    if (result.ok) {
      onOpenChange(false);
    }
    dispatchBusy({ type: "setSaving", value: false });
  };

  const handleDeleteAccount = async () => {
    dispatchBusy({ type: "setDeletingAccount", value: true });
    const result = await persistAccountDeletion({ queryClient });
    if (result.ok) {
      onOpenChange(false);
      window.location.href = "/";
    }
    dispatchBusy({ type: "setDeletingAccount", value: false });
  };

  const handleChangePassword = async ({
    currentPassword,
    newPassword,
  }: {
    currentPassword: string;
    newPassword: string;
  }) => {
    dispatchBusy({ type: "setChangingPassword", value: true });
    const result = await persistPasswordChange({
      currentPassword,
      newPassword,
    });
    dispatchBusy({ type: "setChangingPassword", value: false });
    if (result.ok === false) {
      throw result.error;
    }
  };

  const handleSetPassword = async ({
    newPassword,
  }: {
    newPassword: string;
  }) => {
    dispatchBusy({ type: "setSettingPassword", value: true });
    const result = await persistPasswordSet({
      newPassword,
      refetchAccounts: accountsQuery.refetch,
    });
    dispatchBusy({ type: "setSettingPassword", value: false });
    if (result.ok === false) {
      throw result.error;
    }
  };

  const handleResetEncryptionPassword = async ({
    newPassword,
  }: {
    newPassword: string;
  }) => {
    if (!sessionUserId) {
      throw new Error("Your session is unavailable. Please try again.");
    }

    dispatchBusy({ type: "setResettingEncryptionPassword", value: true });
    const result = await persistEncryptionPasswordReset({
      sessionUserId,
      newPassword,
    });
    dispatchBusy({ type: "setResettingEncryptionPassword", value: false });
    if (result.ok === false) {
      throw result.error;
    }
  };

  const handleUpdateProfile = async ({
    imageUrl,
  }: {
    name?: string;
    imageUrl?: string;
  }) => {
    dispatchBusy({ type: "setUpdatingProfile", value: true });
    const result = await persistProfileUpdate({ imageUrl });
    if (result.ok) {
      dispatchBusy({ type: "setLocalImageOverride", value: result.image });
    }
    dispatchBusy({ type: "setUpdatingProfile", value: false });
    if (result.ok === false) {
      throw result.error;
    }
  };

  const executeCommand = (cmd: {
    execute: {
      action: string;
      payload?: Record<string, unknown>;
    };
  }) => {
    const { action, payload } = cmd.execute;
    switch (action) {
      case "setTheme":
        if (payload?.theme) {
          void updateSetting(
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
        dispatchChrome({ type: "setPasskeyAddMode", enabled: true });
        goForward("passkeys", { preservePasskeyAddMode: true });
        break;
      case "openPasskeys":
        dispatchChrome({ type: "setPasskeyAddMode", enabled: false });
        goForward("passkeys");
        break;
    }
  };

  const handleSearchResultSelect = (
    result: UnifiedSearchResult<JmapEmailMessage>,
  ) => {
    if (result.source === "mail") {
      onOpenChange(false);
      window.location.href = buildMailUrlFromIds(
        result.mailboxIds?.[0],
        result.messageId,
        result.message.messageId,
      );
      return;
    }

    const eventStart = new Date(result.event.start);
    setCurrentDate(eventStart);
    setCalendarView("week");

    const dateParam = formatCalendarDayKey(eventStart);
    const params = new URLSearchParams(window.location.search);
    params.set("date", dateParam);
    params.set("view", "week");
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.pushState(null, "", newUrl);

    onOpenChange(false);
    if (onEventEdit) {
      onEventEdit(result.event);
    }
  };

  const paletteSearch = useCommandPaletteSearch({
    open,
    currentView,
    initialSearchQuery,
    searchQuery: chrome.searchQuery,
    setSearchQuery: (query: string) =>
      dispatchChrome({ type: "setSearchQuery", query }),
    showMainView,
    onOpenChange,
    executeCommand,
    goForward,
    onSearchResultSelect: handleSearchResultSelect,
  });

  const hasBothResults =
    paletteSearch.showEventSearch &&
    paletteSearch.searchResults.some((r) => r.source === "mail") &&
    paletteSearch.searchResults.some((r) => r.source === "calendar");

  return {
    calendars,
    loading,
    localSettings,
    isMobile,
    currentView,
    busy,
    chrome,
    session,
    sessionLoading,
    accountImage,
    hasOAuthAccount,
    hasPasswordAccount,
    activeSubscriptionEditCalendarId,
    goForward,
    goBack,
    updateSetting,
    handleReset,
    handleDeleteAccount,
    handleChangePassword,
    handleSetPassword,
    handleResetEncryptionPassword,
    handleUpdateProfile,
    paletteSearch,
    hasBothResults,
    title: getDialogTitle(currentView),
    setSubscriptionEditCalendarId: (calendarId: string | undefined) =>
      dispatchChrome({
        type: "setSubscriptionEditCalendarId",
        calendarId,
      }),
  };
}
