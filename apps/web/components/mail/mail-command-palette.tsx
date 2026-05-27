"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  X,
  ChevronRight,
  ArrowLeft,
  SquarePen,
  EyeOff,
  ShieldOff,
  Sun,
  Moon,
  Monitor,
  Check,
  Shield,
  Inbox,
  Tag,
  Plus,
  Trash2,
  Loader2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
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
import { AccountSettings } from "../command-palette/account-settings";
import { NotificationSettings } from "../command-palette/notification-settings";
import { TimeRegionSettings } from "../command-palette/time-region-settings";
import { TransitionContainer } from "../command-palette/transition-container";
import { SettingToggleRow } from "../command-palette/setting-toggle-row";
import { InviteSettings } from "../command-palette/invite-settings";
import { PasswordSection } from "../command-palette/password-section";
import { PasskeySettings } from "@/components/passkey-settings";
import { MailboxManager } from "./mailbox-manager";
import { getBaseSettingsNavigationItems } from "../command-palette/base-navigation";
import type { JmapMailbox } from "@/lib/mail/types";
import type { LabelDef } from "@/lib/mail/types";
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
  | "labels";

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
  blockRemoteImages: boolean;
  blockTrackingPixels: boolean;
  onToggleBlockRemoteImages: () => void;
  onToggleBlockTrackingPixels: () => void;
  mailboxes?: JmapMailbox[];
  onCreateMailbox?: (name: string) => Promise<void>;
  onDeleteMailbox?: (id: string) => Promise<void>;
  onRenameMailbox?: (id: string, name: string) => Promise<void>;
  labels?: LabelDef[];
  onCreateLabel?: (name: string, color: string) => Promise<LabelDef | null>;
  onDeleteLabel?: (id: string) => Promise<void>;
  initialView?: string;
}

const log = createLogger("mail-command-palette");

const LABEL_COLORS: { value: string; hex: string }[] = [
  { value: "blue", hex: "#3b82f6" },
  { value: "red", hex: "#ef4444" },
  { value: "green", hex: "#22c55e" },
  { value: "yellow", hex: "#facc15" },
  { value: "orange", hex: "#f97316" },
  { value: "purple", hex: "#a855f7" },
  { value: "pink", hex: "#ec4899" },
  { value: "teal", hex: "#14b8a6" },
];

function LabelsView({
  goBack,
  labels,
  onCreateLabel,
  onDeleteLabel,
}: {
  goBack: () => void;
  labels: LabelDef[];
  onCreateLabel?: (name: string, color: string) => Promise<LabelDef | null>;
  onDeleteLabel?: (id: string) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("blue");
  const [hexInput, setHexInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isValidHex = (v: string) =>
    /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(v);

  const colorPreview = isValidHex(newColor)
    ? newColor
    : (LABEL_COLORS.find((c) => c.value === newColor)?.hex ?? "#888");

  const handleHexInput = (v: string) => {
    setHexInput(v);
    if (isValidHex(v)) setNewColor(v);
  };

  const handlePresetClick = (value: string) => {
    setNewColor(value);
    setHexInput("");
  };

  const handleCreate = async () => {
    if (!newName.trim() || !onCreateLabel) return;
    setSaving(true);
    try {
      await onCreateLabel(newName.trim(), newColor);
      setNewName("");
      setNewColor("blue");
      setHexInput("");
      setCreating(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!onDeleteLabel) return;
    setDeletingId(id);
    try {
      await onDeleteLabel(id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      className="flex flex-col"
      style={{ minHeight: "240px", maxHeight: "calc(100dvh - 200px)" }}
    >
      <div className="flex items-center gap-2 px-3 h-12 border-b border-border/50 shrink-0">
        <button
          type="button"
          onClick={goBack}
          className="p-1 rounded hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft className="size-4 text-muted-foreground" />
        </button>
        <span className="text-sm font-medium flex-1">Labels</span>
        {onCreateLabel ? (
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="p-1 rounded hover:bg-muted/50 transition-colors"
            aria-label="New label"
          >
            <Plus className="size-4 text-muted-foreground" />
          </button>
        ) : null}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {creating ? (
          <div className="mx-1 mb-2 rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Label name"
              disabled={saving}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
                if (e.key === "Escape") setCreating(false);
              }}
              className="flex h-9 w-full rounded-md bg-input px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
            />
            <div className="flex gap-1.5 flex-wrap items-center">
              {LABEL_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => handlePresetClick(c.value)}
                  style={{ backgroundColor: c.hex }}
                  className={`size-5 rounded-full transition-transform ${newColor === c.value ? "ring-2 ring-ring ring-offset-1 scale-110" : ""}`}
                  aria-label={c.value}
                />
              ))}
              <div className="flex items-center gap-1.5 ml-1">
                <div
                  className="size-5 rounded-full border border-border/50 shrink-0"
                  style={{ backgroundColor: colorPreview }}
                />
                <input
                  type="text"
                  value={hexInput}
                  onChange={(e) => handleHexInput(e.target.value)}
                  placeholder="#000000"
                  className="h-7 w-20 rounded-md bg-input px-2 text-xs font-mono text-foreground outline-none placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-ring/30"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={saving || !newName.trim()}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Check className="size-3" />
                )}
                Create
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                }}
                className="inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent/40"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        {labels.length === 0 && !creating ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No labels yet.
          </div>
        ) : null}
        {labels.map((label) => {
          const displayColor = /^#/.test(label.color)
            ? label.color
            : (LABEL_COLORS.find((c) => c.value === label.color)?.hex ??
              "#888");
          return (
            <div
              key={label.id}
              className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50 group"
            >
              <div
                className="size-3 rounded-full shrink-0"
                style={{ backgroundColor: displayColor }}
              />
              <span className="text-sm flex-1 truncate">{label.name}</span>
              {onDeleteLabel ? (
                <button
                  type="button"
                  onClick={() => void handleDelete(label.id)}
                  disabled={deletingId === label.id}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all"
                  aria-label="Delete label"
                >
                  {deletingId === label.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MailCommandPalette({
  open,
  onOpenChange,
  onCompose,
  blockRemoteImages,
  blockTrackingPixels,
  onToggleBlockRemoteImages,
  onToggleBlockTrackingPixels,
  mailboxes = [],
  onCreateMailbox,
  onDeleteMailbox,
  onRenameMailbox,
  labels = [],
  onCreateLabel,
  onDeleteLabel,
  initialView,
}: MailCommandPaletteProps) {
  const [navHistory, setNavHistory] = useState<MailPaletteView[]>(["main"]);
  const currentView = navHistory[navHistory.length - 1] ?? "main";
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [passkeyAddMode, setPasskeyAddMode] = useState(false);

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
  const linkedAccounts = useMemo(
    () => accountsQuery.data ?? [],
    [accountsQuery.data],
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
    setSelectedIndex(0);
    setNavHistory((h) => [...h, next]);
  }, []);

  const goBack = useCallback(() => {
    setQuery("");
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
        setSelectedIndex(0);
        setPasskeyAddMode(false);
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

  const allItems = useMemo<PaletteItem[]>(
    () => [
      {
        id: "compose",
        label: "Compose",
        icon: SquarePen,
        description: "Write a new message",
      },
      {
        id: "mailboxes",
        label: "Mailboxes",
        icon: Inbox,
        description: "Create, edit, and delete mailboxes",
      },
      {
        id: "labels",
        label: "Labels",
        icon: Tag,
        description: "Manage message labels",
      },
      ...getBaseSettingsNavigationItems({
        timezone: settings?.timezone,
      }).map((item) => ({
        id: item.id,
        label: item.label,
        icon: item.icon,
        description: item.description,
      })),
    ],
    [settings?.timezone],
  );

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q),
    );
  }, [allItems, query]);

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (currentView !== "main") return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const item = items[selectedIndex];
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
            minHeight: "clamp(240px, 40svh, 360px)",
            maxHeight: "calc(100dvh - 200px)",
          }}
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 shrink-0">
            <Search className="size-4 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="Search or jump to…"
              value={query}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              className="flex-1 h-8 bg-transparent border-0 ring-0 focus:ring-0 focus:border-0 focus:outline-none rounded-none px-0 text-sm placeholder:text-muted-foreground/60"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="p-1 rounded hover:bg-muted/50 transition-colors"
              >
                <X className="size-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {items.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No results found.
              </div>
            ) : (
              <div className="px-2">
                {items.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item)}
                    className={`flex items-center gap-3 p-2 sm:py-1.5 min-h-[44px] w-full rounded-md text-left focus:outline-none transition-colors group ${index === selectedIndex ? "bg-accent/50" : "hover:bg-accent/50"}`}
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
                ))}
              </div>
            )}
          </div>
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
      );
    }

    if (currentView === "appearance") {
      const themeOptions = [
        { value: "light", icon: Sun, label: "Light", color: "text-amber-500" },
        { value: "dark", icon: Moon, label: "Dark", color: "text-slate-400" },
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
          <div className="flex items-center gap-2 px-3 h-12 border-b border-border/50 shrink-0">
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
          <div className="flex items-center gap-2 px-3 h-12 border-b border-border/50 shrink-0">
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
            <div className="px-1 pb-1 pt-3 border-t border-border/40 mt-1">
              <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase px-2">
                Images &amp; Privacy
              </span>
            </div>
            <SettingToggleRow
              icon={EyeOff}
              label="Block remote images"
              description="Prevent external images from loading"
              checked={blockRemoteImages}
              onToggle={onToggleBlockRemoteImages}
            />
            <SettingToggleRow
              icon={ShieldOff}
              label="Block tracking pixels"
              description="Remove 1×1 invisible tracker images"
              checked={blockTrackingPixels}
              onToggle={onToggleBlockTrackingPixels}
            />
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
      currentView === "mailboxes" ||
      currentView === "mailbox-create" ||
      currentView === "mailbox-edit"
    ) {
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
          onDeleteLabel={onDeleteLabel}
        />
      );
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
        <VisuallyHidden>
          <DialogTitle>Mail</DialogTitle>
        </VisuallyHidden>
        <TransitionContainer viewKey={currentView}>
          {renderContent()}
        </TransitionContainer>
      </DialogContent>
    </Dialog>
  );
}
