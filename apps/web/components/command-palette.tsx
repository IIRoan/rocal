"use client";

import React, { useState, useEffect } from "react";
import { useSettings } from "@/hooks/use-settings";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import type { CalendarEvent } from "@workspace/ui/components/calendar/types";
import type { UserSettings, UpdateSettingsRequest } from "@/lib/types/calendar";
import { PasskeySettings } from "./passkey-settings";
import { SubscriptionManagement } from "./subscription-management";
import { EventEditor } from "./event-editor";
import { CalendarManager } from "./calendar-manager";
import {
  AppearanceSettings,
  NotificationSettings,
  TimeRegionSettings,
  CalendarDefaultsSettings,
  AccountSettings,
  SecuritySettings,
  type PaletteView,
  TransitionContainer,
  NAVIGATION_ITEMS,
  resetEventForm,
} from "./command-palette/index";

import {
  CommandDialog,
  CommandList,
  CommandGroup,
  CommandItem,
} from "@workspace/ui/components/navigation/command";
import { Button } from "@workspace/ui/components/ui/button";
import {
  Settings,
  RefreshCw,
  ArrowLeft,
  Plus,
  ChevronRight,
} from "lucide-react";
import { useNumberedShortcuts } from "@workspace/ui/hooks";

import type { EventEditorMode } from "./command-palette-context";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventToEdit?: CalendarEvent | null;
  onEventSaved?: () => void;
  initialView?: string;
  eventEditorMode?: EventEditorMode;
  popoverAnchorPosition?: { x: number; y: number } | null;
  previewEvent?: CalendarEvent | null;
  updatePreviewEvent?: (updates: Partial<CalendarEvent>) => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  eventToEdit,
  onEventSaved,
  initialView = "main",
  eventEditorMode = "modal",
  popoverAnchorPosition = null,
  previewEvent = null,
  updatePreviewEvent,
}: CommandPaletteProps) {
  const calendarData = useSharedCalendarData();
  const { calendars } = calendarData;
  const { settings, loading, updateSettings, resetSettings } = useSettings();

  const [currentView, setCurrentView] = useState<PaletteView>(
    initialView as PaletteView
  );
  const [transitionDirection, setTransitionDirection] = useState<
    "forward" | "back"
  >("forward");

  const goForward = (next: PaletteView) => {
    setTransitionDirection("forward");
    setCurrentView(next);
  };

  const goBack = (prev: PaletteView) => {
    setTransitionDirection("back");
    setCurrentView(prev);
  };

  const [localSettings, setLocalSettings] = useState<UserSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) setLocalSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!open) {
      setCurrentView(initialView as PaletteView);
    }
  }, [open, initialView]);

  useEffect(() => {
    if (open) {
      setCurrentView(initialView as PaletteView);
    }
  }, [initialView, open]);

  // Add keyboard shortcuts for navigation items (Ctrl+1 through Ctrl+8) - always at top level
  useNumberedShortcuts(
    NAVIGATION_ITEMS.map((item) => () => goForward(item.id as PaletteView)),
    open && currentView === "main"
  );

  const updateSetting = async <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K]
  ) => {
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
        defaultReminder: newSettings.defaultReminder,
        defaultEventDuration: newSettings.defaultEventDuration,
        defaultCalendarId: newSettings.defaultCalendarId,
        compactView: newSettings.compactView,
        showWeekNumbers: newSettings.showWeekNumbers,
        showDeclinedEvents: newSettings.showDeclinedEvents,
      };

      await updateSettings(updateData);
    } catch (err: any) {
      console.error("Failed to save settings:", err);
      setLocalSettings(localSettings);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      await resetSettings();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Failed to reset settings:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !localSettings) {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <TransitionContainer direction={transitionDirection}>
          <div className="flex items-center justify-center min-h-[300px]">
            <div className="text-center">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Loading settings...
              </p>
            </div>
          </div>
        </TransitionContainer>
      </CommandDialog>
    );
  }

  const workingDaysList = JSON.parse(localSettings.workingDays) as number[];

  // Event editor
  if (currentView === "event-editor") {
    return (
      <EventEditor
        open={open}
        onOpenChange={onOpenChange}
        eventToEdit={eventToEdit}
        onEventSaved={onEventSaved}
        onBack={() => goBack("events")}
        localSettings={localSettings}
        editorMode={eventEditorMode}
        anchorPosition={popoverAnchorPosition}
        updatePreviewEvent={updatePreviewEvent}
      />
    );
  }

  // Calendar management
  if (currentView === "calendars" || currentView === "calendar-create" || currentView === "calendar-edit") {
    return (
      <CalendarManager
        open={open}
        onOpenChange={onOpenChange}
        onBack={() => goBack("main")}
        onGoToSubscriptions={() => goForward("subscriptions")}
        currentView={currentView}
        onViewChange={setCurrentView}
        transitionDirection={transitionDirection}
      />
    );
  }

  if (currentView === "main") {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <TransitionContainer direction={transitionDirection}>
          <div className="bg-card/50 border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold text-foreground">Settings</h2>
          </div>
          <CommandList>
            <CommandGroup heading="Categories">
              {NAVIGATION_ITEMS.map((item, index) => (
                <CommandItem
                  key={item.id}
                  onSelect={() => goForward(item.id as PaletteView)}
                  className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30 border-b border-border/30 last:border-b-0"
                >
                  <item.icon className="mr-3 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">
                      {item.label}
                    </span>
                    <span className="text-xs text-muted-foreground/80">
                      {item.description}
                    </span>
                  </div>
                  <kbd className="ml-auto mr-2 inline-flex h-5 max-h-full items-center rounded border bg-background px-1 font-[inherit] text-[0.625rem] font-medium text-muted-foreground/70">
                    ⌘+{index + 1}
                  </kbd>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </TransitionContainer>
      </CommandDialog>
    );
  }

  if (currentView === "appearance") {
    return (
      <AppearanceSettings
        open={open}
        onOpenChange={onOpenChange}
        localSettings={localSettings}
        updateSetting={updateSetting}
        goBack={goBack}
        TransitionContainer={TransitionContainer}
        transitionDirection={transitionDirection}
      />
    );
  }

  if (currentView === "notifications") {
    return (
      <NotificationSettings
        open={open}
        onOpenChange={onOpenChange}
        localSettings={localSettings}
        updateSetting={updateSetting}
        goBack={goBack}
        TransitionContainer={TransitionContainer}
        transitionDirection={transitionDirection}
      />
    );
  }

  if (currentView === "time-region" || currentView === "timezone") {
    return (
      <TimeRegionSettings
        open={open}
        onOpenChange={onOpenChange}
        localSettings={localSettings}
        updateSetting={updateSetting}
        goBack={goBack}
        goForward={goForward}
        currentView={currentView}
        TransitionContainer={TransitionContainer}
        transitionDirection={transitionDirection}
      />
    );
  }

  if (currentView === "calendar-defaults") {
    return (
      <CalendarDefaultsSettings
        open={open}
        onOpenChange={onOpenChange}
        localSettings={localSettings}
        updateSetting={updateSetting}
        goBack={goBack}
        workingDaysList={workingDaysList}
        TransitionContainer={TransitionContainer}
        transitionDirection={transitionDirection}
      />
    );
  }

  if (currentView === "account") {
    return (
      <AccountSettings
        open={open}
        onOpenChange={onOpenChange}
        goBack={goBack}
        saving={saving}
        handleReset={handleReset}
        TransitionContainer={TransitionContainer}
        transitionDirection={transitionDirection}
      />
    );
  }

  if (currentView === "security") {
    return (
      <SecuritySettings
        open={open}
        onOpenChange={onOpenChange}
        goBack={goBack}
        goForward={goForward}
        TransitionContainer={TransitionContainer}
        transitionDirection={transitionDirection}
      />
    );
  }

  if (currentView === "passkeys") {
    return (
      <PasskeySettings
        open={open}
        onOpenChange={onOpenChange}
        onBack={() => goBack("security")}
      />
    );
  }

  if (currentView === "subscriptions") {
    return (
      <SubscriptionManagement
        open={open}
        onOpenChange={onOpenChange}
        onBack={() => goBack("calendars")}
      />
    );
  }

  if (currentView === "events") {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <TransitionContainer direction={transitionDirection}>
          <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
            <button
              onClick={() => goBack("main")}
              className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <h2 className="text-lg font-semibold text-foreground">Events</h2>
          </div>
          <CommandList>
            <CommandGroup heading="Actions">
              <CommandItem
                onSelect={() => {
                  resetEventForm(calendars, {
                    setSelectedEvent: () => {},
                    setEventViewMode: () => {},
                    setEventTitle: () => {},
                    setEventDescription: () => {},
                    setEventStartDate: () => {},
                    setEventEndDate: () => {},
                    setEventStartTime: () => {},
                    setEventEndTime: () => {},
                    setEventAllDay: () => {},
                    setEventLocation: () => {},
                    setEventCalendarId: () => {},
                    setEventReminder: () => {},
                    setEventNotifications: () => {},
                  });
                  goForward("event-editor");
                }}
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <Plus className="mr-3 h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">Create New Event</span>
                <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/60" />
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </TransitionContainer>
      </CommandDialog>
    );
  }

  // Other views fallback
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <TransitionContainer direction={transitionDirection}>
        <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => goBack("main")}
            className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <h2 className="text-lg font-semibold text-foreground">Settings</h2>
        </div>
        <CommandList>
          <CommandGroup heading="Status">
            <CommandItem disabled className="px-4 py-3 opacity-60">
              <Settings className="mr-3 h-4 w-4 text-muted-foreground" />
              <span className="text-foreground">
                This section is coming soon
              </span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </TransitionContainer>
    </CommandDialog>
  );
}