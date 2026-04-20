"use client";

import { useMemo, useState } from "react";
import { calendarApiService } from "@/lib/calendar-api-service";
import { useCalendarData } from "@/hooks/use-calendar-data";
import { useCalendarContext } from "@workspace/ui/components/calendar";
import type {
  ApiError,
  Calendar,
  CalendarSubscription,
  CreateSubscriptionRequest,
  DeleteSubscriptionResponse,
  SyncSubscriptionResponse,
  UpdateSubscriptionRequest,
} from "@/lib/types/calendar";
import { NATIONAL_HOLIDAY_CALENDARS } from "@workspace/calendar-ics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { Badge } from "@workspace/ui/components/ui/badge";
import { ColorPicker } from "@workspace/ui/components/ui/color-picker";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { VisuallyHidden } from "@workspace/ui/components/ui/visually-hidden";
import { PRESET_COLORS, type PaletteView } from "./command-palette/index";
import { getColorSwatchValue } from "@workspace/ui/components/calendar";
import {
  Plus,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  Globe,
  Link2,
  Eye,
  EyeOff,
  Pencil,
  ChevronRight,
  Rss,
  Search,
} from "lucide-react";

const ALLOWED_COLOR_VALUES = PRESET_COLORS.map((c) => c.value);

const isValidColor = (value: string) =>
  ALLOWED_COLOR_VALUES.includes(value) ||
  /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(value);

const customSubscriptionSchema = z.object({
  name: z.string().trim().min(1, "Calendar name is required").max(100),
  url: z
    .string()
    .trim()
    .min(1, "Calendar URL is required")
    .url("Please enter a valid URL")
    .refine((value) => value.toLowerCase().includes(".ics"), {
      message: "URL should point to an .ics calendar file",
    }),
  color: z.string().trim().refine(isValidColor, "Please select a valid color"),
});

const editableSubscriptionSchema = z.object({
  name: z.string().trim().min(1, "Calendar name is required").max(100),
  color: z.string().trim().refine(isValidColor, "Please select a valid color"),
});

type CustomSubscriptionForm = z.infer<typeof customSubscriptionSchema>;
type EditableSubscriptionForm = z.infer<typeof editableSubscriptionSchema> & {
  subscriptionId: string;
};
type HolidayCalendar = (typeof NATIONAL_HOLIDAY_CALENDARS)[number];
type ReadOnlyCalendarEntry = {
  subscription: CalendarSubscription;
  calendar: Calendar | undefined;
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
};

interface SubscriptionManagementProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  onBack?: () => void;
  currentView: PaletteView;
  onNavigateTo: (view: PaletteView) => void;
  initialEditCalendarId?: string;
}

export function SubscriptionManagement({
  open,
  onOpenChange,
  onBack,
  currentView,
  onNavigateTo,
  initialEditCalendarId,
}: SubscriptionManagementProps) {
  const queryClient = useQueryClient();
  const { calendars, refetchCalendars } = useCalendarData();
  const { toggleCalendarVisibility, isCalendarVisible } = useCalendarContext();

  const [holidaySearch, setHolidaySearch] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newSubscription, setNewSubscription] =
    useState<CustomSubscriptionForm>({
      name: "",
      url: "",
      color: "indigo",
    });
  const [editingSubscription, setEditingSubscription] =
    useState<EditableSubscriptionForm | null>(null);
  const [editingSubscriptionData, setEditingSubscriptionData] =
    useState<CalendarSubscription | null>(null);

  const [validationErrors, setValidationErrors] = useState<{
    name?: string;
    url?: string;
  }>({});
  const [editValidationErrors, setEditValidationErrors] = useState<{
    name?: string;
    color?: string;
  }>({});

  const goToSubView = (
    view:
      | "subscriptions-add-feed"
      | "subscriptions-holidays"
      | "subscriptions-edit",
  ) => {
    setLocalError(null);
    setSuccess(null);
    onNavigateTo(view);
  };

  const goBackToMain = () => {
    setLocalError(null);
    setSuccess(null);
    onBack?.();
  };

  // Query
  const {
    data: subscriptions = [],
    isLoading: isLoadingSubscriptions,
    error: queryError,
  } = useQuery<CalendarSubscription[], ApiError>({
    queryKey: ["subscriptions"],
    queryFn: () => calendarApiService.getSubscriptions(),
    enabled: open,
  });

  // Auto-open edit view when navigated here with a specific calendar ID
  const [prevEditCalendarId, setPrevEditCalendarId] = useState(
    initialEditCalendarId,
  );
  const [prevSubscriptionsLength, setPrevSubscriptionsLength] = useState(
    subscriptions.length,
  );
  const editCalendarIdChanged = initialEditCalendarId !== prevEditCalendarId;
  const subscriptionsLengthChanged =
    subscriptions.length !== prevSubscriptionsLength;
  if (editCalendarIdChanged || subscriptionsLengthChanged) {
    if (editCalendarIdChanged) setPrevEditCalendarId(initialEditCalendarId);
    if (subscriptionsLengthChanged)
      setPrevSubscriptionsLength(subscriptions.length);

    if (
      currentView === "subscriptions-edit" &&
      initialEditCalendarId &&
      subscriptions.length > 0 &&
      !editingSubscription
    ) {
      const match = subscriptions.find(
        (sub) => sub.calendar.id === initialEditCalendarId,
      );
      if (match) {
        setEditingSubscription({
          subscriptionId: match.id,
          name: match.calendar.name,
          color: match.calendar.color,
        });
        setEditingSubscriptionData(match);
        setEditValidationErrors({});
        setLocalError(null);
        setSuccess(null);
      }
    }
  }

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: CreateSubscriptionRequest) =>
      calendarApiService.createSubscription(data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      await refetchCalendars();
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      setSuccess("Read-only calendar added successfully.");
      setNewSubscription({ name: "", url: "", color: "indigo" });
      setValidationErrors({});
      setLocalError(null);
      goBackToMain();
    },
    onError: (error: ApiError) =>
      setLocalError(getErrorMessage(error, "Failed to create subscription")),
  });

  const deleteMutation = useMutation<
    DeleteSubscriptionResponse,
    ApiError,
    string
  >({
    mutationFn: (id: string) => calendarApiService.deleteSubscription(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      await refetchCalendars();
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      setSuccess("Subscription removed.");
      setLocalError(null);
      if (currentView === "subscriptions-edit") goBackToMain();
    },
    onError: (error: ApiError) =>
      setLocalError(getErrorMessage(error, "Failed to remove subscription")),
  });

  const syncMutation = useMutation<SyncSubscriptionResponse, ApiError, string>({
    mutationFn: (id: string) => calendarApiService.syncSubscription(id),
    onSuccess: async (_: SyncSubscriptionResponse, id: string) => {
      await queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      await refetchCalendars();
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      const sub = subscriptions.find((subscription) => subscription.id === id);
      setSuccess(`Synced "${sub?.name || "subscription"}"`);
      setLocalError(null);
    },
    onError: (error: ApiError) =>
      setLocalError(getErrorMessage(error, "Failed to sync subscription")),
  });
  const updateMutation = useMutation<
    CalendarSubscription,
    ApiError,
    {
      id: string;
      request: UpdateSubscriptionRequest;
    }
  >({
    mutationFn: ({ id, request }) =>
      calendarApiService.updateSubscription(id, request),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      await refetchCalendars();
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      setSuccess("Calendar updated.");
      setLocalError(null);
      setEditValidationErrors({});
      goBackToMain();
    },
    onError: (error: ApiError) =>
      setLocalError(getErrorMessage(error, "Failed to update calendar")),
  });

  const loading =
    isLoadingSubscriptions ||
    createMutation.isPending ||
    deleteMutation.isPending ||
    syncMutation.isPending ||
    updateMutation.isPending;
  const error =
    localError ||
    (queryError
      ? getErrorMessage(queryError, "Failed to load subscriptions")
      : null);

  const normalizeSubscriptionUrl = (value: string) => {
    try {
      const parsed = new URL(value);
      parsed.hash = "";
      parsed.search = "";
      parsed.pathname = parsed.pathname.replace(/\/+$/, "");
      return parsed.toString();
    } catch {
      return value.trim();
    }
  };

  const subscribedUrls = useMemo(
    () =>
      new Set(
        subscriptions.map((subscription: CalendarSubscription) =>
          normalizeSubscriptionUrl(subscription.url),
        ),
      ),
    [subscriptions],
  );
  const calendarById = useMemo(
    () => new Map(calendars.map((calendar) => [calendar.id, calendar])),
    [calendars],
  );
  const subscriptionByNormalizedUrl = useMemo(
    () =>
      new Map<string, CalendarSubscription>(
        subscriptions.map((subscription) => [
          normalizeSubscriptionUrl(subscription.url),
          subscription,
        ]),
      ),
    [subscriptions],
  );
  const publicHolidaySubscriptions = useMemo(
    () =>
      subscriptions.filter(
        (subscription) => subscription.calendar.kind === "public_holiday",
      ),
    [subscriptions],
  );
  const readOnlyCalendars = useMemo<ReadOnlyCalendarEntry[]>(
    () =>
      [...subscriptions]
        .map((subscription) => ({
          subscription,
          calendar: calendarById.get(subscription.calendar.id),
        }))
        .sort((left, right) => {
          if (
            left.subscription.calendar.kind !== right.subscription.calendar.kind
          ) {
            return left.subscription.calendar.kind === "public_holiday"
              ? -1
              : 1;
          }

          return left.subscription.calendar.name.localeCompare(
            right.subscription.calendar.name,
          );
        }),
    [calendarById, subscriptions],
  );

  const filteredHolidayCalendars = useMemo(() => {
    const search = holidaySearch.trim().toLowerCase();

    return NATIONAL_HOLIDAY_CALENDARS.filter((holidayCalendar) => {
      if (!search) return true;

      const haystack = [
        holidayCalendar.label,
        holidayCalendar.countryName,
        holidayCalendar.language,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });
  }, [holidaySearch]);

  const validateForm = (): CustomSubscriptionForm | null => {
    const parsed = customSubscriptionSchema.safeParse(newSubscription);
    if (parsed.success) {
      setValidationErrors({});
      return parsed.data;
    }

    const errors: typeof validationErrors = {};
    for (const issue of parsed.error.issues) {
      if (issue.path[0] === "name") errors.name = issue.message;
      if (issue.path[0] === "url") errors.url = issue.message;
    }
    setValidationErrors(errors);
    return null;
  };

  const handleCreateSubscription = () => {
    const parsed = validateForm();
    if (!parsed) return;
    createMutation.mutate({
      name: parsed.name,
      url: parsed.url,
      color: parsed.color,
    });
  };

  const handleOpenEdit = (subscription: CalendarSubscription) => {
    setEditingSubscription({
      subscriptionId: subscription.id,
      name: subscription.calendar.name,
      color: subscription.calendar.color,
    });
    setEditingSubscriptionData(subscription);
    setEditValidationErrors({});
    setLocalError(null);
    setSuccess(null);
    goToSubView("subscriptions-edit");
  };

  const handleDeleteSubscription = (subscription: CalendarSubscription) => {
    if (
      !confirm(
        `Remove "${subscription.name}"? The read-only calendar and its synced events will be deleted.`,
      )
    ) {
      return;
    }
    deleteMutation.mutate(subscription.id);
  };

  const handleCreateHolidayCalendar = (holidayCalendar: HolidayCalendar) => {
    createMutation.mutate({
      name: holidayCalendar.label,
      url: holidayCalendar.url,
      color: holidayCalendar.defaultColor,
    });
  };

  const handleSyncSubscription = (subscription: CalendarSubscription) => {
    syncMutation.mutate(subscription.id);
  };

  const handleUpdateSubscription = () => {
    if (!editingSubscription) return;

    const parsed = editableSubscriptionSchema.safeParse(editingSubscription);
    if (!parsed.success) {
      const errors: typeof editValidationErrors = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "name") errors.name = issue.message;
        if (issue.path[0] === "color") errors.color = issue.message;
      }
      setEditValidationErrors(errors);
      return;
    }

    setEditValidationErrors({});
    updateMutation.mutate({
      id: editingSubscription.subscriptionId,
      request: { name: parsed.data.name, color: parsed.data.color },
    });
  };

  const formatLastSync = (lastSyncAt?: string) => {
    if (!lastSyncAt) return "Never";

    const date = new Date(lastSyncAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24)
      return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;

    return date.toLocaleDateString();
  };

  const getStatusBadge = (status: string, lastErrorMessage?: string) => {
    switch (status) {
      case "success":
        return (
          <Badge
            variant="secondary"
            className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 text-[10px] px-1.5 py-0"
          >
            Synced
          </Badge>
        );
      case "error":
        return (
          <Badge
            variant="destructive"
            title={lastErrorMessage}
            className="text-[10px] px-1.5 py-0"
          >
            Error
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            Pending
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            Unknown
          </Badge>
        );
    }
  };

  const isHolidayCalendar =
    editingSubscriptionData?.calendar.kind === "public_holiday";

  const content = (
    <div
      className="flex flex-col"
      style={{ minHeight: "360px", maxHeight: "calc(100dvh - 200px)" }}
    >
      {/* ─── MAIN VIEW ─── */}
      {currentView === "subscriptions" && (
        <>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
            {onBack && (
              <button
                onClick={onBack}
                className="p-1 rounded hover:bg-muted/50 transition-colors"
              >
                <ArrowLeft className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
            <Rss className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium">Subscriptions</span>
          </div>

          {/* Notification bar */}
          {(error || success) && (
            <div
              className={`flex items-center gap-2 px-4 py-2 text-xs border-b border-border/50 shrink-0 ${
                error
                  ? "text-destructive bg-destructive/5"
                  : "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50"
              }`}
            >
              {error ? (
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <CheckCircle className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="flex-1">{error ?? success}</span>
              <button
                onClick={() => {
                  setLocalError(null);
                  setSuccess(null);
                }}
                className="opacity-60 hover:opacity-100 transition-opacity"
              >
                ✕
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto min-h-0">
            {/* Actions section */}
            <div className="px-4 py-2 text-xs font-medium text-muted-foreground">
              Actions
            </div>
            <div className="p-1">
              <button
                type="button"
                onClick={() => goToSubView("subscriptions-add-feed")}
                className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
              >
                <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm">Add External Feed</span>
                <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
              </button>
              <button
                type="button"
                onClick={() => goToSubView("subscriptions-holidays")}
                className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
              >
                <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm flex-1">Browse Holiday Calendars</span>
                {publicHolidaySubscriptions.length > 0 && (
                  <span className="text-xs text-muted-foreground/70 shrink-0">
                    {publicHolidaySubscriptions.length} added
                  </span>
                )}
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
              </button>
            </div>

            {/* Synced Calendars section */}
            <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-t border-border/50 mt-1">
              Synced Calendars
              {readOnlyCalendars.length > 0 && (
                <span className="ml-1 opacity-60">
                  · {readOnlyCalendars.length}
                </span>
              )}
            </div>

            {isLoadingSubscriptions ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span className="text-xs">Loading...</span>
              </div>
            ) : readOnlyCalendars.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                No synced calendars yet.
              </div>
            ) : (
              <div className="p-1">
                {readOnlyCalendars.map(({ subscription }) => {
                  const isHoliday =
                    subscription.calendar.kind === "public_holiday";
                  return (
                    <div
                      key={subscription.id}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-md hover:bg-accent/20 group"
                    >
                      {/* Color swatch */}
                      <div
                        className="h-3.5 w-3.5 rounded-sm shrink-0"
                        style={{
                          backgroundColor: getColorSwatchValue(
                            subscription.calendar.color,
                          ),
                        }}
                      />
                      {/* Info — click to edit */}
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(subscription)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="text-sm truncate">
                          {subscription.calendar.name}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {isHoliday ? (
                            <Globe className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                          ) : (
                            <Link2 className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                          )}
                          <span className="text-xs text-muted-foreground">
                            {isHoliday ? "Holiday" : "External feed"}
                          </span>
                          {!isHoliday &&
                            getStatusBadge(
                              subscription.lastSyncStatus,
                              subscription.lastErrorMessage,
                            )}
                          {!isCalendarVisible(subscription.calendar.id) && (
                            <span className="text-xs text-muted-foreground/60">
                              · Hidden
                            </span>
                          )}
                        </div>
                      </button>
                      {/* Quick actions */}
                      <div className="flex items-center gap-0.5 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() =>
                            toggleCalendarVisibility(subscription.calendar.id)
                          }
                          title={
                            isCalendarVisible(subscription.calendar.id)
                              ? "Hide calendar"
                              : "Show calendar"
                          }
                          className="p-1 rounded hover:bg-muted/60 transition-colors text-muted-foreground"
                        >
                          {isCalendarVisible(subscription.calendar.id) ? (
                            <Eye className="h-3.5 w-3.5" />
                          ) : (
                            <EyeOff className="h-3.5 w-3.5" />
                          )}
                        </button>
                        {!isHoliday && (
                          <button
                            type="button"
                            onClick={() => handleSyncSubscription(subscription)}
                            disabled={syncMutation.isPending}
                            title="Sync now"
                            className="p-1 rounded hover:bg-muted/60 transition-colors text-muted-foreground"
                          >
                            <RefreshCw
                              className={`h-3.5 w-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`}
                            />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(subscription)}
                          title="Edit"
                          className="p-1 rounded hover:bg-muted/60 transition-colors text-muted-foreground"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── ADD EXTERNAL FEED VIEW ─── */}
      {currentView === "subscriptions-add-feed" && (
        <>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
            <button
              onClick={goBackToMain}
              className="p-1 rounded hover:bg-muted/50 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium">Add External Feed</span>
          </div>

          {/* Notification bar */}
          {error && (
            <div className="flex items-center gap-2 px-4 py-2 text-xs border-b border-border/50 shrink-0 text-destructive bg-destructive/5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">{error}</span>
              <button
                onClick={() => setLocalError(null)}
                className="opacity-60 hover:opacity-100 transition-opacity"
              >
                ✕
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="subscription-name"
                className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
              >
                Name
              </Label>
              <Input
                id="subscription-name"
                value={newSubscription.name}
                onChange={(e) => {
                  setNewSubscription((v) => ({ ...v, name: e.target.value }));
                  if (validationErrors.name)
                    setValidationErrors({
                      ...validationErrors,
                      name: undefined,
                    });
                }}
                placeholder="e.g. Team Vacation Calendar"
                className={`h-9 text-sm ${validationErrors.name ? "border-destructive" : ""}`}
              />
              {validationErrors.name && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {validationErrors.name}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="subscription-url"
                className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
              >
                URL (.ics)
              </Label>
              <Input
                id="subscription-url"
                value={newSubscription.url}
                onChange={(e) => {
                  setNewSubscription((v) => ({ ...v, url: e.target.value }));
                  if (validationErrors.url)
                    setValidationErrors({
                      ...validationErrors,
                      url: undefined,
                    });
                }}
                placeholder="https://example.com/calendar.ics"
                className={`h-9 text-sm ${validationErrors.url ? "border-destructive" : ""}`}
              />
              {validationErrors.url && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {validationErrors.url}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Color
              </Label>
              <ColorPicker
                value={newSubscription.color}
                onChange={(color) =>
                  setNewSubscription((v) => ({ ...v, color }))
                }
                presetColors={PRESET_COLORS}
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="button"
                onClick={handleCreateSubscription}
                disabled={loading}
                className="h-9"
              >
                {createMutation.isPending ? (
                  <>
                    <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    Add Feed
                  </>
                )}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ─── HOLIDAY CALENDARS VIEW ─── */}
      {currentView === "subscriptions-holidays" && (
        <>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
            <button
              onClick={goBackToMain}
              className="p-1 rounded hover:bg-muted/50 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium">Holiday Calendars</span>
          </div>

          {/* Notification bar */}
          {(error || success) && (
            <div
              className={`flex items-center gap-2 px-4 py-2 text-xs border-b border-border/50 shrink-0 ${
                error
                  ? "text-destructive bg-destructive/5"
                  : "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50"
              }`}
            >
              {error ? (
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <CheckCircle className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="flex-1">{error ?? success}</span>
              <button
                onClick={() => {
                  setLocalError(null);
                  setSuccess(null);
                }}
                className="opacity-60 hover:opacity-100 transition-opacity"
              >
                ✕
              </button>
            </div>
          )}

          {/* Search bar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 shrink-0">
            <Search className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
            <Input
              value={holidaySearch}
              onChange={(e) => setHolidaySearch(e.target.value)}
              placeholder="Search country or language..."
              className="h-7 border-0 bg-transparent ring-0 focus:ring-0 focus:border-0 focus:outline-none rounded-none px-0 text-sm placeholder:text-muted-foreground/60"
              autoComplete="off"
            />
            {holidaySearch && (
              <button
                onClick={() => setHolidaySearch("")}
                className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d="M2.343 13.657A8 8 0 1 1 13.658 2.343 8 8 0 0 1 2.343 13.657ZM6.03 4.97a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042L6.94 8 4.97 9.97a.749.749 0 0 0 .326 1.275.749.749 0 0 0 .734-.215L8 9.06l1.97 1.97a.749.749 0 0 0 1.275-.326.749.749 0 0 0-.215-.734L9.06 8l1.97-1.97a.749.749 0 0 0-.326-1.275.749.749 0 0 0-.734.215L8 6.94Z" />
                </svg>
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 py-1">
            {filteredHolidayCalendars.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                No calendars match your search.
              </div>
            ) : (
              filteredHolidayCalendars.map((hc) => {
                const normalizedUrl = normalizeSubscriptionUrl(hc.url);
                const existingSub =
                  subscriptionByNormalizedUrl.get(normalizedUrl);
                return (
                  <div
                    key={hc.id}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-accent/20 transition-colors"
                  >
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{
                        backgroundColor: getColorSwatchValue(
                          existingSub?.calendar.color ?? hc.defaultColor,
                        ),
                      }}
                    />
                    <span className="text-sm flex-1 truncate">{hc.label}</span>
                    {existingSub ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant="secondary"
                          className="text-[10px] bg-primary/10 text-primary px-1.5 py-0 h-auto"
                        >
                          Added
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          disabled={loading}
                          onClick={() => handleDeleteSubscription(existingSub)}
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                        >
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        type="button"
                        disabled={loading}
                        onClick={() => handleCreateHolidayCalendar(hc)}
                        className="h-7 px-2 text-xs shrink-0"
                      >
                        Add
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* ─── EDIT VIEW ─── */}
      {currentView === "subscriptions-edit" && editingSubscription && (
        <>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
            <button
              onClick={goBackToMain}
              className="p-1 rounded hover:bg-muted/50 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <Pencil className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium">Edit Calendar</span>
          </div>

          {/* Notification bar */}
          {error && (
            <div className="flex items-center gap-2 px-4 py-2 text-xs border-b border-border/50 shrink-0 text-destructive bg-destructive/5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">{error}</span>
              <button
                onClick={() => setLocalError(null)}
                className="opacity-60 hover:opacity-100 transition-opacity"
              >
                ✕
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="edit-subscription-name"
                className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
              >
                Name
              </Label>
              <Input
                id="edit-subscription-name"
                value={editingSubscription.name}
                onChange={(e) => {
                  setEditingSubscription({
                    ...editingSubscription,
                    name: e.target.value,
                  });
                  if (editValidationErrors.name)
                    setEditValidationErrors({
                      ...editValidationErrors,
                      name: undefined,
                    });
                }}
                className={`h-9 text-sm ${editValidationErrors.name ? "border-destructive" : ""}`}
              />
              {editValidationErrors.name && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {editValidationErrors.name}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Color
              </Label>
              <ColorPicker
                value={editingSubscription.color}
                onChange={(color) => {
                  setEditingSubscription({ ...editingSubscription, color });
                  if (editValidationErrors.color)
                    setEditValidationErrors({
                      ...editValidationErrors,
                      color: undefined,
                    });
                }}
                presetColors={PRESET_COLORS}
              />
              {editValidationErrors.color && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {editValidationErrors.color}
                </p>
              )}
            </div>

            {/* Sync status info — external feeds only */}
            {editingSubscriptionData && !isHolidayCalendar && (
              <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Last synced</span>
                  <span className="font-medium">
                    {formatLastSync(editingSubscriptionData.lastSyncAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Status</span>
                  {getStatusBadge(
                    editingSubscriptionData.lastSyncStatus,
                    editingSubscriptionData.lastErrorMessage,
                  )}
                </div>
                {editingSubscriptionData.lastErrorMessage && (
                  <div className="flex items-start gap-1 text-xs text-destructive pt-1">
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                    <span className="break-words">
                      {editingSubscriptionData.lastErrorMessage}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  editingSubscriptionData &&
                  handleDeleteSubscription(editingSubscriptionData)
                }
                disabled={loading}
                className="h-9 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Remove
              </Button>
              <Button
                type="button"
                onClick={handleUpdateSubscription}
                disabled={loading}
                className="h-9"
              >
                {updateMutation.isPending ? (
                  <>
                    <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  // When used standalone (with onOpenChange), wrap in Dialog
  if (onOpenChange) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          variant="spotlight"
          showClose={false}
          aria-describedby={undefined}
          className="overflow-hidden p-0 bg-popover border-border/50 shadow-2xl max-h-[520px]"
        >
          <VisuallyHidden>
            <DialogTitle>Calendar Subscriptions</DialogTitle>
          </VisuallyHidden>
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  // When embedded in command palette, return content directly
  return content;
}
