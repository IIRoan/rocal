"use client";

import { Check, Monitor, Moon, Shield, Sun } from "lucide-react";
import type { UnifiedSearchResult } from "@workspace/calendar-core";
import type { UserSettings } from "@/lib/types/calendar";
import type { JmapEmailMessage, JmapMailbox, LabelDef } from "@/lib/mail/types";
import { AccountSettings } from "../command-palette/account-settings";
import { InviteSettings } from "../command-palette/invite-settings";
import { NotificationSettings } from "../command-palette/notification-settings";
import { PasswordSection } from "../command-palette/password-section";
import { PrivateSearchIndexToggle } from "../command-palette/private-search-index-toggle";
import { TimeRegionSettings } from "../command-palette/time-region-settings";
import { PasskeySettings } from "@/components/passkey-settings";
import { ComposeSettingsPanel } from "./compose-settings-panel";
import { ContactsSettingsPanel } from "./contacts-settings-panel";
import type { MailPaletteItem } from "./mail-command-palette-items";
import type { MailPaletteView } from "./mail-command-palette-ui-state";
import { MailDisplaySettingsPanel } from "./mail-display-settings-panel";
import { MailListSettingsPanel } from "./mail-list-settings-panel";
import { MailSettingsHub } from "./mail-settings-hub";
import { MailboxManager } from "./mailbox-manager";
import { LabelManager } from "./label-manager";
import { MailCommandPaletteMainView } from "./mail-command-palette-main-view";
import {
  PaletteNavRow,
  PaletteSection,
  PaletteView,
} from "../command-palette/palette-ui";

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
    { value: "light" as const, icon: Sun, label: "Light" },
    { value: "dark" as const, icon: Moon, label: "Dark" },
    { value: "system" as const, icon: Monitor, label: "System" },
  ];

  return (
    <PaletteView title="Appearance" onBack={goBack}>
      <PaletteSection label="Theme">
        {themeOptions.map((item) => (
          <PaletteNavRow
            key={item.value}
            icon={item.icon}
            label={item.label}
            onClick={() => void updateSetting("theme", item.value)}
            trailing={
              localSettings?.theme === item.value ? (
                <Check className="size-4 shrink-0 text-foreground" />
              ) : null
            }
          />
        ))}
      </PaletteSection>
    </PaletteView>
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
    <PaletteView title="Security" onBack={goBack}>
      <PaletteSection label="Authentication">
        <PaletteNavRow
          icon={Shield}
          label="Passkeys"
          description="Manage passwordless authentication"
          onClick={() => goForward("passkeys", { passkeyAddMode: false })}
        />
      </PaletteSection>
      <PaletteSection label="Search">
        <PrivateSearchIndexToggle
          enabled={privateSearchIndex.enabled}
          onToggle={
            privateSearchIndex.enabled
              ? privateSearchIndex.disable
              : privateSearchIndex.enable
          }
        />
      </PaletteSection>
      <PaletteSection label="Password">
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
      </PaletteSection>
    </PaletteView>
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
      <MailCommandPaletteMainView
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
      <TimeRegionSettings
        localSettings={localSettings}
        updateSetting={updateSetting}
        goBack={goBack}
        goForward={(view) => goForward(view as MailPaletteView)}
        currentView={currentView}
      />
    );
  }

  if (currentView === "notifications") {
    if (!localSettings) return null;
    return (
      <NotificationSettings
        localSettings={localSettings}
        updateSetting={updateSetting}
        goBack={goBack}
      />
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
      <PasskeySettings
        open={open}
        onBack={goBack}
        startInAddMode={props.passkeyAddMode}
      />
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
      <MailboxManager
        mailboxes={props.mailboxes}
        currentView={currentView}
        onBack={goBack}
        onNavigateTo={(view) => goForward(view as MailPaletteView)}
        onCreateMailbox={props.onCreateMailbox ?? (() => Promise.resolve())}
        onDeleteMailbox={props.onDeleteMailbox ?? (() => Promise.resolve())}
        onRenameMailbox={props.onRenameMailbox}
      />
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

  if (
    currentView === "labels" ||
    currentView === "label-create" ||
    currentView === "label-edit"
  ) {
    return (
      <LabelManager
        labels={props.labels}
        currentView={currentView}
        onBack={goBack}
        onNavigateTo={goForward}
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
