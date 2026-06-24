"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  ChevronRight,
  ArrowLeft,
  SquarePen,
  Sun,
  Moon,
  Monitor,
  Check,
  Shield,
  Inbox,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { UnifiedSearchResult } from "@workspace/calendar-core";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { VisuallyHidden } from "@workspace/ui/components/ui/visually-hidden";
import { createLogger } from "@workspace/logger";
import { authClient, signOut, useSession } from "@/lib/auth-client";
import { calendarApiService } from "@/lib/calendar-api-service";
import { resetEncryptionPasswordForActiveSession } from "@/lib/e2ee-password-reset";
import { useSettings } from "@/hooks/use-settings";
import {
  extractLinkedAuthAccounts,
  summarizeLinkedAuthAccounts,
} from "@workspace/calendar-core";
import { gsap, useGSAP } from "@workspace/ui/lib/gsap";
import { usePrefersReducedMotion } from "@workspace/ui/hooks";
import { AccountSettings } from "../command-palette/account-settings";
import { NotificationSettings } from "../command-palette/notification-settings";
import { TimeRegionSettings } from "../command-palette/time-region-settings";
import { TransitionContainer } from "../command-palette/transition-container";
import { SettingToggleRow } from "../command-palette/setting-toggle-row";
import { ComposeSettingsPanel } from "./compose-settings-panel";
import { MailDisplaySettingsPanel } from "./mail-display-settings-panel";
import { MailListSettingsPanel } from "./mail-list-settings-panel";
import { ContactsSettingsPanel } from "./contacts-settings-panel";
import { InviteSettings } from "../command-palette/invite-settings";
import { PasswordSection } from "../command-palette/password-section";
import { PasskeySettings } from "@/components/passkey-settings";
import { MailboxManager } from "./mailbox-manager";
import { LabelPickerPanel } from "./label-picker-panel";
import { getRootBaseSettingsNavigationItems } from "../command-palette/base-navigation";
import { UnifiedSearchResults } from "../command-palette/unified-search-results";
import { useUnifiedSearch } from "@/hooks/use-unified-search";
import { usePrivateSearchIndexControls } from "@/hooks/use-private-search-index-controls";
import { MailSettingsHub } from "./mail-settings-hub";
import {
  MAIL_SETTINGS_NAV_ITEMS,
} from "./mail-settings-navigation";
import type { JmapMailbox } from "@/lib/mail/types";
import type { JmapEmailMessage, LabelDef } from "@/lib/mail/types";
import type { UserSettings } from "@/lib/types/calendar";

type MailPaletteView =
  | "main"
  | "account"
  | "appearance"
  | "time-region"
  | "timezone"
  | "notifications"
  | "security"
  | "passkeys"
  | "mailboxes"
  | "mailbox-create"
  | "mailbox-edit"
  | "invites"
  | "labels"
  | "composing"
  | "mail-display"
  | "mail-list"
  | "contacts"
  | "mail-settings";

interface PaletteItem {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export interface MailCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompose: () => void;
  mailboxes?: JmapMailbox[];
  onCreateMailbox?: (name: string) => Promise<void>;
  onDeleteMailbox?: (id: string) => Promise<void>;
  onRenameMailbox?: (id: string, name: string) => Promise<void>;
  labels?: LabelDef[];
  onCreateLabel?: (name: string, color: string) => Promise<LabelDef | null>;
  onUpdateLabel?: (
    labelId: string,
    updates: { name: string; color: string },
  ) => Promise<void>;
  onDeleteLabel?: (id: string) => Promise<void>;
  initialView?: string;
  messages?: JmapEmailMessage[];
  onSelectMessage?: (id: string) => void;
}

const log = createLogger("mail-command-palette");

const EMPTY_MAILBOXES: JmapMailbox[] = [];
const EMPTY_LABELS: LabelDef[] = [];
const EMPTY_MESSAGES: JmapEmailMessage[] = [];

function LabelsView({
  goBack,
  labels,
  onCreateLabel,
  onUpdateLabel,
  onDeleteLabel,
}: {
  goBack: () => void;
  labels: LabelDef[];
  onCreateLabel?: (name: string, color: string) => Promise<LabelDef | null>;
  onUpdateLabel?: (
    labelId: string,
    updates: { name: string; color: string },
  ) => Promise<void>;
  onDeleteLabel?: (id: string) => Promise<void>;
}) {
  return (
    <div
      className="flex flex-col"
      style={{ minHeight: "240px", maxHeight: "calc(100dvh - 200px)" }}
    >
      <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
        <button
          type="button"
          onClick={goBack}
          className="p-1 rounded hover:bg-muted/50 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="size-4 text-muted-foreground" />
        </button>
        <span className="text-sm font-medium flex-1">Labels</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <LabelPickerPanel
          labels={labels}
          onCreateLabel={onCreateLabel}
          onUpdateLabel={onUpdateLabel}
          onDeleteLabel={
            onDeleteLabel
              ? (id) => {
                  void onDeleteLabel(id);
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}

export function MailCommandPalette({
  open,
  onOpenChange,
  onCompose,
  mailboxes = EMPTY_MAILBOXES,
  onCreateMailbox,
  onDeleteMailbox,
  onRenameMailbox,
  labels = EMPTY_LABELS,
  onCreateLabel,
  onUpdateLabel,
  onDeleteLabel,
  initialView,
  messages = EMPTY_MESSAGES,
  onSelectMessage,
}: MailCommandPaletteProps) {
  const [navHistory, setNavHistory] = useState<MailPaletteView[]>(["main"]);
  const currentView = navHistory[navHistory.length - 1] ?? "main";
  const [query, setQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [passkeyAddMode, setPasskeyAddMode] = useState(false);
  const [showIndexingPrompt, setShowIndexingPrompt] = useState(false);
  const privateSearchIndex = usePrivateSearchIndexControls();

  const { data: session, isPending: sessionLoading } = useSession();
  const sessionUserId = session?.user?.id ?? null;
  const { settings, updateSettings } = useSettings();
  const [localSettings, setLocalSettings] = useState<UserSettings | null>(null);

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

  // Debounce the search query to avoid firing on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(query);
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const updateSetting = useCallback(
    async <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
      if (!localSettings) return;
      const next = { ...localSettings, [key]: value };
      setLocalSettings(next);
      try {
        await updateSettings({ [key]: value } as Parameters<
          typeof updateSettings
        >[0]);
      } catch {
        setLocalSettings(localSettings);
      }
    },
    [localSettings, updateSettings],
  );

  const queryClient = useQueryClient();
  const { data: accountsData, refetch: refetchAccounts } = useQuery({
    queryKey: ["auth", "accounts", sessionUserId],
    queryFn: async () => {
      if (typeof authClient.listAccounts !== "function") return [];
      return extractLinkedAuthAccounts(await authClient.listAccounts());
    },
    enabled:
      Boolean(sessionUserId) && typeof authClient.listAccounts === "function",
    staleTime: 5 * 60 * 1000,
  });
  const linkedAccounts = useMemo(
    () => accountsData ?? [],
    [accountsData],
  );
  const { hasOAuthAccount, hasPasswordAccount } = useMemo(
    () => summarizeLinkedAuthAccounts(linkedAccounts),
    [linkedAccounts],
  );

  const [deletingAccount, setDeletingAccount] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [settingPassword, setSettingPassword] = useState(false);
  const [resettingEncryptionPassword, setResettingEncryptionPassword] =
    useState(false);
  const [updatingProfile, setUpdatingProfile] = useState(false);

  const goForward = useCallback((next: MailPaletteView) => {
    setQuery("");
    setDebouncedSearchQuery("");
    setSelectedIndex(0);
    setNavHistory((h) => [...h, next]);
  }, []);

  const goBack = useCallback(() => {
    setQuery("");
    setDebouncedSearchQuery("");
    setPasskeyAddMode(false);
    setNavHistory((h) => (h.length > 1 ? h.slice(0, -1) : ["main"]));
  }, []);

  useEffect(() => {
    if (!open) {
      let cancelled = false;
      queueMicrotask(() => {
        if (cancelled) return;
        setNavHistory(["main"]);
        setQuery("");
        setDebouncedSearchQuery("");
        setSelectedIndex(0);
        setPasskeyAddMode(false);
        setShowIndexingPrompt(false);
      });
      return () => {
        cancelled = true;
      };
    } else if (initialView) {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) {
          setNavHistory([initialView as MailPaletteView]);
        }
      });
      return () => {
        cancelled = true;
      };
    }
  }, [open, initialView]);

  const handleDeleteAccount = useCallback(async () => {
    setDeletingAccount(true);
    try {
      await calendarApiService.deleteAccount();
      queryClient.clear();
      try {
        await signOut();
      } catch {}
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
        if (result?.error)
          throw new Error(
            result.error.message || "Unable to update your password.",
          );
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
        const result = await authClient.setPassword({ newPassword });
        if (result?.error)
          throw new Error(
            result.error.message || "Unable to set your password.",
          );
        await refetchAccounts();
      } catch (error) {
        log.error("Failed to set password:", error);
        throw error;
      } finally {
        setSettingPassword(false);
      }
    },
    [refetchAccounts],
  );

  const handleResetEncryptionPassword = useCallback(
    async ({ newPassword }: { newPassword: string }) => {
      if (!sessionUserId)
        throw new Error("Your session is unavailable. Please try again.");
      setResettingEncryptionPassword(true);
      try {
        const stored = await resetEncryptionPasswordForActiveSession(
          sessionUserId,
          newPassword,
        );
        if (!stored)
          throw new Error(
            "Unlock your encrypted data on this device first, then try again.",
          );
      } catch (error) {
        log.error("Failed to reset encryption password:", error);
        throw error;
      } finally {
        setResettingEncryptionPassword(false);
      }
    },
    [sessionUserId],
  );

  const handleUpdateProfile = useCallback(
    async ({ imageUrl }: { name?: string; imageUrl?: string }) => {
      setUpdatingProfile(true);
      try {
        const result = await authClient.updateUser({ image: imageUrl ?? null });
        if (result?.error)
          throw new Error(
            result.error.message || "Unable to update your profile.",
          );
      } catch (error) {
        log.error("Failed to update profile:", error);
        throw error;
      } finally {
        setUpdatingProfile(false);
      }
    },
    [],
  );

  const rootPreferenceItems = useMemo(
    () =>
      getRootBaseSettingsNavigationItems({
        timezone: settings?.timezone,
      }).map((item) => ({
        id: item.id,
        label: item.label,
        icon: item.icon,
        description: item.description,
      })),
    [settings?.timezone],
  );

  const searchableItems = useMemo<PaletteItem[]>(
    () => [
      {
        id: "compose",
        label: "Compose",
        icon: SquarePen,
        description: "Write a new message",
      },
      ...MAIL_SETTINGS_NAV_ITEMS.map((item) => ({
        id: item.id,
        label: item.label,
        icon: item.icon,
        description: item.description,
      })),
      ...rootPreferenceItems,
    ],
    [rootPreferenceItems],
  );

  const mainBrowseItems = useMemo(
    () => [
      {
        id: "compose",
        label: "Compose",
        icon: SquarePen,
        description: "Write a new message",
      },
      {
        id: "mail-settings",
        label: "Mail settings",
        icon: Inbox,
        description: "Mailboxes, labels, contacts, composing, display, list, shortcuts",
      },
      ...rootPreferenceItems,
    ],
    [rootPreferenceItems],
  );

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return searchableItems.filter((item) => {
      if (item.label.toLowerCase().includes(q)) return true;
      if (item.description.toLowerCase().includes(q)) return true;
      const mailItem = MAIL_SETTINGS_NAV_ITEMS.find(
        (entry) => entry.id === item.id,
      );
      return mailItem?.keywords.some((keyword) => keyword.includes(q)) ?? false;
    });
  }, [query, searchableItems]);
  const showUnifiedSearch = currentView === "main" && debouncedSearchQuery.trim().length >= 2;
  const {
    results: unifiedResults,
    isFetching: unifiedSearchLoading,
  } = useUnifiedSearch({
    query: debouncedSearchQuery,
    enabled: open && showUnifiedSearch,
    includeMail: true,
    includeCalendar: true,
    limit: 15,
  });

  const hasBothResults =
    showUnifiedSearch &&
    unifiedResults.some((r) => r.source === "mail") &&
    unifiedResults.some((r) => r.source === "calendar");

  const dialogInnerRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useGSAP(
    () => {
      const inner = dialogInnerRef.current;
      if (!inner) return;
      const dialogEl = inner.closest<HTMLElement>('[data-slot="dialog-content"]');
      if (!dialogEl) return;
      const targetW = hasBothResults ? 760 : 560;
      if (prefersReducedMotion) {
        gsap.set(dialogEl, { width: targetW });
        return;
      }
      gsap.to(dialogEl, { width: targetW, duration: 0.22, ease: "power2.inOut" });
    },
    { dependencies: [hasBothResults, prefersReducedMotion] },
  );

  const handleSelect = useCallback(
    (item: PaletteItem) => {
      if (item.id === "compose") {
        onOpenChange(false);
        onCompose();
      } else {
        goForward(item.id as MailPaletteView);
      }
    },
    [onOpenChange, onCompose, goForward],
  );

  const mainListItems = query.trim() ? items : mainBrowseItems;

  const handleUnifiedResultSelect = useCallback(
    (result: UnifiedSearchResult<JmapEmailMessage>) => {
      onOpenChange(false);
      if (result.source === "mail") {
        onSelectMessage?.(result.messageId);
        return;
      }

      window.location.href = `/calendar?eventId=${encodeURIComponent(
        result.eventId,
      )}`;
    },
    [onOpenChange, onSelectMessage],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (currentView !== "main") return;
    const unifiedCount = showUnifiedSearch ? unifiedResults.length : 0;
    const totalCount = unifiedCount + mainListItems.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, Math.max(totalCount - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (selectedIndex < unifiedCount) {
        e.preventDefault();
        const result = unifiedResults[selectedIndex];
        if (result) handleUnifiedResultSelect(result);
        return;
      }

      const item = mainListItems[selectedIndex - unifiedCount];
      if (item) {
        e.preventDefault();
        handleSelect(item);
      }
    }
  };

  const renderContent = () => {
    if (currentView === "main") {
      return (
        <div
          className="flex flex-col"
          style={{
            minHeight: "clamp(280px, 50svh, 420px)",
            maxHeight: "calc(100dvh - 80px)",
          }}
        >
          <div className="flex items-center gap-2 p-3 sm:py-2 border-b border-border/50">
            <Search className="size-4 text-muted-foreground shrink-0" />
            <Input
              type="text"
              placeholder="Search or jump to…"
              value={query}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(e) => {
                const nextQuery = e.target.value;
                setQuery(nextQuery);
                setSelectedIndex(0);
                if (
                  currentView === "main" &&
                  nextQuery.trim().length >= 2 &&
                  privateSearchIndex.consent === "undecided"
                ) {
                  setShowIndexingPrompt(true);
                }
              }}
              className="flex-1 h-8 bg-transparent border-0 ring-0 focus:ring-0 focus:border-0 focus:outline-none rounded-none px-0 text-sm placeholder:text-muted-foreground/60"
            />
            {query && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setQuery("")}
                className="p-1 h-auto"
              >
                <svg
                  className="size-4 text-muted-foreground"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d="M2.343 13.657A8 8 0 1 1 13.658 2.343 8 8 0 0 1 2.343 13.657ZM6.03 4.97a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042L6.94 8 4.97 9.97a.749.749 0 0 0 .326 1.275.749.749 0 0 0 .734-.215L8 9.06l1.97 1.97a.749.749 0 0 0 1.275-.326.749.749 0 0 0-.215-.734L9.06 8l1.97-1.97a.749.749 0 0 0-.326-1.275.749.749 0 0 0-.734.215L8 6.94Z" />
                </svg>
              </Button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {showUnifiedSearch && (
              <UnifiedSearchResults
                results={unifiedResults}
                isLoading={unifiedSearchLoading}
                selectedIndex={selectedIndex}
                onSelect={handleUnifiedResultSelect}
              />
            )}
            {mainListItems.length === 0 && unifiedResults.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No results found.
              </div>
            ) : (
              <div className="px-2">
                {mainListItems.map((item, index) => {
                  const globalIndex =
                    (showUnifiedSearch ? unifiedResults.length : 0) + index;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item)}
                      data-index={globalIndex}
                      className={`flex items-center gap-3 p-2 sm:py-1.5 min-h-[44px] w-full rounded-md text-left focus:outline-none transition-colors group ${globalIndex === selectedIndex ? "bg-accent/50" : "hover:bg-accent/50"}`}
                    >
                      <div className="flex items-center justify-center size-8 sm:w-6 sm:h-6 shrink-0">
                        <item.icon className="h-[18px] w-[18px] sm:h-4 sm:w-4 text-muted-foreground" />
                      </div>
                      <span className="text-sm flex-1 truncate">
                        {item.label}
                      </span>
                      <span className="text-xs text-muted-foreground hidden sm:block group-hover:text-muted-foreground/70">
                        {item.description}
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground/40 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (currentView === "appearance") {
      const themeOptions = [
        { value: "light", icon: Sun, label: "Light", color: "text-amber-500" },
        { value: "dark", icon: Moon, label: "Dark", color: "text-muted-foreground" },
        {
          value: "system",
          icon: Monitor,
          label: "System",
          color: "text-muted-foreground",
        },
      ];
      return (
        <div
          className="flex flex-col"
          style={{ minHeight: "240px", maxHeight: "calc(100dvh - 200px)" }}
        >
          <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
            <button
              type="button"
              onClick={goBack}
              className="p-1 rounded hover:bg-muted/50 transition-colors"
            >
              <ArrowLeft className="size-4 text-muted-foreground" />
            </button>
            <span className="text-sm font-medium">Appearance</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <div className="px-1 pb-1">
              <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase px-2">
                Theme
              </span>
            </div>
            {themeOptions.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() =>
                  void updateSetting(
                    "theme",
                    item.value as UserSettings["theme"],
                  )
                }
                className="flex items-center gap-3 p-2 w-full rounded-md text-left hover:bg-accent/50 focus:bg-accent/50 focus:outline-none transition-colors"
              >
                <div className="flex items-center justify-center size-6 shrink-0">
                  <item.icon className={`size-4 ${item.color}`} />
                </div>
                <span className="text-sm flex-1">{item.label}</span>
                {localSettings?.theme === item.value && (
                  <Check className="size-4 text-primary shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (currentView === "time-region" || currentView === "timezone") {
      if (!localSettings) return null;
      return (
        <div
          className="flex flex-col"
          style={{ minHeight: "240px", maxHeight: "calc(100dvh - 200px)" }}
        >
          <TimeRegionSettings
            localSettings={localSettings}
            updateSetting={updateSetting}
            goBack={goBack}
            goForward={goForward}
            currentView={currentView}
          />
        </div>
      );
    }

    if (currentView === "notifications") {
      if (!localSettings) return null;
      return (
        <div
          className="flex flex-col"
          style={{ minHeight: "240px", maxHeight: "calc(100dvh - 200px)" }}
        >
          <NotificationSettings
            localSettings={localSettings}
            updateSetting={updateSetting}
            goBack={goBack}
          />
        </div>
      );
    }

    if (currentView === "security") {
      return (
        <div
          className="flex flex-col"
          style={{ minHeight: "240px", maxHeight: "calc(100dvh - 200px)" }}
        >
          <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
            <button
              type="button"
              onClick={goBack}
              className="p-1 rounded hover:bg-muted/50 transition-colors"
            >
              <ArrowLeft className="size-4 text-muted-foreground" />
            </button>
            <span className="text-sm font-medium">Security</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <div className="px-1 pb-1">
              <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase px-2">
                Authentication
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setPasskeyAddMode(false);
                goForward("passkeys");
              }}
              className="flex items-center gap-3 p-2 w-full rounded-md text-left hover:bg-accent/50 focus:bg-accent/50 focus:outline-none transition-colors group"
            >
              <div className="flex items-center justify-center size-6 shrink-0">
                <Shield className="size-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm">Passkeys</div>
                <div className="text-xs text-muted-foreground">
                  Manage passwordless authentication
                </div>
              </div>
              <ChevronRight className="size-4 text-muted-foreground/40 shrink-0" />
            </button>
            <SettingToggleRow
              icon={Search}
              label="Private content indexing"
              description="Store an encrypted device-local index for deeper mail and calendar search"
              checked={privateSearchIndex.enabled}
              onToggle={
                privateSearchIndex.enabled
                  ? privateSearchIndex.disable
                  : privateSearchIndex.enable
              }
            />
            {privateSearchIndex.hasMadeChoice && (
              <div className="px-3 py-2">
                <div className="rounded-md border border-border/50 bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm">Index status</div>
                      <div className="text-xs text-muted-foreground">
                        {privateSearchIndex.enabled
                          ? privateSearchIndex.paused
                            ? "Enabled but paused on this device"
                            : "Enabled on this device"
                          : "Disabled on this device"}
                      </div>
                    </div>
                    {privateSearchIndex.enabled && (
                      <button
                        type="button"
                        onClick={
                          privateSearchIndex.paused
                            ? privateSearchIndex.resume
                            : privateSearchIndex.pause
                        }
                        className="rounded-md px-2 py-1 text-xs text-foreground hover:bg-muted"
                      >
                        {privateSearchIndex.paused ? "Resume" : "Pause"}
                      </button>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={
                        privateSearchIndex.enabled
                          ? privateSearchIndex.disable
                          : privateSearchIndex.enable
                      }
                      className="rounded-md px-2 py-1 text-xs text-foreground hover:bg-muted"
                    >
                      {privateSearchIndex.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      disabled={privateSearchIndex.isClearing}
                      onClick={() => void privateSearchIndex.clearIndex()}
                      className="rounded-md px-2 py-1 text-xs text-destructive hover:bg-muted disabled:opacity-50"
                    >
                      {privateSearchIndex.isClearing ? "Clearing..." : "Clear index"}
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="px-1 pb-1 pt-3 border-t border-border/40 mt-1">
              <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase px-2">
                Password
              </span>
            </div>
            <PasswordSection
              hasPasswordAccount={hasPasswordAccount}
              hasOAuthAccount={hasOAuthAccount}
              changingPassword={changingPassword}
              settingPassword={settingPassword}
              resettingEncryptionPassword={resettingEncryptionPassword}
              handleChangePassword={handleChangePassword}
              handleSetPassword={handleSetPassword}
              handleResetEncryptionPassword={handleResetEncryptionPassword}
            />
          </div>
        </div>
      );
    }

    if (currentView === "passkeys") {
      return (
        <div
          className="flex flex-col"
          style={{ minHeight: "240px", maxHeight: "calc(100dvh - 200px)" }}
        >
          <PasskeySettings
            open={open}
            onBack={goBack}
            startInAddMode={passkeyAddMode}
          />
        </div>
      );
    }

    if (
      currentView === "mail-settings" ||
      currentView === "mailboxes" ||
      currentView === "mailbox-create" ||
      currentView === "mailbox-edit"
    ) {
      if (currentView === "mail-settings") {
        return (
          <MailSettingsHub
            goBack={goBack}
            onNavigate={(view) => goForward(view)}
          />
        );
      }

      return (
        <div
          className="flex flex-col"
          style={{ minHeight: "240px", maxHeight: "calc(100dvh - 200px)" }}
        >
          <MailboxManager
            mailboxes={mailboxes}
            currentView={currentView}
            onBack={goBack}
            onNavigateTo={(view) => goForward(view as MailPaletteView)}
            onCreateMailbox={onCreateMailbox ?? (() => Promise.resolve())}
            onDeleteMailbox={onDeleteMailbox ?? (() => Promise.resolve())}
            onRenameMailbox={onRenameMailbox}
          />
        </div>
      );
    }

    if (currentView === "account") {
      return (
        <AccountSettings
          goBack={goBack}
          saving={false}
          handleReset={() => {}}
          deletingAccount={deletingAccount}
          handleDeleteAccount={handleDeleteAccount}
          accountName={session?.user?.name}
          accountEmail={session?.user?.email}
          accountImage={session?.user?.image}
          sessionLoading={sessionLoading}
          changingPassword={changingPassword}
          settingPassword={settingPassword}
          resettingEncryptionPassword={resettingEncryptionPassword}
          hasPasswordAccount={hasPasswordAccount}
          hasOAuthAccount={hasOAuthAccount}
          handleChangePassword={handleChangePassword}
          handleSetPassword={handleSetPassword}
          handleResetEncryptionPassword={handleResetEncryptionPassword}
          updatingProfile={updatingProfile}
          handleUpdateProfile={handleUpdateProfile}
          onOpenInvites={() => goForward("invites")}
          onOpenSecurity={() => goForward("security")}
        />
      );
    }

    if (currentView === "invites") {
      return <InviteSettings goBack={goBack} />;
    }

    if (currentView === "labels") {
      return (
        <LabelsView
          goBack={goBack}
          labels={labels}
          onCreateLabel={onCreateLabel}
          onUpdateLabel={onUpdateLabel}
          onDeleteLabel={onDeleteLabel}
        />
      );
    }

    if (currentView === "composing") {
      return <ComposeSettingsPanel goBack={goBack} />;
    }

    if (currentView === "mail-display") {
      return <MailDisplaySettingsPanel goBack={goBack} />;
    }

    if (currentView === "mail-list") {
      return <MailListSettingsPanel goBack={goBack} />;
    }

    if (currentView === "contacts") {
      return <ContactsSettingsPanel goBack={goBack} />;
    }

    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="spotlight"
        showClose={false}
        aria-describedby={undefined}
        className="overflow-hidden p-0 bg-popover border-border/50 shadow-2xl flex flex-col"
        onKeyDown={handleKeyDown}
      >
        <div ref={dialogInnerRef} style={{ display: "contents" }}>
          <VisuallyHidden>
            <DialogTitle>Mail</DialogTitle>
          </VisuallyHidden>
          <TransitionContainer viewKey={currentView}>
            {renderContent()}
          </TransitionContainer>
          <div className="px-3 py-2 border-t border-border/50 text-xs text-muted-foreground flex items-center justify-between shrink-0">
            <span />
            <span className="hidden sm:flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
                ↑↓
              </kbd>{" "}
              to navigate
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
                ↵
              </kbd>{" "}
              to select
            </span>
          </div>
        </div>
      </DialogContent>
      <Dialog open={showIndexingPrompt} onOpenChange={setShowIndexingPrompt}>
        <DialogContent className="w-[calc(100dvw-1rem)] p-6 pr-12 sm:w-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enable private content indexing?</DialogTitle>
            <DialogDescription>
              Keep an encrypted search index on this device for richer, faster
              mail and calendar search. You can change this later in Privacy.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                privateSearchIndex.decline();
                setShowIndexingPrompt(false);
              }}
              className="rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={() => {
                privateSearchIndex.accept();
                setShowIndexingPrompt(false);
              }}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              Enable indexing
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
