"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useSettings } from "@/hooks/use-settings";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import type { CalendarEvent } from "@workspace/ui/components/calendar";
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
  COMMANDS,
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
  initialSearchQuery?: string;
  eventEditorMode?: EventEditorMode;
  popoverAnchorPosition?: { x: number; y: number } | null;
  initialEventViewMode?: "view" | "edit";
  previewEvent?: CalendarEvent | null;
  updatePreviewEvent?: (updates: Partial<CalendarEvent>) => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  eventToEdit,
  onEventSaved,
  initialView = "main",
  initialSearchQuery = "",
  eventEditorMode = "modal",
  popoverAnchorPosition = null,
  initialEventViewMode = "view",
  previewEvent = null,
  updatePreviewEvent,
}: CommandPaletteProps) {
  const calendarData = useSharedCalendarData();
  const { calendars } = calendarData;
  const { settings, loading, updateSettings, resetSettings } = useSettings();

  const [currentView, setCurrentView] = useState<PaletteView>(
    initialView as PaletteView,
  );
  const [transitionDirection, setTransitionDirection] = useState<
    "forward" | "back"
  >("forward");
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialSearchQuery);
  const [passkeyAddMode, setPasskeyAddMode] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Debounce search query to prevent visual shake
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Set initial search query when dialog opens
  useEffect(() => {
    if (open && initialSearchQuery) {
      setSearchQuery(initialSearchQuery);
      setDebouncedQuery(initialSearchQuery);
    }
  }, [open, initialSearchQuery]);

  // Focus search input when dialog opens
  useEffect(() => {
    if (open && currentView === "main") {
      setSelectedIndex(0);
      const frameId = requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
      return () => cancelAnimationFrame(frameId);
    }
  }, [open, currentView]);

  const goForward = (next: PaletteView) => {
    setTransitionDirection("forward");
    setSearchQuery("");
    setPasskeyAddMode(false);
    setCurrentView(next);
  };

  const goBack = (prev: PaletteView) => {
    setTransitionDirection("back");
    setSearchQuery("");
    setPasskeyAddMode(false);
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
    open && currentView === "main",
  );

  const updateSetting = async <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K],
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

  // Command mode handling - hooks must be at component level
  const isCommandMode = searchQuery.trim().startsWith(">");
  const commandQuery = isCommandMode
    ? searchQuery.trim().slice(1).trim().toLowerCase()
    : "";

  const matchingCommands = useMemo(() => {
    if (!isCommandMode) return [];
    if (!commandQuery) return COMMANDS;
    return COMMANDS.filter(
      (cmd) =>
        cmd.command.includes(commandQuery) ||
        cmd.label.toLowerCase().includes(commandQuery),
    );
  }, [isCommandMode, commandQuery]);

  // Execute a command action
  const executeCommand = (cmd: (typeof COMMANDS)[0]) => {
    const { action, payload } = cmd.execute;
    switch (action) {
      // Immediate actions that close the palette
      case "setTheme":
        if (payload?.theme) {
          updateSetting("theme", payload.theme as "light" | "dark" | "system");
          onOpenChange(false);
        }
        break;
      // Action commands - take user directly to the item/setting
      case "newEvent":
        setTransitionDirection("forward");
        setSearchQuery("");
        setCurrentView("events");
        break;
      case "newCalendar":
        setTransitionDirection("forward");
        setSearchQuery("");
        setCurrentView("calendar-create");
        break;
      case "openCalendars":
        setTransitionDirection("forward");
        setSearchQuery("");
        setCurrentView("calendars");
        break;
      case "newPasskey":
        setPasskeyAddMode(true);
        setTransitionDirection("forward");
        setSearchQuery("");
        setCurrentView("passkeys");
        break;
      case "openPasskeys":
        setPasskeyAddMode(false);
        setTransitionDirection("forward");
        setSearchQuery("");
        setCurrentView("passkeys");
        break;
    }
  };

  // Auto-execute if exact command match
  useEffect(() => {
    if (isCommandMode && commandQuery && currentView === "main") {
      const exactMatch = COMMANDS.find((cmd) => cmd.command === commandQuery);
      if (exactMatch) {
        const timer = setTimeout(() => {
          executeCommand(exactMatch);
        }, 150);
        return () => clearTimeout(timer);
      }
    }
  }, [isCommandMode, commandQuery, currentView]);

  // Filter search items (only when not in command mode)
  const filteredItems = useMemo(() => {
    if (isCommandMode) return [];
    if (!debouncedQuery.trim()) return NAVIGATION_ITEMS;
    const query = debouncedQuery.toLowerCase();
    return SEARCH_INDEX.filter((item) => {
      const labelMatch = item.label.toLowerCase().includes(query);
      const descriptionMatch = item.description.toLowerCase().includes(query);
      const keywordsMatch = item.keywords?.some((k) => k.includes(query));
      return labelMatch || descriptionMatch || keywordsMatch;
    });
  }, [isCommandMode, debouncedQuery]);

  // Current list for keyboard navigation
  const currentList = isCommandMode ? matchingCommands : filteredItems;
  const currentListLength = currentList.length;

  // Reset selection when list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [debouncedQuery, isCommandMode, commandQuery]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && currentListLength > 0) {
      const selectedElement = listRef.current.querySelector(
        `[data-index="${selectedIndex}"]`,
      );
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex, currentListLength]);

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
              <p className="text-xs text-muted-foreground">Loading...</p>
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
        onBack={() => onOpenChange(false)}
        localSettings={localSettings}
        editorMode={eventEditorMode}
        anchorPosition={popoverAnchorPosition}
        initialEventViewMode={initialEventViewMode}
        updatePreviewEvent={updatePreviewEvent}
      />
    );
  }

  // Calendar management
  if (
    currentView === "calendars" ||
    currentView === "calendar-create" ||
    currentView === "calendar-edit"
  ) {
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
          className="overflow-hidden p-0 bg-popover border-border shadow-xl"
        >
          <VisuallyHidden>
            <DialogTitle>Command Palette</DialogTitle>
          </VisuallyHidden>
          <TransitionContainer
            direction={transitionDirection}
            viewKey={currentView}
          >
            <div
              className="flex flex-col"
              style={{ minHeight: "420px", maxHeight: "calc(100dvh - 200px)" }}
            >
              {/* Search Header - GitHub style */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
                {isCommandMode ? (
                  <span className="text-sm font-medium text-primary">
                    Command
                  </span>
                ) : (
                  <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder={
                    isCommandMode ? "Type a command..." : "Search or jump to..."
                  }
                  value={searchQuery}
                  onChange={(e) => {
                    e.stopPropagation();
                    setSearchQuery(e.target.value);
                  }}
                  onFocus={(e) => e.stopPropagation()}
                  onBlur={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && searchQuery === ">") {
                      setSearchQuery("");
                    } else if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setSelectedIndex((prev) =>
                        Math.min(prev + 1, currentListLength - 1),
                      );
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setSelectedIndex((prev) => Math.max(prev - 1, 0));
                    } else if (e.key === "Enter" && currentListLength > 0) {
                      e.preventDefault();
                      if (isCommandMode) {
                        executeCommand(matchingCommands[selectedIndex]);
                      } else {
                        goForward(
                          filteredItems[selectedIndex]
                            .targetView as PaletteView,
                        );
                      }
                    }
                  }}
                  className="flex-1 h-8 bg-transparent border-0 ring-0 focus:ring-0 focus:border-0 focus:outline-none rounded-none px-0 text-sm placeholder:text-muted-foreground/60"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSearchQuery("")}
                    className="p-1 h-auto"
                  >
                    <svg
                      className="h-4 w-4 text-muted-foreground"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                    >
                      <path d="M2.343 13.657A8 8 0 1 1 13.658 2.343 8 8 0 0 1 2.343 13.657ZM6.03 4.97a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042L6.94 8 4.97 9.97a.749.749 0 0 0 .326 1.275.749.749 0 0 0 .734-.215L8 9.06l1.97 1.97a.749.749 0 0 0 1.275-.326.749.749 0 0 0-.215-.734L9.06 8l1.97-1.97a.749.749 0 0 0-.326-1.275.749.749 0 0 0-.734.215L8 6.94Z"></path>
                    </svg>
                  </Button>
                )}
              </div>
              {/* Results List */}
              <div ref={listRef} className="flex-1 overflow-y-auto py-2">
                {isCommandMode ? (
                  matchingCommands.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      No command found.
                    </div>
                  ) : (
                    <div className="px-2">
                      {matchingCommands.map((cmd, index) => (
                        <button
                          key={cmd.command}
                          data-index={index}
                          type="button"
                          onClick={() => executeCommand(cmd)}
                          className={`flex items-center gap-3 px-2 py-2 w-full rounded-md text-left focus:outline-none transition-colors group ${
                            index === selectedIndex
                              ? "bg-accent/50"
                              : "hover:bg-accent/50"
                          }`}
                        >
                          <div className="flex items-center justify-center w-6 h-6 shrink-0">
                            <cmd.icon className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <span className="text-sm flex-1 truncate">
                            {cmd.label}
                          </span>
                          <span className="text-xs text-muted-foreground hidden sm:block group-hover:text-muted-foreground/70">
                            {cmd.description}
                          </span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ))}
                    </div>
                  )
                ) : filteredItems.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No results found.
                  </div>
                ) : (
                  <div className="px-2">
                    {filteredItems.map((item, index) => (
                      <button
                        key={item.id}
                        data-index={index}
                        type="button"
                        onClick={() =>
                          goForward(item.targetView as PaletteView)
                        }
                        className={`flex items-center gap-3 px-2 py-2 w-full rounded-md text-left focus:outline-none transition-colors group ${
                          index === selectedIndex
                            ? "bg-accent/50"
                            : "hover:bg-accent/50"
                        }`}
                      >
                        <div className="flex items-center justify-center w-6 h-6 shrink-0">
                          <item.icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <span className="text-sm flex-1 truncate">
                          {item.label}
                        </span>
                        <span className="text-xs text-muted-foreground hidden sm:block group-hover:text-muted-foreground/70">
                          {item.description}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Footer Tip - GitHub style */}
              <div className="px-3 py-2 border-t border-border/50 text-xs text-muted-foreground flex items-center justify-between">
                <span>
                  Type{" "}
                  <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
                    &gt;
                  </kbd>{" "}
                  for commands
                </span>
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
        startInAddMode={passkeyAddMode}
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
        <TransitionContainer
          direction={transitionDirection}
          viewKey={currentView}
        >
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

