"use client";

import React, { useState } from "react";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import { calendarApiService } from "@/lib/calendar-api-service";
import type { Calendar, CalendarShareLink } from "@/lib/types/calendar";
import { toast } from "sonner";
import {
  PRESET_COLORS,
  resetCalendarForm,
  validateCalendarForm,
  handleCalendarCreate,
  handleCalendarUpdate,
  handleCalendarDelete,
  type PaletteView,
  type PresetColor,
} from "./command-palette/index";
import {
  EncryptionStatusBadge,
  getColorSwatchValue,
} from "@workspace/ui/components/calendar";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { Button } from "@workspace/ui/components/ui/button";
import { Switch } from "@workspace/ui/components/ui/switch";
import {
  ArrowLeft,
  Plus,
  Save,
  Trash2,
  Loader2,
  ChevronRight,
  Globe,
  Link2,
  Copy,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";

interface CalendarManagerProps {
  onBack: () => void;
  onGoToSubscriptions: (calendarId?: string) => void;
  currentView: PaletteView;
  onNavigateTo: (view: PaletteView) => void;
}

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
};

export function CalendarManager({
  onBack,
  onGoToSubscriptions,
  currentView,
  onNavigateTo,
}: CalendarManagerProps) {
  const calendarData = useSharedCalendarData();
  const { calendars } = calendarData;
  const ownedCalendars = calendars.filter(
    (calendar) => calendar.kind === "owned",
  );
  const publicCalendars = calendars.filter(
    (calendar) => calendar.kind === "public_holiday",
  );
  const subscribedCalendars = calendars.filter(
    (calendar) =>
      calendar.kind !== "owned" && calendar.kind !== "public_holiday",
  );

  // Calendar management state
  const [calendarName, setCalendarName] = useState("");
  const [calendarColor, setCalendarColor] = useState("blue");
  const [calendarIsDefault, setCalendarIsDefault] = useState(false);
  const [calendarSaving, setCalendarSaving] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<Calendar | null>(null);
  const [calendarValidationErrors, setCalendarValidationErrors] = useState<{
    name?: string;
    color?: string;
  }>({});
  const [shareLinkInfo, setShareLinkInfo] = useState<CalendarShareLink | null>(
    null,
  );
  const [shareLinkLoading, setShareLinkLoading] = useState(false);
  const [shareLinkError, setShareLinkError] = useState<string | null>(null);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

  const goForward = (next: PaletteView) => {
    onNavigateTo(next);
  };

  const goBack = () => {
    onBack();
  };

  const loadShareLink = async (calendarId: string) => {
    setShareLinkLoading(true);
    setShareLinkError(null);
    setShareLinkInfo(null);

    try {
      const shareInfo =
        await calendarApiService.getCalendarShareLink(calendarId);
      setShareLinkInfo(shareInfo);
    } catch (error: unknown) {
      setShareLinkError(getErrorMessage(error, "Failed to load share link"));
    } finally {
      setShareLinkLoading(false);
    }
  };

  const handleEnableShareLink = async (regenerate = false) => {
    if (!editingCalendar?.id) return;

    setShareLinkLoading(true);
    setShareLinkError(null);

    try {
      const shareInfo = await calendarApiService.enableCalendarShareLink(
        editingCalendar.id,
        { regenerate },
      );
      setShareLinkInfo(shareInfo);
      toast.success(
        regenerate ? "ICS share link regenerated" : "ICS share link enabled",
      );
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Failed to enable share link");
      setShareLinkError(message);
      toast.error(message);
    } finally {
      setShareLinkLoading(false);
    }
  };

  const handleDisableShareLink = async () => {
    if (!editingCalendar?.id) return;

    setShareLinkLoading(true);
    setShareLinkError(null);

    try {
      await calendarApiService.disableCalendarShareLink(editingCalendar.id);
      setShareLinkInfo({
        calendarId: editingCalendar.id,
        calendarName: editingCalendar.name,
        enabled: false,
        shareUrl: null,
      });
      toast.success("ICS share link disabled");
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Failed to disable share link");
      setShareLinkError(message);
      toast.error(message);
    } finally {
      setShareLinkLoading(false);
    }
  };

  const handleCopyShareLink = async () => {
    if (!shareLinkInfo?.shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareLinkInfo.shareUrl);
      toast.success("ICS link copied to clipboard");
    } catch {
      toast.error("Unable to copy link automatically");
    }
  };

  const handleToggleShareLink = async (enabled: boolean) => {
    if (enabled) {
      await handleEnableShareLink(false);
      return;
    }

    await handleDisableShareLink();
  };

  const handleConfirmRegenerate = async () => {
    setShowRegenerateConfirm(false);
    await handleEnableShareLink(true);
  };

  if (currentView === "calendars") {
    return (
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
                <div className="px-4 py-2 text-xs font-medium text-muted-foreground">
                  Actions
                </div>
                <div className="p-1">
                  <button
                    type="button"
                    onClick={() => {
                      resetCalendarForm({
                        setCalendarName,
                        setCalendarColor,
                        setCalendarIsDefault,
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
                    onClick={() => onGoToSubscriptions()}
                    className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
                  >
                    <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm">Public & External Feeds</span>
                    <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                  </button>
                </div>

                {/* Your Calendars Section */}
                <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-t border-border/50 mt-1">
                  Your Calendars
                </div>
                <div className="p-1">
                  {ownedCalendars.map((calendar) => (
                    <button
                      key={calendar.id}
                      type="button"
                      onClick={() => {
                        if (calendar.isSyncOnly) {
                          onGoToSubscriptions(calendar.id);
                          return;
                        }
                        setEditingCalendar(calendar);
                        setCalendarName(calendar.name);
                        setCalendarColor(calendar.color);
                        setCalendarIsDefault(calendar.isDefault || false);
                        setCalendarValidationErrors({});
                        setShowRegenerateConfirm(false);
                        void loadShareLink(calendar.id);
                        goForward("calendar-edit");
                      }}
                      className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
                    >
                      <div
                        className="h-3.5 w-3.5 rounded-sm shrink-0"
                        style={{ backgroundColor: getColorSwatchValue(calendar.color) }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="text-sm truncate flex-1">
                            {calendar.name}
                          </div>
                          <EncryptionStatusBadge
                            item={calendar}
                            className="opacity-80"
                          />
                        </div>
                        {calendar.isSyncOnly ? (
                          <div className="text-xs text-muted-foreground">
                            Synced (read-only)
                          </div>
                        ) : calendar.isDefault ? (
                          <div className="text-xs text-muted-foreground">
                            Default
                          </div>
                        ) : null}
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />                    </button>
                  ))}
                </div>

                {publicCalendars.length > 0 && (
                  <>
                    <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-t border-border/50 mt-1">
                      Public Calendars
                    </div>
                    <div className="p-1">
                      {publicCalendars.map((calendar) => (
                        <button
                          key={calendar.id}
                          type="button"
                          onClick={() => onGoToSubscriptions(calendar.id)}
                          className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
                        >
                          <div
                            className="h-3.5 w-3.5 rounded-sm shrink-0"
                            style={{ backgroundColor: getColorSwatchValue(calendar.color) }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="text-sm truncate flex-1">
                                {calendar.name}
                              </div>
                              <EncryptionStatusBadge
                                item={calendar}
                                className="opacity-80"
                              />
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Public holiday calendar
                            </div>
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {subscribedCalendars.length > 0 && (
                  <>
                    <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-t border-border/50 mt-1">
                      Subscribed Calendars
                    </div>
                    <div className="p-1">
                      {subscribedCalendars.map((calendar) => (
                        <button
                          key={calendar.id}
                          type="button"
                          onClick={() => onGoToSubscriptions(calendar.id)}
                          className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
                        >
                          <div
                            className="h-3.5 w-3.5 rounded-sm shrink-0"
                            style={{ backgroundColor: getColorSwatchValue(calendar.color) }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="text-sm truncate flex-1">
                                {calendar.name}
                              </div>
                              <EncryptionStatusBadge
                                item={calendar}
                                className="opacity-80"
                              />
                            </div>
                            <div className="text-xs text-muted-foreground">
                              External subscription
                            </div>
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
    );
  }

  if (currentView === "calendar-create") {
    return (
            <div className="flex flex-col">
              {/* Header */}
              <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
                <button
                  onClick={() => goBack()}
                  className="p-1 rounded hover:bg-muted/50 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                </button>
                <span className="text-sm font-medium">Create Calendar</span>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
                {/* Calendar Name */}
                <div className="space-y-2">
                  <Label
                    htmlFor="calendar-name"
                    className="text-xs font-medium text-muted-foreground"
                  >
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
                    {PRESET_COLORS.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => {
                          setCalendarColor(preset.value);
                          if (calendarValidationErrors.color) {
                            setCalendarValidationErrors({
                              ...calendarValidationErrors,
                              color: undefined,
                            });
                          }
                        }}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${
                          calendarColor === preset.value
                            ? "border-foreground scale-110"
                            : "border-transparent hover:scale-105"
                        }`}
                        style={{ backgroundColor: getColorSwatchValue(preset.value) }}
                        title={preset.label}
                      />
                    ))}
                  </div>
                  {calendarValidationErrors.color && (
                    <p className="text-xs text-destructive">
                      {calendarValidationErrors.color}
                    </p>
                  )}
                </div>

                {/* Default Settings */}
                <div className="space-y-3 pt-3 border-t border-border/50">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">
                        DEFAULT CALENDAR
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Use this calendar by default for new events.
                      </p>
                    </div>
                    <Switch
                      checked={calendarIsDefault}
                      onCheckedChange={setCalendarIsDefault}
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="border-t border-border/50 px-4 py-3 flex items-center justify-end gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goBack()}
                  disabled={calendarSaving}
                  className="h-8"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    handleCalendarCreate(
                      calendarName,
                      calendarColor,
                      calendarIsDefault,
                      calendars,
                      calendarData,
                      {
                        setCalendarValidationErrors,
                        setCalendarSaving,
                        setCalendarName,
                        setCalendarColor,
                        setCalendarIsDefault,
                      },
                      () => goBack(),
                    )
                  }
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
    );
  }

  if (currentView === "calendar-edit") {
    return (
      <>
              <div className="flex flex-col">
                {/* Header */}
                <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
                  <button
                    onClick={() => goBack()}
                    className="p-1 rounded hover:bg-muted/50 transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <span className="text-sm font-medium">Edit Calendar</span>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
                  {/* Calendar Name */}
                  <div className="space-y-2">
                    <Label
                      htmlFor="calendar-name"
                      className="text-xs font-medium text-muted-foreground"
                    >
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
                      {PRESET_COLORS.map((preset) => (
                        <button
                          key={preset.value}
                          type="button"
                          onClick={() => {
                            setCalendarColor(preset.value);
                            if (calendarValidationErrors.color) {
                              setCalendarValidationErrors({
                                ...calendarValidationErrors,
                                color: undefined,
                              });
                            }
                          }}
                          className={`w-6 h-6 rounded-full border-2 transition-all ${
                            calendarColor === preset.value
                              ? "border-foreground scale-110"
                              : "border-transparent hover:scale-105"
                          }`}
                          style={{ backgroundColor: getColorSwatchValue(preset.value) }}
                          title={preset.label}
                        />
                      ))}
                    </div>
                    {calendarValidationErrors.color && (
                      <p className="text-xs text-destructive">
                        {calendarValidationErrors.color}
                      </p>
                    )}
                  </div>

                  {/* Default Settings */}
                  <div className="space-y-3 pt-3 border-t border-border/50">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Label className="text-xs font-medium text-muted-foreground">
                          DEFAULT CALENDAR
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Use this calendar by default for new events.
                        </p>
                      </div>
                      <Switch
                        checked={calendarIsDefault}
                        onCheckedChange={setCalendarIsDefault}
                      />
                    </div>
                  </div>

                  {/* ICS Sharing */}
                  <div className="space-y-3 pt-3 border-t border-border/50">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Label className="text-xs font-medium text-muted-foreground">
                          ICS SHARING
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Enable a private subscription link for this calendar.
                        </p>
                      </div>
                      <Switch
                        checked={!!shareLinkInfo?.enabled}
                        onCheckedChange={(checked) => {
                          void handleToggleShareLink(checked);
                        }}
                        disabled={shareLinkLoading}
                      />
                    </div>

                    {shareLinkLoading ? (
                      <div className="text-xs text-muted-foreground">
                        Updating sharing settings...
                      </div>
                    ) : shareLinkInfo?.enabled && shareLinkInfo.shareUrl ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Input
                            value={shareLinkInfo.shareUrl}
                            readOnly
                            className="h-8 text-xs"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCopyShareLink}
                            className="h-8 px-2"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowRegenerateConfirm(true)}
                          className="h-7 text-xs"
                          disabled={shareLinkLoading}
                        >
                          <RefreshCw className="h-3.5 w-3.5 mr-1" />
                          Regenerate URL
                        </Button>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Link2 className="h-3.5 w-3.5" />
                        Sharing is off.
                      </div>
                    )}

                    {shareLinkError && (
                      <p className="text-xs text-destructive">
                        {shareLinkError}
                      </p>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="border-t border-border/50 px-4 py-3 flex items-center justify-between shrink-0">
                  {editingCalendar && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleCalendarDelete(
                          editingCalendar,
                          calendarData,
                          setCalendarSaving,
                          () => goBack(),
                        )
                      }
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
                      onClick={() => goBack()}
                      disabled={calendarSaving}
                      className="h-8"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        handleCalendarUpdate(
                          calendarName,
                          calendarColor,
                          calendarIsDefault,
                          calendars,
                          editingCalendar,
                          calendarData,
                          {
                            setCalendarValidationErrors,
                            setCalendarSaving,
                            setEditingCalendar,
                          },
                          () => goBack(),
                        )
                      }
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

        <Dialog
          open={showRegenerateConfirm}
          onOpenChange={setShowRegenerateConfirm}
        >
          <DialogContent
            showClose={false}
            className="max-w-md p-0 overflow-hidden bg-popover border-border/50 shadow-2xl"
          >
            <DialogHeader className="px-5 pt-5 pb-3">
              <DialogTitle>Regenerate sharing URL?</DialogTitle>
              <DialogDescription>
                This creates a new private ICS URL for this calendar.
              </DialogDescription>
            </DialogHeader>
            <div className="px-5 pb-4">
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                  The current URL stops working immediately. Everyone using it
                  must subscribe again with the new URL.
                </p>
              </div>
            </div>
            <DialogFooter className="px-5 py-4 border-t border-border/50 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowRegenerateConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  void handleConfirmRegenerate();
                }}
                disabled={shareLinkLoading}
              >
                Confirm Regenerate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return null;
}
