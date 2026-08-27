"use client";

import { useEffect, useReducer, useState, type KeyboardEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UnifiedSearchResult } from "@workspace/calendar-core";
import {
  extractLinkedAuthAccounts,
  summarizeLinkedAuthAccounts,
} from "@workspace/calendar-core";
import { authClient, useSession } from "@/lib/auth-client";
import { useSettings } from "@/hooks/use-settings";
import { usePrivateSearchIndexControls } from "@/hooks/use-private-search-index-controls";
import { useUnifiedSearch } from "@/hooks/use-unified-search";
import type { JmapEmailMessage, JmapMailbox, LabelDef } from "@/lib/mail/types";
import type { UserSettings } from "@/lib/types/calendar";
import {
  initialBusyState,
  paletteBusyReducer,
} from "../command-palette/command-palette-ui-state";
import {
  handleMailPaletteKeyDown,
  runMailAccountDeletion,
  runMailEncryptionPasswordReset,
  runMailPasswordChange,
  runMailPasswordSet,
  runMailProfileUpdate,
  runMailSettingUpdate,
  selectMailPaletteItem,
  selectUnifiedMailPaletteResult,
} from "./mail-command-palette-actions";
import {
  buildMailBrowseItems,
  buildMailSearchableItems,
  filterMailPaletteItems,
} from "./mail-command-palette-items";
import {
  createInitialMailChromeState,
  mailPaletteChromeReducer,
  type MailPaletteView,
} from "./mail-command-palette-ui-state";

export type UseMailCommandPaletteControllerOptions = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompose: () => void;
  mailboxes: JmapMailbox[];
  onCreateMailbox?: (name: string) => Promise<void>;
  onDeleteMailbox?: (id: string) => Promise<void>;
  onRenameMailbox?: (id: string, name: string) => Promise<void>;
  labels: LabelDef[];
  onCreateLabel?: (name: string, color: string) => Promise<LabelDef | null>;
  onUpdateLabel?: (
    labelId: string,
    updates: { name: string; color: string },
  ) => Promise<void>;
  onDeleteLabel?: (id: string) => Promise<void>;
  initialView?: string;
  onSelectMessage?: (id: string) => void;
};

export function useMailCommandPaletteController({
  open,
  onOpenChange,
  onCompose,
  mailboxes,
  onCreateMailbox,
  onDeleteMailbox,
  onRenameMailbox,
  labels,
  onCreateLabel,
  onUpdateLabel,
  onDeleteLabel,
  initialView,
  onSelectMessage,
}: UseMailCommandPaletteControllerOptions) {
  const [chrome, dispatchChrome] = useReducer(
    mailPaletteChromeReducer,
    undefined,
    () => createInitialMailChromeState(),
  );
  const currentView = chrome.navHistory[chrome.navHistory.length - 1] ?? "main";
  const [busy, dispatchBusy] = useReducer(paletteBusyReducer, initialBusyState);
  const [localSettings, setLocalSettings] = useState<UserSettings | null>(null);
  const privateSearchIndex = usePrivateSearchIndexControls();

  const { data: session, isPending: sessionLoading } = useSession();
  const sessionUserId = session?.user?.id ?? null;
  const { settings, updateSettings } = useSettings();
  const queryClient = useQueryClient();
  const accountsQuery = useQuery({
    queryKey: ["auth", "accounts", sessionUserId],
    queryFn: async () => {
      if (typeof authClient.listAccounts !== "function") return [];
      return extractLinkedAuthAccounts(await authClient.listAccounts());
    },
    enabled:
      Boolean(sessionUserId) && typeof authClient.listAccounts === "function",
    staleTime: 5 * 60 * 1000,
  });
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
    const timer = setTimeout(() => {
      dispatchChrome({
        type: "setDebouncedSearchQuery",
        query: chrome.query,
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [chrome.query]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (!open) {
        dispatchChrome({ type: "reset", view: "main" });
        return;
      }
      if (initialView) {
        dispatchChrome({
          type: "reset",
          view: initialView as MailPaletteView,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, initialView]);

  const goForward = (
    next: MailPaletteView,
    options?: { passkeyAddMode?: boolean },
  ) => {
    dispatchChrome({
      type: "goForward",
      view: next,
      passkeyAddMode: options?.passkeyAddMode,
    });
  };

  const goBack = () => {
    dispatchChrome({ type: "goBack" });
  };

  const updateSetting = async <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K],
  ) => {
    await runMailSettingUpdate({
      localSettings,
      saving: busy.saving,
      key,
      value,
      setLocalSettings,
      setSaving: (saving) => dispatchBusy({ type: "setSaving", value: saving }),
      updateSettings,
    });
  };

  const handleDeleteAccount = () =>
    runMailAccountDeletion({
      queryClient,
      setBusy: (value) =>
        dispatchBusy({ type: "setDeletingAccount", value }),
      onDeleted: () => {
        onOpenChange(false);
        window.location.href = "/";
      },
    });

  const handleChangePassword = (input: {
    currentPassword: string;
    newPassword: string;
  }) =>
    runMailPasswordChange({
      ...input,
      setBusy: (value) =>
        dispatchBusy({ type: "setChangingPassword", value }),
    });

  const handleSetPassword = (input: { newPassword: string }) =>
    runMailPasswordSet({
      ...input,
      refetchAccounts: accountsQuery.refetch,
      setBusy: (value) => dispatchBusy({ type: "setSettingPassword", value }),
    });

  const handleResetEncryptionPassword = (input: { newPassword: string }) =>
    runMailEncryptionPasswordReset({
      ...input,
      sessionUserId,
      setBusy: (value) =>
        dispatchBusy({ type: "setResettingEncryptionPassword", value }),
    });

  const handleUpdateProfile = (input: {
    name?: string;
    imageUrl?: string;
  }) =>
    runMailProfileUpdate({
      imageUrl: input.imageUrl,
      setBusy: (value) =>
        dispatchBusy({ type: "setUpdatingProfile", value }),
      onImageUpdated: (image) =>
        dispatchBusy({ type: "setLocalImageOverride", value: image }),
    });

  const searchableItems = buildMailSearchableItems(settings?.timezone);
  const items = filterMailPaletteItems(searchableItems, chrome.query);
  const mainListItems = chrome.query.trim()
    ? items
    : buildMailBrowseItems(settings?.timezone);

  const showUnifiedSearch =
    currentView === "main" && chrome.debouncedSearchQuery.trim().length >= 2;
  const { results: unifiedResults, isFetching: unifiedSearchLoading } =
    useUnifiedSearch({
      query: chrome.debouncedSearchQuery,
      enabled: open && showUnifiedSearch,
      includeMail: true,
      includeCalendar: true,
      limit: 15,
    });

  const hasBothResults =
    showUnifiedSearch &&
    unifiedResults.some((result) => result.source === "mail") &&
    unifiedResults.some((result) => result.source === "calendar");

  const handleSelect = (item: (typeof mainListItems)[number]) => {
    selectMailPaletteItem({
      item,
      onOpenChange,
      onCompose,
      goForward,
    });
  };

  const handleUnifiedResultSelect = (
    result: UnifiedSearchResult<JmapEmailMessage>,
  ) => {
    selectUnifiedMailPaletteResult({
      result,
      onOpenChange,
      onSelectMessage,
    });
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    handleMailPaletteKeyDown({
      event,
      currentView,
      showUnifiedSearch,
      unifiedResults,
      mainListItems,
      selectedIndex: chrome.selectedIndex,
      onMoveSelection: (delta, maxIndex) =>
        dispatchChrome({ type: "moveSelection", delta, maxIndex }),
      onSelectUnified: handleUnifiedResultSelect,
      onSelectItem: handleSelect,
    });
  };

  return {
    chrome,
    currentView,
    localSettings,
    privateSearchIndex,
    session,
    sessionLoading,
    accountImage,
    hasOAuthAccount,
    hasPasswordAccount,
    busy,
    mailboxes,
    labels,
    onCreateMailbox,
    onDeleteMailbox,
    onRenameMailbox,
    onCreateLabel,
    onUpdateLabel,
    onDeleteLabel,
    goForward,
    goBack,
    updateSetting,
    handleDeleteAccount,
    handleChangePassword,
    handleSetPassword,
    handleResetEncryptionPassword,
    handleUpdateProfile,
    mainListItems,
    showUnifiedSearch,
    unifiedResults,
    unifiedSearchLoading,
    hasBothResults,
    handleSelect,
    handleUnifiedResultSelect,
    handleKeyDown,
    setQuery: (query: string) => dispatchChrome({ type: "setQuery", query }),
  };
}
