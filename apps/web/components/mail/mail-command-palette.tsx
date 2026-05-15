"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  X,
  ChevronRight,
  ArrowLeft,
  SquarePen,
  User,
  EyeOff,
  ShieldOff,
  Sun,
  Moon,
  Monitor,
  Check,
  Palette,
  Globe,
  Bell,
  Shield,
  Inbox,
  Users,
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
import { SettingToggleRow } from "../command-palette/setting-toggle-row";
import { TimeRegionSettings } from "../command-palette/time-region-settings";
import { TransitionContainer } from "../command-palette/transition-container";
import { InviteSettings } from "../command-palette/invite-settings";
import { PasskeySettings } from "@/components/passkey-settings";
import { MailboxManager } from "./mailbox-manager";
import type { JmapMailbox } from "@/lib/mail/types";
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
  | "invites";

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
  initialView?: string;
}

const log = createLogger("mail-command-palette");

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
  initialView,
}: MailCommandPaletteProps) {
  const [navHistory, setNavHistory] = useState<MailPaletteView[]>(["main"]);
  const currentView = navHistory[navHistory.length - 1] ?? "main";
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [passkeyAddMode, setPasskeyAddMode] = useState(false);

  const { data: session, isPending: sessionLoading } = useSession();
  const { settings, updateSettings } = useSettings();
  const [localSettings, setLocalSettings] = useState<UserSettings | null>(null);

  useEffect(() => {
    if (settings) setLocalSettings(settings);
  }, [settings]);

  const updateSetting = useCallback(
    async <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
      if (!localSettings) return;
      const next = { ...localSettings, [key]: value };
      setLocalSettings(next);
      try {
        await updateSettings({ [key]: value } as Parameters<typeof updateSettings>[0]);
      } catch {
        setLocalSettings(localSettings);
      }
    },
    [localSettings, updateSettings],
  );

  const queryClient = useQueryClient();
  const accountsQuery = useQuery({
    queryKey: ["auth", "accounts", session?.user?.id ?? null],
    queryFn: async () => {
      if (typeof authClient.listAccounts !== "function") return [];
      return extractLinkedAuthAccounts(await authClient.listAccounts());
    },
    enabled:
      Boolean(session?.user?.id) &&
      typeof authClient.listAccounts === "function",
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
      setNavHistory(["main"]);
      setQuery("");
      setSelectedIndex(0);
      setPasskeyAddMode(false);
    } else if (initialView) {
      setNavHistory([initialView as MailPaletteView]);
    }
  }, [open, initialView]);

  const handleDeleteAccount = useCallback(async () => {
    setDeletingAccount(true);
    try {
      await calendarApiService.deleteAccount();
      queryClient.clear();
      try { await signOut(); } catch {}
      onOpenChange(false);
      window.location.href = "/";
    } catch (err) {
      log.error("Failed to delete account:", err);
    } finally {
      setDeletingAccount(false);
    }
  }, [onOpenChange, queryClient]);

  const handleChangePassword = useCallback(
    async ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) => {
      setChangingPassword(true);
      try {
        const result = await authClient.changePassword({ currentPassword, newPassword });
        if (result?.error) throw new Error(result.error.message || "Unable to update your password.");
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
        if (result?.error) throw new Error(result.error.message || "Unable to set your password.");
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
      if (!session?.user?.id) throw new Error("Your session is unavailable. Please try again.");
      setResettingEncryptionPassword(true);
      try {
        const stored = await resetEncryptionPasswordForActiveSession(session.user.id, newPassword);
        if (!stored) throw new Error("Unlock your encrypted data on this device first, then try again.");
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
        const result = await authClient.updateUser({ image: imageUrl ?? null });
        if (result?.error) throw new Error(result.error.message || "Unable to update your profile.");
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
      { id: "compose", label: "Compose", icon: SquarePen, description: "Write a new message" },
      { id: "mailboxes", label: "Mailboxes", icon: Inbox, description: "Create, edit, and delete mailboxes" },
      { id: "appearance", label: "Appearance", icon: Palette, description: "Theme and display" },
      { id: "time-region", label: "Time & Region", icon: Globe, description: settings?.timezone ?? "Timezone, time format" },
      { id: "notifications", label: "Notifications", icon: Bell, description: "Email alerts" },
      { id: "security", label: "Security", icon: Shield, description: "Passkeys & authentication" },
      { id: "account", label: "Account", icon: User, description: "Manage your account" },
      { id: "invites", label: "Invites", icon: Users, description: "Invite friends to join Solace" },
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
      if (item) { e.preventDefault(); handleSelect(item); }
    }
  };

  const renderContent = () => {
    if (currentView === "main") {
      return (
        <div
          className="flex flex-col"
          style={{ minHeight: "clamp(240px, 40svh, 360px)", maxHeight: "calc(100dvh - 200px)" }}
        >
          <div className="flex items-center gap-2 p-3 sm:py-2 border-b border-border/50 shrink-0">
            <Search className="size-4 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="Search or jump to…"
              value={query}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
              className="flex-1 h-8 bg-transparent border-0 ring-0 focus:ring-0 focus:border-0 focus:outline-none rounded-none px-0 text-sm placeholder:text-muted-foreground/60"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="p-1 rounded hover:bg-muted/50 transition-colors">
                <X className="size-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {items.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">No results found.</div>
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
                    <span className="text-sm flex-1 truncate">{item.label}</span>
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
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">↑↓</kbd>{" "}
              to navigate
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">↵</kbd>{" "}
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
        { value: "system", icon: Monitor, label: "System", color: "text-muted-foreground" },
      ];
      return (
        <div className="flex flex-col" style={{ minHeight: "240px", maxHeight: "calc(100dvh - 200px)" }}>
          <div className="flex items-center gap-2 px-3 h-12 border-b border-border/50 shrink-0">
            <button type="button" onClick={goBack} className="p-1 rounded hover:bg-muted/50 transition-colors">
              <ArrowLeft className="size-4 text-muted-foreground" />
            </button>
            <span className="text-sm font-medium">Appearance</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <div className="px-1 pb-1">
              <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase px-2">Theme</span>
            </div>
            {themeOptions.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => void updateSetting("theme", item.value as UserSettings["theme"])}
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
        <div className="flex flex-col" style={{ minHeight: "240px", maxHeight: "calc(100dvh - 200px)" }}>
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
        <div className="flex flex-col" style={{ minHeight: "240px", maxHeight: "calc(100dvh - 200px)" }}>
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
        <div className="flex flex-col" style={{ minHeight: "240px", maxHeight: "calc(100dvh - 200px)" }}>
          <div className="flex items-center gap-2 px-3 h-12 border-b border-border/50 shrink-0">
            <button type="button" onClick={goBack} className="p-1 rounded hover:bg-muted/50 transition-colors">
              <ArrowLeft className="size-4 text-muted-foreground" />
            </button>
            <span className="text-sm font-medium">Security</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <div className="px-1 pb-1">
              <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase px-2">Authentication</span>
            </div>
            <button
              type="button"
              onClick={() => { setPasskeyAddMode(false); goForward("passkeys"); }}
              className="flex items-center gap-3 p-2 w-full rounded-md text-left hover:bg-accent/50 focus:bg-accent/50 focus:outline-none transition-colors group"
            >
              <div className="flex items-center justify-center size-6 shrink-0">
                <Shield className="size-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm">Passkeys</div>
                <div className="text-xs text-muted-foreground">Manage passwordless authentication</div>
              </div>
              <ChevronRight className="size-4 text-muted-foreground/40 shrink-0" />
            </button>
            <div className="px-1 pb-1 pt-3 border-t border-border/40 mt-1">
              <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase px-2">Images &amp; Privacy</span>
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
          </div>
        </div>
      );
    }

    if (currentView === "passkeys") {
      return (
        <div className="flex flex-col" style={{ minHeight: "240px", maxHeight: "calc(100dvh - 200px)" }}>
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
        <div className="flex flex-col" style={{ minHeight: "240px", maxHeight: "calc(100dvh - 200px)" }}>
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
        />
      );
    }

    if (currentView === "invites") {
      return <InviteSettings goBack={goBack} />;
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
