"use client";

import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import { calendarApiService } from "@/lib/calendar-api-service";
import {
  getErrorMessage,
  partitionCalendarsByKind,
} from "@/lib/calendar-ui-helpers";
import type { Calendar, CalendarShareLink } from "@/lib/types/calendar";
import { toast } from "sonner";
import {
  PRESET_COLORS,
  resetCalendarForm,
  validateCalendarForm,
  handleCalendarCreate,
  handleCalendarUpdate,
  handleCalendarDelete,
  SettingToggleRow,
  ToggleIndicator,
  type PaletteView,
  type PresetColor,
} from "./command-palette/index";
import {
  EncryptionStatusBadge,
  getColorSwatchValue,
  useCalendarContext,
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
  ShieldCheck,
  Star,
  Eye,
  EyeOff,
} from "lucide-react";

interface CalendarManagerProps {
  onBack: () => void;
  onGoToSubscriptions: (calendarId?: string) => void;
  currentView: PaletteView;
  onNavigateTo: (view: PaletteView) => void;
}

export function CalendarManager({
  onBack,
  onGoToSubscriptions,
  currentView,
  onNavigateTo,
}: CalendarManagerProps) {
  const calendarData = useSharedCalendarData();
  const queryClient = useQueryClient();
  const { calendars } = calendarData;
  const { ownedCalendars, publicCalendars, subscribedCalendars } =
    partitionCalendarsByKind(calendars);
  const { toggleCalendarVisibility, isCalendarVisible } = useCalendarContext();

  // Prefetch subscriptions so the synced-calendar edit screen renders
  // populated immediately (no Feed URL flash) when the user opens it.
  useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: ["subscriptions"],
      queryFn: () => calendarApiService.getSubscriptions(),
    });
  }, [queryClient]);

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
  const [calendarForceFullEncryption, setCalendarForceFullEncryption] =
    useState(false);
  const [showForceEncryptConfirm, setShowForceEncryptConfirm] = useState(false);

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
            {ownedCalendars.map((calendar) => {
              const isVisible = isCalendarVisible(calendar.id);
              return (
                <div key={calendar.id} className="flex items-center group/cal">
                  <button
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
                      setCalendarForceFullEncryption(
                        calendar.forceFullEncryption || false,
                      );
                      setCalendarValidationErrors({});
                      setShowRegenerateConfirm(false);
                      void loadShareLink(calendar.id);
                      goForward("calendar-edit");
                    }}
                    className="flex items-center gap-3 px-3 py-2 flex-1 min-w-0 rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
                  >
                    <div
                      className="h-3.5 w-3.5 rounded-sm shrink-0"
                      style={{
                        backgroundColor: getColorSwatchValue(calendar.color),
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{calendar.name}</div>
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
                    <EncryptionStatusBadge
                      item={calendar}
                      asIcon
                      className="opacity-80"
                    />
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleCalendarVisibility(calendar.id)}
                    aria-label={
                      isVisible
                        ? `Hide ${calendar.name}`
                        : `Show ${calendar.name}`
                    }
                    className="shrink-0 h-7 w-7 flex items-center justify-center rounded text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent/40 transition-colors mr-1"
                  >
                    {isVisible ? (
                      <Eye className="h-3.5 w-3.5" strokeWidth={2} />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" strokeWidth={2} />
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {publicCalendars.length > 0 && (
            <>
              <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-t border-border/50 mt-1">
                Public Calendars
              </div>
              <div className="p-1">
                {publicCalendars.map((calendar) => {
                  const isVisible = isCalendarVisible(calendar.id);
                  return (
                    <div
                      key={calendar.id}
                      className="flex items-center group/cal"
                    >
                      <button
                        type="button"
                        onClick={() => onGoToSubscriptions(calendar.id)}
                        className="flex items-center gap-3 px-3 py-2 flex-1 min-w-0 rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
                      >
                        <div
                          className="h-3.5 w-3.5 rounded-sm shrink-0"
                          style={{
                            backgroundColor: getColorSwatchValue(
                              calendar.color,
                            ),
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">
                            {calendar.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Public holiday calendar
                          </div>
                        </div>
                        <EncryptionStatusBadge
                          item={calendar}
                          asIcon
                          className="opacity-80"
                        />
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void toggleCalendarVisibility(calendar.id)
                        }
                        aria-label={
                          isVisible
                            ? `Hide ${calendar.name}`
                            : `Show ${calendar.name}`
                        }
                        className="shrink-0 h-7 w-7 flex items-center justify-center rounded text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent/40 transition-colors mr-1"
                      >
                        {isVisible ? (
                          <Eye className="h-3.5 w-3.5" strokeWidth={2} />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5" strokeWidth={2} />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {subscribedCalendars.length > 0 && (
            <>
              <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-t border-border/50 mt-1">
                Subscribed Calendars
              </div>
              <div className="p-1">
                {subscribedCalendars.map((calendar) => {
                  const isVisible = isCalendarVisible(calendar.id);
                  return (
                    <div
                      key={calendar.id}
                      className="flex items-center group/cal"
                    >
                      <button
                        type="button"
                        onClick={() => onGoToSubscriptions(calendar.id)}
                        className="flex items-center gap-3 px-3 py-2 flex-1 min-w-0 rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
                      >
                        <div
                          className="h-3.5 w-3.5 rounded-sm shrink-0"
                          style={{
                            backgroundColor: getColorSwatchValue(
                              calendar.color,
                            ),
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">
                            {calendar.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            External subscription
                          </div>
                        </div>
                        <EncryptionStatusBadge
                          item={calendar}
                          asIcon
                          className="opacity-80"
                        />
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void toggleCalendarVisibility(calendar.id)
                        }
                        aria-label={
                          isVisible
                            ? `Hide ${calendar.name}`
                            : `Show ${calendar.name}`
                        }
                        className="shrink-0 h-7 w-7 flex items-center justify-center rounded text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent/40 transition-colors mr-1"
                      >
                        {isVisible ? (
                          <Eye className="h-3.5 w-3.5" strokeWidth={2} />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5" strokeWidth={2} />
                        )}
                      </button>
                    </div>
                  );
                })}
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

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-4 pt-4 pb-3 space-y-3">
            <div className="space-y-1.5">
              <Label
                htmlFor="calendar-name"
                className="text-xs text-muted-foreground"
              >
                Name
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
                className={`h-8 text-sm ${calendarValidationErrors.name ? "border-destructive" : ""}`}
              />
              {calendarValidationErrors.name && (
                <p className="text-xs text-destructive">
                  {calendarValidationErrors.name}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Color</Label>
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
                    className={`h-6 w-6 rounded-full border-2 transition-all ${
                      calendarColor === preset.value
                        ? "border-foreground scale-110"
                        : "border-transparent hover:scale-105"
                    }`}
                    style={{
                      backgroundColor: getColorSwatchValue(preset.value),
                    }}
                    title={preset.label}
                    aria-label={preset.label}
                  />
                ))}
              </div>
              {calendarValidationErrors.color && (
                <p className="text-xs text-destructive">
                  {calendarValidationErrors.color}
                </p>
              )}
            </div>
          </div>

          <div className="p-1 border-t border-border/50 mt-1">
            <SettingToggleRow
              checked={calendarIsDefault}
              description="Use this calendar by default for new events."
              icon={Star}
              label="Default calendar"
              onToggle={() => setCalendarIsDefault(!calendarIsDefault)}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="border-t border-border/50 px-4 py-3 flex items-center justify-end shrink-0">
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
            {editingCalendar && (
              <EncryptionStatusBadge
                item={editingCalendar}
                className="ml-auto"
                showLabel
              />
            )}
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="px-4 pt-4 pb-3 space-y-3">
              <div className="space-y-1.5">
                <Label
                  htmlFor="calendar-name"
                  className="text-xs text-muted-foreground"
                >
                  Name
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
                  className={`h-8 text-sm ${calendarValidationErrors.name ? "border-destructive" : ""}`}
                />
                {calendarValidationErrors.name && (
                  <p className="text-xs text-destructive">
                    {calendarValidationErrors.name}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Color</Label>
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
                      className={`h-6 w-6 rounded-full border-2 transition-all ${
                        calendarColor === preset.value
                          ? "border-foreground scale-110"
                          : "border-transparent hover:scale-105"
                      }`}
                      style={{
                        backgroundColor: getColorSwatchValue(preset.value),
                      }}
                      title={preset.label}
                      aria-label={preset.label}
                    />
                  ))}
                </div>
                {calendarValidationErrors.color && (
                  <p className="text-xs text-destructive">
                    {calendarValidationErrors.color}
                  </p>
                )}
              </div>
            </div>

            <div className="p-1 border-t border-border/50 mt-1">
              <SettingToggleRow
                checked={calendarIsDefault}
                description="Use this calendar by default for new events."
                icon={Star}
                label="Default calendar"
                onToggle={() => setCalendarIsDefault(!calendarIsDefault)}
              />

              <button
                type="button"
                role="switch"
                aria-checked={!!shareLinkInfo?.enabled}
                onClick={() => {
                  if (shareLinkLoading) return;
                  void handleToggleShareLink(!shareLinkInfo?.enabled);
                }}
                disabled={shareLinkLoading}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent/30 focus:bg-accent/50 focus:outline-none disabled:opacity-60"
              >
                <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm">ICS sharing</div>
                  <div className="text-xs text-muted-foreground">
                    Enable a private subscription link for this calendar.
                  </div>
                </div>
                <ToggleIndicator checked={!!shareLinkInfo?.enabled} />
              </button>

              {shareLinkLoading ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  Updating sharing settings...
                </div>
              ) : shareLinkInfo?.enabled && shareLinkInfo.shareUrl ? (
                <div className="px-3 pt-1 pb-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={shareLinkInfo.shareUrl}
                      readOnly
                      className="h-8 text-xs font-mono"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCopyShareLink}
                      className="h-8 px-2"
                      title="Copy link"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowRegenerateConfirm(true)}
                    className="h-7 text-xs text-muted-foreground hover:text-foreground -ml-1"
                    disabled={shareLinkLoading}
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Regenerate URL
                  </Button>
                </div>
              ) : null}

              {shareLinkError && (
                <p className="px-3 py-1 text-xs text-destructive">
                  {shareLinkError}
                </p>
              )}

              <button
                type="button"
                role="switch"
                aria-checked={calendarForceFullEncryption}
                onClick={() => {
                  if (!calendarForceFullEncryption) {
                    setShowForceEncryptConfirm(true);
                  } else {
                    setCalendarForceFullEncryption(false);
                  }
                }}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent/30 focus:bg-accent/50 focus:outline-none"
              >
                <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm">Force full encryption</div>
                  <div className="text-xs text-muted-foreground">
                    Store every event in this calendar as ciphertext only.
                  </div>
                </div>
                <ToggleIndicator checked={calendarForceFullEncryption} />
              </button>
              {calendarForceFullEncryption && (
                <div className="px-3 pt-1 pb-2 text-xs text-muted-foreground flex items-start gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                  <span>
                    Reminders and ICS shares from this calendar won&apos;t
                    include event titles, descriptions, or locations.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="border-t border-border/50 px-4 py-3 flex items-center justify-between shrink-0">
            {editingCalendar && (
              <Button
                variant="ghost"
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
                className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                {calendarSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                Delete
              </Button>
            )}
            <div className="ml-auto">
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
                    { forceFullEncryption: calendarForceFullEncryption },
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

        <Dialog
          open={showForceEncryptConfirm}
          onOpenChange={setShowForceEncryptConfirm}
        >
          <DialogContent
            showClose={false}
            className="max-w-md p-0 overflow-hidden bg-popover border-border/50 shadow-2xl"
          >
            <DialogHeader className="px-5 pt-5 pb-3">
              <DialogTitle>Force full encryption?</DialogTitle>
              <DialogDescription>
                Every event in this calendar will be stored as ciphertext only.
              </DialogDescription>
            </DialogHeader>
            <div className="px-5 pb-4 space-y-3">
              <div className="rounded-md border border-border/50 bg-muted/30 p-3">
                <p className="text-sm flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <span>
                    Existing encrypted events will have their plaintext shadows
                    removed. Reminders will still fire but won&apos;t include
                    event titles or descriptions, and ICS share links won&apos;t
                    expose event details.
                  </span>
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                You can turn this off later, but already re-encrypted events
                will only show plaintext content again after each event is
                edited and saved on a signed-in client.
              </p>
            </div>
            <DialogFooter className="px-5 py-4 border-t border-border/50 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowForceEncryptConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setCalendarForceFullEncryption(true);
                  setShowForceEncryptConfirm(false);
                }}
              >
                Enable
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return null;
}
