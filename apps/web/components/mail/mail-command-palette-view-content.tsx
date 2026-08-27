"use client";

import {
  ArrowLeft,
  Check,
  ChevronRight,
  Monitor,
  Moon,
  Search,
  Shield,
  Sun,
} from "lucide-react";
import type { UnifiedSearchResult } from "@workspace/calendar-core";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import type { UserSettings } from "@/lib/types/calendar";
import type { JmapEmailMessage, JmapMailbox, LabelDef } from "@/lib/mail/types";
import { AccountSettings } from "../command-palette/account-settings";
import { InviteSettings } from "../command-palette/invite-settings";
import { NotificationSettings } from "../command-palette/notification-settings";
import { PasswordSection } from "../command-palette/password-section";
import { PrivateSearchIndexToggle } from "../command-palette/private-search-index-toggle";
import { TimeRegionSettings } from "../command-palette/time-region-settings";
import { UnifiedSearchResults } from "../command-palette/unified-search-results";
import { PasskeySettings } from "@/components/passkey-settings";
import { ComposeSettingsPanel } from "./compose-settings-panel";
import { ContactsSettingsPanel } from "./contacts-settings-panel";
import type { MailPaletteItem } from "./mail-command-palette-items";
import type { MailPaletteView } from "./mail-command-palette-ui-state";
import { MailDisplaySettingsPanel } from "./mail-display-settings-panel";
import { MailListSettingsPanel } from "./mail-list-settings-panel";
import { MailSettingsHub } from "./mail-settings-hub";
import { MailboxManager } from "./mailbox-manager";
import { LabelPickerPanel } from "./label-picker-panel";

type PrivateSearchIndexControls = {
  enabled: boolean;
  enable: () => void;
  disable: () => void;
};

type PasswordValues = {
  currentPassword: string;
  newPassword: string;
};

type NewPasswordValues = {
  newPassword: string;
};

export type MailCommandPaletteViewContentProps = {
  open: boolean;
  currentView: MailPaletteView;
  query: string;
  onQueryChange: (query: string) => void;
  selectedIndex: number;
  showUnifiedSearch: boolean;
  unifiedResults: UnifiedSearchResult<JmapEmailMessage>[];
  unifiedSearchLoading: boolean;
  mainListItems: MailPaletteItem[];
  onSelectItem: (item: MailPaletteItem) => void;
  onSelectUnifiedResult: (
    result: UnifiedSearchResult<JmapEmailMessage>,
  ) => void;
  goBack: () => void;
  goForward: (
    view: MailPaletteView,
    options?: { passkeyAddMode?: boolean },
  ) => void;
  localSettings: UserSettings | null;
  updateSetting: <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K],
  ) => Promise<void>;
  passkeyAddMode: boolean;
  privateSearchIndex: PrivateSearchIndexControls;
  sessionName?: string | null;
  sessionEmail?: string | null;
  accountImage: string | null;
  sessionLoading: boolean;
  deletingAccount: boolean;
  changingPassword: boolean;
  settingPassword: boolean;
  resettingEncryptionPassword: boolean;
  updatingProfile: boolean;
  hasPasswordAccount: boolean;
  hasOAuthAccount: boolean;
  handleDeleteAccount: () => void;
  handleChangePassword: (values: PasswordValues) => Promise<void>;
  handleSetPassword: (values: NewPasswordValues) => Promise<void>;
  handleResetEncryptionPassword: (values: NewPasswordValues) => Promise<void>;
  handleUpdateProfile: (values: {
    name?: string;
    imageUrl?: string;
  }) => Promise<void>;
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
};

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
          className="cursor-pointer p-1 rounded hover:bg-muted/50 transition-colors"
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

function MailAppearanceView({
  goBack,
  localSettings,
  updateSetting,
}: {
  goBack: () => void;
  localSettings: UserSettings | null;
  updateSetting: <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K],
  ) => Promise<void>;
}) {
  const themeOptions = [
    { value: "light" as const, icon: Sun, label: "Light", color: "text-amber-500" },
    { value: "dark" as const, icon: Moon, label: "Dark", color: "text-muted-foreground" },
    {
      value: "system" as const,
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
          className="cursor-pointer p-1 rounded hover:bg-muted/50 transition-colors"
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
            onClick={() => void updateSetting("theme", item.value)}
            className="flex cursor-pointer items-center gap-3 p-2 w-full rounded-md text-left hover:bg-accent/50 focus:bg-accent/50 focus:outline-none transition-colors"
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

function MailSecurityView({
  goBack,
  goForward,
  privateSearchIndex,
  hasPasswordAccount,
  hasOAuthAccount,
  changingPassword,
  settingPassword,
  resettingEncryptionPassword,
  handleChangePassword,
  handleSetPassword,
  handleResetEncryptionPassword,
}: {
  goBack: () => void;
  goForward: (
    view: MailPaletteView,
    options?: { passkeyAddMode?: boolean },
  ) => void;
  privateSearchIndex: PrivateSearchIndexControls;
  hasPasswordAccount: boolean;
  hasOAuthAccount: boolean;
  changingPassword: boolean;
  settingPassword: boolean;
  resettingEncryptionPassword: boolean;
  handleChangePassword: (values: PasswordValues) => Promise<void>;
  handleSetPassword: (values: NewPasswordValues) => Promise<void>;
  handleResetEncryptionPassword: (values: NewPasswordValues) => Promise<void>;
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
          className="cursor-pointer p-1 rounded hover:bg-muted/50 transition-colors"
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
          onClick={() => goForward("passkeys", { passkeyAddMode: false })}
          className="flex cursor-pointer items-center gap-3 p-2 w-full rounded-md text-left hover:bg-accent/50 focus:bg-accent/50 focus:outline-none transition-colors group"
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
            Search
          </span>
        </div>
        <PrivateSearchIndexToggle
          enabled={privateSearchIndex.enabled}
          onToggle={
            privateSearchIndex.enabled
              ? privateSearchIndex.disable
              : privateSearchIndex.enable
          }
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

function MailMainView({
  query,
  onQueryChange,
  selectedIndex,
  showUnifiedSearch,
  unifiedResults,
  unifiedSearchLoading,
  mainListItems,
  onSelectItem,
  onSelectUnifiedResult,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  selectedIndex: number;
  showUnifiedSearch: boolean;
  unifiedResults: UnifiedSearchResult<JmapEmailMessage>[];
  unifiedSearchLoading: boolean;
  mainListItems: MailPaletteItem[];
  onSelectItem: (item: MailPaletteItem) => void;
  onSelectUnifiedResult: (
    result: UnifiedSearchResult<JmapEmailMessage>,
  ) => void;
}) {
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
          onChange={(e) => onQueryChange(e.target.value)}
          className="flex-1 h-8 bg-transparent border-0 ring-0 focus:ring-0 focus:border-0 focus:outline-none rounded-none px-0 text-sm placeholder:text-muted-foreground/60"
        />
        {query && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onQueryChange("")}
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
            onSelect={onSelectUnifiedResult}
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
                  onClick={() => onSelectItem(item)}
                  data-index={globalIndex}
                  className={`flex cursor-pointer items-center gap-3 p-2 sm:py-1.5 min-h-[44px] w-full rounded-md text-left focus:outline-none transition-colors group ${globalIndex === selectedIndex ? "bg-accent/50" : "hover:bg-accent/50"}`}
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function MailCommandPaletteViewContent(
  props: MailCommandPaletteViewContentProps,
) {
  const {
    open,
    currentView,
    goBack,
    goForward,
    localSettings,
    updateSetting,
  } = props;

  if (currentView === "main") {
    return (
      <MailMainView
        query={props.query}
        onQueryChange={props.onQueryChange}
        selectedIndex={props.selectedIndex}
        showUnifiedSearch={props.showUnifiedSearch}
        unifiedResults={props.unifiedResults}
        unifiedSearchLoading={props.unifiedSearchLoading}
        mainListItems={props.mainListItems}
        onSelectItem={props.onSelectItem}
        onSelectUnifiedResult={props.onSelectUnifiedResult}
      />
    );
  }

  if (currentView === "appearance") {
    return (
      <MailAppearanceView
        goBack={goBack}
        localSettings={localSettings}
        updateSetting={updateSetting}
      />
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
          goForward={(view) => goForward(view as MailPaletteView)}
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
      <MailSecurityView
        goBack={goBack}
        goForward={goForward}
        privateSearchIndex={props.privateSearchIndex}
        hasPasswordAccount={props.hasPasswordAccount}
        hasOAuthAccount={props.hasOAuthAccount}
        changingPassword={props.changingPassword}
        settingPassword={props.settingPassword}
        resettingEncryptionPassword={props.resettingEncryptionPassword}
        handleChangePassword={props.handleChangePassword}
        handleSetPassword={props.handleSetPassword}
        handleResetEncryptionPassword={props.handleResetEncryptionPassword}
      />
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
          startInAddMode={props.passkeyAddMode}
        />
      </div>
    );
  }

  if (currentView === "mail-settings") {
    return (
      <MailSettingsHub
        goBack={goBack}
        onNavigate={(view) => goForward(view)}
      />
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
          mailboxes={props.mailboxes}
          currentView={currentView}
          onBack={goBack}
          onNavigateTo={(view) => goForward(view as MailPaletteView)}
          onCreateMailbox={props.onCreateMailbox ?? (() => Promise.resolve())}
          onDeleteMailbox={props.onDeleteMailbox ?? (() => Promise.resolve())}
          onRenameMailbox={props.onRenameMailbox}
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
        deletingAccount={props.deletingAccount}
        handleDeleteAccount={props.handleDeleteAccount}
        accountName={props.sessionName}
        accountEmail={props.sessionEmail}
        accountImage={props.accountImage}
        sessionLoading={props.sessionLoading}
        changingPassword={props.changingPassword}
        settingPassword={props.settingPassword}
        resettingEncryptionPassword={props.resettingEncryptionPassword}
        hasPasswordAccount={props.hasPasswordAccount}
        hasOAuthAccount={props.hasOAuthAccount}
        handleChangePassword={props.handleChangePassword}
        handleSetPassword={props.handleSetPassword}
        handleResetEncryptionPassword={props.handleResetEncryptionPassword}
        updatingProfile={props.updatingProfile}
        handleUpdateProfile={props.handleUpdateProfile}
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
        labels={props.labels}
        onCreateLabel={props.onCreateLabel}
        onUpdateLabel={props.onUpdateLabel}
        onDeleteLabel={props.onDeleteLabel}
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
}
