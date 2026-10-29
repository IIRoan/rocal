"use client";

import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import { calendarApiService } from "@/lib/calendar-api-service";
import { SUBSCRIPTIONS_QUERY_KEY } from "@workspace/calendar-core";
import { partitionCalendarsByKind } from "@/lib/calendar-ui-helpers";
import type { Calendar } from "@/lib/types/calendar";
import {
  PRESET_COLORS,
  type PresetColor,
} from "./command-palette/navigation-config";
import {
  resetCalendarForm,
  validateCalendarForm,
  handleCalendarCreate,
  handleCalendarUpdate,
  handleCalendarDelete,
} from "./command-palette/calendar-utils";
import { SettingToggleRow } from "./command-palette/setting-toggle-row";
import type { PaletteView } from "./command-palette/constants";
import {
  EncryptionStatusBadge,
  getColorSwatchValue,
  useCalendarContext,
} from "@workspace/ui/components/calendar";

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
  ShieldCheck,
  Star,
  Eye,
  EyeOff,
  Tag,
} from "lucide-react";
import { SimpleTooltip } from "@workspace/ui/components/ui/tooltip";

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

  // Prefetch subscriptions so the synced-calendar edit screen opens populated without a Feed URL flash.
  useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: SUBSCRIPTIONS_QUERY_KEY,
      queryFn: () => calendarApiService.getSubscriptions(),
    });
  }, [queryClient]);

  const [calendarName, setCalendarName] = useState("");
  const [calendarColor, setCalendarColor] = useState("blue");
  const [calendarIsDefault, setCalendarIsDefault] = useState(false);
  const [calendarSaving, setCalendarSaving] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<Calendar | null>(null);
  const [calendarValidationErrors, setCalendarValidationErrors] = useState<{
    name?: string;
    color?: string;
  }>({});

  const goForward = (next: PaletteView) => {
    onNavigateTo(next);
  };

  const goBack = () => {
    onBack();
  };

  const handleToggleVisibility = (calendarId: string) => {
    toggleCalendarVisibility(calendarId);
  };

  if (currentView === "calendars") {
    return (
      <div className="flex flex-col">
        <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
          <button
            type="button"
            onClick={onBack}
            className="p-1 rounded hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="size-4 text-muted-foreground" />
          </button>
          <span className="text-sm font-medium">Calendars</span>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
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
              className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus-visible:bg-accent/50 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 transition-colors"
            >
              <Plus className="size-4 text-muted-foreground shrink-0" />
              <span className="text-sm">Create New Calendar</span>
              <ChevronRight className="ml-auto size-3.5 text-muted-foreground/40 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => onGoToSubscriptions()}
              className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus-visible:bg-accent/50 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 transition-colors"
            >
              <Globe className="size-4 text-muted-foreground shrink-0" />
              <span className="text-sm">Public &amp; External Feeds</span>
              <ChevronRight className="ml-auto size-3.5 text-muted-foreground/40 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => goForward("categories")}
              className="flex items-center gap-3 px-3 py-2 w-full cursor-pointer rounded-md text-left hover:bg-accent/30 focus-visible:bg-accent/50 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 transition-colors"
            >
              <Tag className="size-4 text-muted-foreground shrink-0" />
              <span className="text-sm">Categories</span>
              <ChevronRight className="ml-auto size-3.5 text-muted-foreground/40 shrink-0" />
            </button>
          </div>

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
                      setCalendarValidationErrors({});
                      goForward("calendar-edit");
                    }}
                    className="flex items-center gap-3 px-3 py-2 flex-1 min-w-0 rounded-md text-left hover:bg-accent/30 focus-visible:bg-accent/50 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 transition-colors"
                  >
                    <div
                      className="size-3.5 rounded-sm shrink-0"
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
                      kind="calendar"
                      asIcon
                      className="opacity-80"
                    />
                    <ChevronRight className="size-3.5 text-muted-foreground/40 shrink-0" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleVisibility(calendar.id)}
                    aria-label={
                      isVisible
                        ? `Hide ${calendar.name}`
                        : `Show ${calendar.name}`
                    }
                    className="shrink-0 size-7 flex items-center justify-center rounded text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent/40 transition-colors mr-1"
                  >
                    {isVisible ? (
                      <Eye className="size-3.5" strokeWidth={2} />
                    ) : (
                      <EyeOff className="size-3.5" strokeWidth={2} />
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
                        className="flex items-center gap-3 px-3 py-2 flex-1 min-w-0 rounded-md text-left hover:bg-accent/30 focus-visible:bg-accent/50 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 transition-colors"
                      >
                        <div
                          className="size-3.5 rounded-sm shrink-0"
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
                          kind="calendar"
                          asIcon
                          className="opacity-80"
                        />
                        <ChevronRight className="size-3.5 text-muted-foreground/40 shrink-0" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleVisibility(calendar.id)}
                        aria-label={
                          isVisible
                            ? `Hide ${calendar.name}`
                            : `Show ${calendar.name}`
                        }
                        className="shrink-0 size-7 flex items-center justify-center rounded text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent/40 transition-colors mr-1"
                      >
                        {isVisible ? (
                          <Eye className="size-3.5" strokeWidth={2} />
                        ) : (
                          <EyeOff className="size-3.5" strokeWidth={2} />
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
                        className="flex items-center gap-3 px-3 py-2 flex-1 min-w-0 rounded-md text-left hover:bg-accent/30 focus-visible:bg-accent/50 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 transition-colors"
                      >
                        <div
                          className="size-3.5 rounded-sm shrink-0"
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
                          kind="calendar"
                          asIcon
                          className="opacity-80"
                        />
                        <ChevronRight className="size-3.5 text-muted-foreground/40 shrink-0" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleVisibility(calendar.id)}
                        aria-label={
                          isVisible
                            ? `Hide ${calendar.name}`
                            : `Show ${calendar.name}`
                        }
                        className="shrink-0 size-7 flex items-center justify-center rounded text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent/40 transition-colors mr-1"
                      >
                        {isVisible ? (
                          <Eye className="size-3.5" strokeWidth={2} />
                        ) : (
                          <EyeOff className="size-3.5" strokeWidth={2} />
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
        <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
          <button
            type="button"
            onClick={() => goBack()}
            className="p-1 rounded hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="size-4 text-muted-foreground" />
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
                    setCalendarValidationErrors((prev) => ({
                      ...prev,
                      name: undefined,
                    }));
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
                  <SimpleTooltip content={preset.label} key={preset.value}>
                    <button
                      type="button"
                      onClick={() => {
                        setCalendarColor(preset.value);
                        if (calendarValidationErrors.color) {
                          setCalendarValidationErrors((prev) => ({
                            ...prev,
                            color: undefined,
                          }));
                        }
                      }}
                      className={`size-6 rounded-full border-2 transition-[border-color,transform,box-shadow] ${
                        calendarColor === preset.value
                          ? "border-foreground scale-110"
                          : "border-transparent hover:scale-105"
                      }`}
                      style={{
                        backgroundColor: getColorSwatchValue(preset.value),
                      }}
                      aria-label={preset.label}
                    />
                  </SimpleTooltip>
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
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
                Creating…
              </>
            ) : (
              <>
                <Save className="size-3.5 mr-1.5" />
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
      <div className="flex flex-col">
        <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
          <button
            type="button"
            onClick={() => goBack()}
            className="p-1 rounded hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="size-4 text-muted-foreground" />
          </button>
          <span className="text-sm font-medium">Edit Calendar</span>
          {editingCalendar && (
            <EncryptionStatusBadge
              item={editingCalendar}
              kind="calendar"
              hidePlaintext={false}
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
                    setCalendarValidationErrors((prev) => ({
                      ...prev,
                      name: undefined,
                    }));
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
                  <SimpleTooltip content={preset.label} key={preset.value}>
                    <button
                      type="button"
                      onClick={() => {
                        setCalendarColor(preset.value);
                        if (calendarValidationErrors.color) {
                          setCalendarValidationErrors((prev) => ({
                            ...prev,
                            color: undefined,
                          }));
                        }
                      }}
                      className={`size-6 rounded-full border-2 transition-[border-color,transform,box-shadow] ${
                        calendarColor === preset.value
                          ? "border-foreground scale-110"
                          : "border-transparent hover:scale-105"
                      }`}
                      style={{
                        backgroundColor: getColorSwatchValue(preset.value),
                      }}
                      aria-label={preset.label}
                    />
                  </SimpleTooltip>
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
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
              ) : (
                <Trash2 className="size-3.5 mr-1.5" />
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
                )
              }
              disabled={calendarSaving || !calendarName.trim()}
              className="h-8"
            >
              {calendarSaving ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="size-3.5 mr-1.5" />
                  Save
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
