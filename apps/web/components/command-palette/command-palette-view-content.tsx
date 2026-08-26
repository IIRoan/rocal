"use client";

import type { CalendarEvent } from "@workspace/ui/components/calendar";
import type { UserSettings } from "@/lib/types/calendar";
import { createDraftCalendarEvent } from "@/lib/calendar-event-drafts";
import { parseWorkingDays } from "@/lib/calendar-view-model";
import type { UseCommandPaletteSearchResult } from "@/hooks/use-command-palette-search";
import { PasskeySettings } from "../passkey-settings";
import { SubscriptionManagement } from "../subscription-management";
import { EventEditor } from "../event-editor";
import { CalendarManager } from "../calendar-manager";
import { AppearanceSettings } from "./appearance-settings";
import { NotificationSettings } from "./notification-settings";
import { TimeRegionSettings } from "./time-region-settings";
import { CalendarDefaultsSettings } from "./calendar-defaults-settings";
import { AccountSettings } from "./account-settings";
import { SecuritySettings } from "./security-settings";
import { InviteSettings } from "./invite-settings";
import type { PaletteView } from "./constants";
import { CommandPaletteMainSearchView } from "./main-search-view";
import { Settings, ArrowLeft } from "lucide-react";
import type { EventEditorMode } from "../command-palette-context";

type CommandPaletteViewContentProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentView: PaletteView;
  localSettings: UserSettings;
  updateSetting: <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K],
  ) => void;
  goBack: () => void;
  goForward: (
    next: PaletteView,
    options?: { preservePasskeyAddMode?: boolean },
  ) => void;
  paletteSearch: UseCommandPaletteSearchResult;
  saving: boolean;
  handleReset: () => void;
  deletingAccount: boolean;
  handleDeleteAccount: () => void;
  accountName?: string | null;
  accountEmail?: string | null;
  accountImage: string | null;
  sessionLoading: boolean;
  changingPassword: boolean;
  settingPassword: boolean;
  resettingEncryptionPassword: boolean;
  hasPasswordAccount: boolean;
  hasOAuthAccount: boolean;
  handleChangePassword: (input: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<void>;
  handleSetPassword: (input: { newPassword: string }) => Promise<void>;
  handleResetEncryptionPassword: (input: {
    newPassword: string;
  }) => Promise<void>;
  updatingProfile: boolean;
  handleUpdateProfile: (input: {
    name?: string;
    imageUrl?: string;
  }) => Promise<void>;
  passkeyAddMode: boolean;
  setSubscriptionEditCalendarId: (calendarId: string | undefined) => void;
  activeSubscriptionEditCalendarId: string | undefined;
  onEventSaved?: () => void;
  eventEditorMode: EventEditorMode;
  popoverAnchorPosition: { x: number; y: number } | null;
  updatePreviewEvent?: (updates: Partial<CalendarEvent>) => void;
  calendars: Array<{ id: string }> | undefined;
};

export function CommandPaletteViewContent({
  open,
  onOpenChange,
  currentView,
  localSettings,
  updateSetting,
  goBack,
  goForward,
  paletteSearch,
  saving,
  handleReset,
  deletingAccount,
  handleDeleteAccount,
  accountName,
  accountEmail,
  accountImage,
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
  passkeyAddMode,
  setSubscriptionEditCalendarId,
  activeSubscriptionEditCalendarId,
  onEventSaved,
  eventEditorMode,
  popoverAnchorPosition,
  updatePreviewEvent,
  calendars,
}: CommandPaletteViewContentProps) {
  const workingDaysList = parseWorkingDays(localSettings.workingDays);

  if (currentView === "main" || currentView === "search") {
    return <CommandPaletteMainSearchView search={paletteSearch} />;
  }

  if (currentView === "appearance") {
    return (
      <AppearanceSettings
        localSettings={localSettings}
        updateSetting={updateSetting}
        goBack={goBack}
      />
    );
  }

  if (currentView === "notifications") {
    return (
      <NotificationSettings
        localSettings={localSettings}
        updateSetting={updateSetting}
        goBack={goBack}
      />
    );
  }

  if (currentView === "time-region" || currentView === "timezone") {
    return (
      <TimeRegionSettings
        localSettings={localSettings}
        updateSetting={updateSetting}
        goBack={goBack}
        goForward={goForward}
        currentView={currentView}
      />
    );
  }

  if (currentView === "calendar-defaults") {
    return (
      <CalendarDefaultsSettings
        localSettings={localSettings}
        updateSetting={updateSetting}
        goBack={goBack}
        workingDaysList={workingDaysList}
      />
    );
  }

  if (currentView === "account") {
    return (
      <AccountSettings
        goBack={goBack}
        saving={saving}
        handleReset={handleReset}
        deletingAccount={deletingAccount}
        handleDeleteAccount={handleDeleteAccount}
        accountName={accountName}
        accountEmail={accountEmail}
        accountImage={accountImage}
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

  if (currentView === "security") {
    return (
      <SecuritySettings
        localSettings={localSettings}
        updateSetting={updateSetting}
        goBack={goBack}
        goForward={goForward}
        hasPasswordAccount={hasPasswordAccount}
        hasOAuthAccount={hasOAuthAccount}
        changingPassword={changingPassword}
        settingPassword={settingPassword}
        resettingEncryptionPassword={resettingEncryptionPassword}
        handleChangePassword={handleChangePassword}
        handleSetPassword={handleSetPassword}
        handleResetEncryptionPassword={handleResetEncryptionPassword}
      />
    );
  }

  if (currentView === "passkeys") {
    return (
      <PasskeySettings
        open={open}
        onBack={() => goBack()}
        startInAddMode={passkeyAddMode}
      />
    );
  }

  if (currentView === "invites") {
    return <InviteSettings goBack={goBack} />;
  }

  if (
    currentView === "calendars" ||
    currentView === "calendar-create" ||
    currentView === "calendar-edit"
  ) {
    return (
      <CalendarManager
        onBack={goBack}
        onGoToSubscriptions={(calendarId?: string) => {
          setSubscriptionEditCalendarId(calendarId);
          if (calendarId) {
            goForward("subscriptions-edit");
          } else {
            goForward("subscriptions");
          }
        }}
        currentView={currentView}
        onNavigateTo={goForward}
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
        open={open}
        onBack={goBack}
        currentView={currentView}
        onNavigateTo={goForward}
        initialEditCalendarId={activeSubscriptionEditCalendarId}
      />
    );
  }

  if (currentView === "events") {
    const newEvent = createDraftCalendarEvent({
      defaultCalendarId: localSettings.defaultCalendarId,
      fallbackCalendarId: calendars?.[0]?.id,
    });
    return (
      <EventEditor
        open={open}
        onOpenChange={onOpenChange}
        eventToEdit={newEvent}
        onEventSaved={onEventSaved}
        onBack={() => goBack()}
        localSettings={localSettings}
        editorMode={eventEditorMode}
        anchorPosition={popoverAnchorPosition}
        updatePreviewEvent={updatePreviewEvent}
        showBackButton
      />
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
        <button
          type="button"
          onClick={() => goBack()}
          className="p-1 rounded hover:bg-muted/50 transition-colors cursor-pointer"
          aria-label="Back"
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
