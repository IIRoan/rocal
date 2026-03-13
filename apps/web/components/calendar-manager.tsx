"use client";

import React, { useState } from "react";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import {
  TransitionContainer,
  PRESET_COLORS,
  resetCalendarForm,
  validateCalendarForm,
  handleCalendarCreate,
  handleCalendarUpdate,
  handleCalendarDelete,
  type PaletteView,
} from "./command-palette/index";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { VisuallyHidden } from "@workspace/ui/components/ui/visually-hidden";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { Button } from "@workspace/ui/components/ui/button";
import {
  ArrowLeft,
  Calendar,
  Plus,
  Save,
  Trash2,
  Loader2,
  ChevronRight,
  Globe,
} from "lucide-react";

interface CalendarManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBack: () => void;
  onGoToSubscriptions: () => void;
  currentView: PaletteView;
  onViewChange: (view: PaletteView) => void;
  transitionDirection: "forward" | "back";
}

export function CalendarManager({
  open,
  onOpenChange,
  onBack,
  onGoToSubscriptions,
  currentView,
  onViewChange,
  transitionDirection,
}: CalendarManagerProps) {
  const calendarData = useSharedCalendarData();
  const { calendars } = calendarData;

  // Calendar management state
  const [calendarName, setCalendarName] = useState("");
  const [calendarColor, setCalendarColor] = useState("#3b82f6");
  const [calendarSaving, setCalendarSaving] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<any>(null);
  const [calendarValidationErrors, setCalendarValidationErrors] = useState<{
    name?: string;
    color?: string;
  }>({});

  const goForward = (next: PaletteView) => {
    onViewChange(next);
  };

  const goBack = (prev: PaletteView) => {
    onViewChange(prev);
  };

  if (currentView === "calendars") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          variant="spotlight"
          showClose={false}
          className="overflow-hidden p-0 bg-popover border-border/50 shadow-2xl max-h-[480px]"
        >
          <VisuallyHidden>
            <DialogTitle>Calendar Management</DialogTitle>
          </VisuallyHidden>
          <TransitionContainer direction={transitionDirection}>
            <div className="flex flex-col">
              {/* Header */}
              <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
                <button
                  onClick={onBack}
                  className="p-1 rounded hover:bg-muted/50 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                </button>
                <span className="text-sm font-medium">Calendars</span>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                {/* Actions Section */}
                <div className="px-4 py-2 text-xs font-medium text-muted-foreground">Actions</div>
                <div className="p-1">
                  <button
                    type="button"
                    onClick={() => {
                      resetCalendarForm({
                        setCalendarName,
                        setCalendarColor,
                        setEditingCalendar,
                        setCalendarValidationErrors,
                      });
                      goForward("calendar-create");
                    }}
                    className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
                  >
                    <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm">Create New Calendar</span>
                    <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={onGoToSubscriptions}
                    className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
                  >
                    <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm">Subscribe to External</span>
                    <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                  </button>
                </div>

                {/* Your Calendars Section */}
                <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-t border-border/50 mt-1">Your Calendars</div>
                <div className="p-1">
                  {calendars.map((calendar) => (
                    <button
                      key={calendar.id}
                      type="button"
                      onClick={() => {
                        setEditingCalendar(calendar);
                        setCalendarName(calendar.name);
                        setCalendarColor(calendar.color);
                        setCalendarValidationErrors({});
                        goForward("calendar-edit");
                      }}
                      className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
                    >
                      <div
                        className="h-3.5 w-3.5 rounded-sm shrink-0"
                        style={{ backgroundColor: calendar.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{calendar.name}</div>
                        {calendar.isDefault && (
                          <div className="text-xs text-muted-foreground">Default</div>
                        )}
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </TransitionContainer>
        </DialogContent>
      </Dialog>
    );
  }

  if (currentView === "calendar-create") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          variant="spotlight"
          showClose={false}
          className="overflow-hidden p-0 bg-popover border-border/50 shadow-2xl max-h-[480px]"
        >
          <VisuallyHidden>
            <DialogTitle>Create Calendar</DialogTitle>
          </VisuallyHidden>
          <TransitionContainer direction={transitionDirection}>
            <div className="flex flex-col">
              {/* Header */}
              <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
                <button
                  onClick={() => goBack("calendars")}
                  className="p-1 rounded hover:bg-muted/50 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                </button>
                <span className="text-sm font-medium">Create Calendar</span>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
                {/* Calendar Name */}
                <div className="space-y-2">
                  <Label htmlFor="calendar-name" className="text-xs font-medium text-muted-foreground">
                    NAME
                  </Label>
                  <Input
                    id="calendar-name"
                    value={calendarName}
                    onChange={(e) => {
                      setCalendarName(e.target.value);
                      if (calendarValidationErrors.name) {
                        setCalendarValidationErrors({
                          ...calendarValidationErrors,
                          name: undefined,
                        });
                      }
                    }}
                    placeholder="Calendar name"
                    className={`h-9 text-sm ${calendarValidationErrors.name ? "border-destructive" : ""}`}
                  />
                  {calendarValidationErrors.name && (
                    <p className="text-xs text-destructive">
                      {calendarValidationErrors.name}
                    </p>
                  )}
                </div>

                {/* Color Selection */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    COLOR
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setCalendarColor(color)}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${
                          calendarColor === color
                            ? "border-foreground scale-110"
                            : "border-transparent hover:scale-105"
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <input
                      type="color"
                      value={calendarColor}
                      onChange={(e) => setCalendarColor(e.target.value)}
                      className="w-6 h-6 rounded-full border cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="border-t border-border/50 px-4 py-3 flex items-center justify-end gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goBack("calendars")}
                  disabled={calendarSaving}
                  className="h-8"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleCalendarCreate(
                    calendarName,
                    calendarColor,
                    calendars,
                    calendarData,
                    {
                      setCalendarValidationErrors,
                      setCalendarSaving,
                      setCalendarName,
                      setCalendarColor,
                    },
                    () => goBack("calendars")
                  )}
                  disabled={calendarSaving || !calendarName.trim()}
                  className="h-8"
                >
                  {calendarSaving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5 mr-1.5" />
                      Create
                    </>
                  )}
                </Button>
              </div>
            </div>
          </TransitionContainer>
        </DialogContent>
      </Dialog>
    );
  }

  if (currentView === "calendar-edit") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          variant="spotlight"
          showClose={false}
          className="overflow-hidden p-0 bg-popover border-border/50 shadow-2xl max-h-[480px]"
        >
          <VisuallyHidden>
            <DialogTitle>Edit Calendar</DialogTitle>
          </VisuallyHidden>
          <TransitionContainer direction={transitionDirection}>
            <div className="flex flex-col">
              {/* Header */}
              <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
                <button
                  onClick={() => goBack("calendars")}
                  className="p-1 rounded hover:bg-muted/50 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                </button>
                <span className="text-sm font-medium">Edit Calendar</span>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
                {/* Calendar Name */}
                <div className="space-y-2">
                  <Label htmlFor="calendar-name" className="text-xs font-medium text-muted-foreground">
                    NAME
                  </Label>
                  <Input
                    id="calendar-name"
                    value={calendarName}
                    onChange={(e) => {
                      setCalendarName(e.target.value);
                      if (calendarValidationErrors.name) {
                        setCalendarValidationErrors({
                          ...calendarValidationErrors,
                          name: undefined,
                        });
                      }
                    }}
                    placeholder="Calendar name"
                    className={`h-9 text-sm ${calendarValidationErrors.name ? "border-destructive" : ""}`}
                  />
                  {calendarValidationErrors.name && (
                    <p className="text-xs text-destructive">
                      {calendarValidationErrors.name}
                    </p>
                  )}
                </div>

                {/* Color Selection */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    COLOR
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setCalendarColor(color)}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${
                          calendarColor === color
                            ? "border-foreground scale-110"
                            : "border-transparent hover:scale-105"
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <input
                      type="color"
                      value={calendarColor}
                      onChange={(e) => setCalendarColor(e.target.value)}
                      className="w-6 h-6 rounded-full border cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="border-t border-border/50 px-4 py-3 flex items-center justify-between shrink-0">
                {editingCalendar && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCalendarDelete(
                      editingCalendar,
                      calendarData,
                      setCalendarSaving,
                      () => goBack("calendars")
                    )}
                    disabled={calendarSaving}
                    className="h-8 text-destructive hover:text-destructive"
                  >
                    {calendarSaving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
                <div className="flex gap-2 ml-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goBack("calendars")}
                    disabled={calendarSaving}
                    className="h-8"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleCalendarUpdate(
                      calendarName,
                      calendarColor,
                      calendars,
                      editingCalendar,
                      calendarData,
                      {
                        setCalendarValidationErrors,
                        setCalendarSaving,
                        setEditingCalendar,
                      },
                      () => goBack("calendars")
                    )}
                    disabled={calendarSaving || !calendarName.trim()}
                    className="h-8"
                  >
                    {calendarSaving ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-3.5 w-3.5 mr-1.5" />
                        Save
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </TransitionContainer>
        </DialogContent>
      </Dialog>
    );
  }

  return null;
}
