"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
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
  SEARCH_INDEX,
  VIEW_LABELS,
  resetEventForm,
} from "./command-palette/index";

import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { VisuallyHidden } from "@workspace/ui/components/ui/visually-hidden";
import {
  Settings,
  RefreshCw,
  ArrowLeft,
  Plus,
  ChevronRight,
  Search,
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
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounce search query to prevent visual shake
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Focus search input when dialog opens
  useEffect(() => {
    if (open && currentView === "main") {
      const frameId = requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
      return () => cancelAnimationFrame(frameId);
    }
  }, [open, currentView]);

  const goForward = (next: PaletteView) => {
    setTransitionDirection("forward");
    setSearchQuery("");
    setCurrentView(next);
  };

  const goBack = (prev: PaletteView) => {
    setTransitionDirection("back");
    setSearchQuery("");
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
      setSearchQuery("");
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

  // Filter search items based on debounced search query (stable results, no shake)
  const filteredItems = useMemo(() => {
    if (!debouncedQuery.trim()) return NAVIGATION_ITEMS;
    const query = debouncedQuery.toLowerCase();
    return SEARCH_INDEX.filter((item) => {
      const labelMatch = item.label.toLowerCase().includes(query);
      const descriptionMatch = item.description.toLowerCase().includes(query);
      const keywordsMatch = item.keywords?.some(k => k.includes(query));
      return labelMatch || descriptionMatch || keywordsMatch;
    });
  }, [debouncedQuery]);

  if (loading || !localSettings) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          variant="spotlight"
          showClose={false}
          className="overflow-hidden p-0 bg-popover border-border/50 shadow-2xl"
        >
          <VisuallyHidden>
            <DialogTitle>Loading Settings</DialogTitle>
          </VisuallyHidden>
          <div className="flex items-center justify-center min-h-[200px]">
            <div className="text-center">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Loading...
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          variant="spotlight"
          showClose={false}
          className="overflow-hidden p-0 bg-popover border-border/50 shadow-2xl w-[480px] max-w-[calc(100dvw-2rem)]"
        >
          <VisuallyHidden>
            <DialogTitle>Command Palette</DialogTitle>
          </VisuallyHidden>
          <TransitionContainer direction={transitionDirection} viewKey={currentView}>
            <div className="flex flex-col h-[420px]">
              {/* Search Header */}
              <div className="flex items-center gap-3 px-4 border-b border-border/50 shrink-0 h-12">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search settings..."
                  value={searchQuery}
                  onChange={(e) => {
                    e.stopPropagation();
                    setSearchQuery(e.target.value);
                  }}
                  onFocus={(e) => e.stopPropagation()}
                  onBlur={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 h-auto py-3 bg-transparent border-0 ring-0 focus:ring-0 focus:border-0 focus:outline-none rounded-none px-0"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                />
              </div>
              {/* Results List */}
              <div className="flex-1 overflow-y-auto min-h-0">
                {filteredItems.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No results found.
                  </div>
                ) : (
                  <div className="p-1">
                    {(() => {
                      // Group items by parent for tree structure
                      const mainItems = filteredItems.filter(item => !('parentLabel' in item && item.parentLabel));
                      const subItems = filteredItems.filter(item => 'parentLabel' in item && item.parentLabel);
                      
                      // Group sub-items by their target view
                      const subItemsByParent = new Map<string, typeof subItems>();
                      subItems.forEach(item => {
                        const view = item.targetView;
                        if (!subItemsByParent.has(view)) {
                          subItemsByParent.set(view, []);
                        }
                        subItemsByParent.get(view)!.push(item);
                      });

                      return mainItems.map((item) => {
                        const children = subItemsByParent.get(item.targetView) || [];
                        return (
                          <div key={item.id}>
                            <button
                              type="button"
                              onClick={() => goForward(item.targetView as PaletteView)}
                              className="flex items-center gap-3 px-3 py-2.5 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
                            >
                              <item.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-foreground">
                                  {item.label}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {item.description}
                                </div>
                              </div>
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                            </button>
                            {/* Child items with tree structure */}
                            {children.length > 0 && (
                              <div className="ml-4 pl-4 border-l border-border/30">
                                {children.map((child) => (
                                  <button
                                    key={child.id}
                                    type="button"
                                    onClick={() => goForward(child.targetView as PaletteView)}
                                    className="flex items-center gap-2.5 px-3 py-1.5 w-full rounded-md text-left hover:bg-accent/20 focus:bg-accent/30 focus:outline-none transition-colors"
                                  >
                                    <child.icon className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs text-foreground/80">
                                        {child.label}
                                      </div>
                                      <div className="text-[10px] text-muted-foreground/50 truncate">
                                        {child.description}
                                      </div>
                                    </div>
                                    <ChevronRight className="h-3 w-3 text-muted-foreground/30 shrink-0" />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            </div>
          </TransitionContainer>
        </DialogContent>
      </Dialog>
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
    // Create a new event with defaults (same as "New Event" button)
    const startTime = new Date();
    startTime.setSeconds(0);
    startTime.setMilliseconds(0);

    const newEvent: CalendarEvent = {
      id: undefined as any,
      title: "",
      start: startTime,
      end: new Date(startTime.getTime() + 60 * 60 * 1000), // 1 hour default
      allDay: false,
      calendarId: localSettings?.defaultCalendarId || calendars?.[0]?.id || "",
      userId: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return (
      <EventEditor
        open={open}
        onOpenChange={onOpenChange}
        eventToEdit={newEvent}
        onEventSaved={onEventSaved}
        onBack={() => goBack("main")}
        localSettings={localSettings}
        editorMode={eventEditorMode}
        anchorPosition={popoverAnchorPosition}
        updatePreviewEvent={updatePreviewEvent}
      />
    );
  }

  // Other views fallback
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="spotlight"
        showClose={false}
        className="overflow-hidden p-0 bg-popover border-border/50 shadow-2xl max-h-[480px]"
      >
        <VisuallyHidden>
          <DialogTitle>Settings</DialogTitle>
        </VisuallyHidden>
        <TransitionContainer direction={transitionDirection} viewKey={currentView}>
          <div className="flex flex-col">
            <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
              <button
                onClick={() => goBack("main")}
                className="p-1 rounded hover:bg-muted/50 transition-colors"
              >
                <ArrowLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              <span className="text-sm font-medium">Settings</span>
            </div>
            <div className="flex-1 overflow-y-auto p-1">
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-md opacity-50">
                <Settings className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm">This section is coming soon</span>
              </div>
            </div>
          </div>
        </TransitionContainer>
      </DialogContent>
    </Dialog>
  );
}