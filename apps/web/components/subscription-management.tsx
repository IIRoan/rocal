"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { calendarApiService } from "@/lib/calendar-api-service";
import { getErrorMessage } from "@/lib/calendar-ui-helpers";
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
import {
  NATIONAL_HOLIDAY_CALENDARS,
  findNationalHolidayCalendarByUrl,
} from "@workspace/calendar-ics";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { VisuallyHidden } from "@workspace/ui/components/ui/visually-hidden";
import { PRESET_COLORS, type PaletteView } from "./command-palette/index";
import { getColorSwatchValue } from "@workspace/ui/components/calendar";
import {
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Globe,
  Link2,
  Eye,
  EyeOff,
  ChevronRight,
  Rss,
  Search,
  Copy,
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
type HolidayCalendar = (typeof NATIONAL_HOLIDAY_CALENDARS)[number];
type ReadOnlyCalendarEntry = {
  subscription: CalendarSubscription;
  calendar: Calendar | undefined;
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
  const [newSubscription, setNewSubscription] =
    useState<CustomSubscriptionForm>({
      name: "",
      url: "",
      color: "indigo",
    });
  // Edit form: only the user-editable overrides for the calendar identified
  // by `initialEditCalendarId`. The underlying source-of-truth (subscription
  // detail + calendar entry) is derived synchronously from the query cache,
  // so the form renders fully populated on first paint — no flash.
  const [editFormOverride, setEditFormOverride] = useState<{
    forCalendarId: string;
    name?: string;
    color?: string;
  } | null>(null);

  const [validationErrors, setValidationErrors] = useState<{
    name?: string;
    url?: string;
  }>({});
  const [editValidationErrors, setEditValidationErrors] = useState<{
    name?: string;
    color?: string;
  }>({});
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const goToSubView = (
    view:
      | "subscriptions-add-feed"
      | "subscriptions-holidays"
      | "subscriptions-edit",
  ) => {
    onNavigateTo(view);
  };

  const goBackToMain = () => {
    onBack?.();
  };

  // Query — kept enabled while the palette is open. The `initialData` lets
  // us read whatever the parent (CalendarManager) prefetched into the cache
  // before the user ever clicked into the edit screen.
  const {
    data: subscriptions = [],
    isLoading: isLoadingSubscriptions,
    error: queryError,
  } = useQuery<CalendarSubscription[], ApiError>({
    queryKey: ["subscriptions"],
    queryFn: () => calendarApiService.getSubscriptions(),
    enabled: open,
    initialData: () =>
      queryClient.getQueryData<CalendarSubscription[]>(["subscriptions"]),
  });

  useEffect(() => {
    if (queryError) {
      toast.error(getErrorMessage(queryError, "Failed to load subscriptions"));
    }
  }, [queryError]);

  // The calendar id currently being edited. Sourced from either the parent
  // (`initialEditCalendarId`, when navigated here from CalendarManager) or
  // from local navigation within this component (clicking a row in the list).
  const [internalEditCalendarId, setInternalEditCalendarId] = useState<
    string | undefined
  >(undefined);
  const editTargetCalendarId =
    initialEditCalendarId ?? internalEditCalendarId;

  // Active override: only honored when it matches the current target. Stale
  // overrides for a previous target are simply ignored (no effect needed),
  // and the lazy setter below garbage-collects them on next user input.
  const activeOverride =
    editFormOverride && editFormOverride.forCalendarId === editTargetCalendarId
      ? editFormOverride
      : null;

  // Synchronously derived: the subscription detail and calendar for the
  // currently-edited target. Available on first render whenever the query
  // cache has been populated (typically via parent prefetch).
  const editingSubscriptionData: CalendarSubscription | null = useMemo(() => {
    if (!editTargetCalendarId) return null;
    return (
      subscriptions.find(
        (sub) => sub.calendar.id === editTargetCalendarId,
      ) ?? null
    );
  }, [editTargetCalendarId, subscriptions]);

  const editingCalendarEntry = useMemo(() => {
    if (!editTargetCalendarId) return undefined;
    return calendars.find((c) => c.id === editTargetCalendarId);
  }, [editTargetCalendarId, calendars]);

  // Effective form values: user override > subscription detail > calendar entry.
  const editingName =
    activeOverride?.name ??
    editingSubscriptionData?.calendar.name ??
    editingCalendarEntry?.name ??
    "";
  const editingColor =
    activeOverride?.color ??
    editingSubscriptionData?.calendar.color ??
    editingCalendarEntry?.color ??
    "";

  const updateEditField = (field: "name" | "color", value: string) => {
    if (!editTargetCalendarId) return;
    setEditFormOverride((prev) => {
      const base =
        prev && prev.forCalendarId === editTargetCalendarId ? prev : null;
      return {
        forCalendarId: editTargetCalendarId,
        name: field === "name" ? value : base?.name,
        color: field === "color" ? value : base?.color,
      };
    });
  };

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: CreateSubscriptionRequest) =>
      calendarApiService.createSubscription(data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      await refetchCalendars();
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success("Read-only calendar added successfully.");
      setNewSubscription({ name: "", url: "", color: "indigo" });
      setValidationErrors({});
      goBackToMain();
    },
    onError: (error: ApiError) =>
      toast.error(getErrorMessage(error, "Failed to create subscription")),
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
      toast.success("Subscription removed.");
      if (currentView === "subscriptions-edit") goBackToMain();
    },
    onError: (error: ApiError) =>
      toast.error(getErrorMessage(error, "Failed to remove subscription")),
  });

  const syncMutation = useMutation<SyncSubscriptionResponse, ApiError, string>({
    mutationFn: (id: string) => calendarApiService.syncSubscription(id),
    onSuccess: async (_: SyncSubscriptionResponse, id: string) => {
      await queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      await refetchCalendars();
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      const sub = subscriptions.find((subscription) => subscription.id === id);
      toast.success(`Synced "${sub?.name || "subscription"}"`);
    },
    onError: (error: ApiError) =>
      toast.error(getErrorMessage(error, "Failed to sync subscription")),
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
      toast.success("Calendar updated.");
      setEditValidationErrors({});
      goBackToMain();
    },
    onError: (error: ApiError) =>
      toast.error(getErrorMessage(error, "Failed to update calendar")),
  });

  const loading =
    isLoadingSubscriptions ||
    createMutation.isPending ||
    deleteMutation.isPending ||
    syncMutation.isPending ||
    updateMutation.isPending;

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
    setInternalEditCalendarId(subscription.calendar.id);
    setEditFormOverride(null);
    setEditValidationErrors({});
    goToSubView("subscriptions-edit");
  };

  const handleDeleteSubscription = (subscription: CalendarSubscription) => {
    setPendingDelete({ id: subscription.id, name: subscription.name });
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
    if (!editingSubscriptionData) return;

    const parsed = editableSubscriptionSchema.safeParse({
      name: editingName,
      color: editingColor,
    });
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
      id: editingSubscriptionData.id,
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
    editingSubscriptionData?.calendar.kind === "public_holiday" ||
    editingCalendarEntry?.kind === "public_holiday";

  const content = (
    <div
      className="flex flex-col"
      style={{
        minHeight: "360px",
        maxHeight: "calc(100dvh - 200px)",
      }}
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
                <Loader2 className="h-4 w-4 animate-spin" />
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
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
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
      {currentView === "subscriptions-edit" && editTargetCalendarId && (
        <>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
            <button
              onClick={goBackToMain}
              className="p-1 rounded hover:bg-muted/50 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <span className="text-sm font-medium">
              {isHolidayCalendar ? "Holiday Calendar" : "External Calendar"}
            </span>
            {editingSubscriptionData && !isHolidayCalendar && (
              <div className="ml-auto">
                {getStatusBadge(
                  editingSubscriptionData.lastSyncStatus,
                  editingSubscriptionData.lastErrorMessage ?? undefined,
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {/* Calendar Section */}
            <div className="px-4 py-2 text-xs font-medium text-muted-foreground">
              Calendar
            </div>
            <div className="px-4 pb-3 space-y-3">
              <div className="space-y-1.5">
                <Label
                  htmlFor="edit-subscription-name"
                  className="text-xs text-muted-foreground"
                >
                  Name
                </Label>
                <Input
                  id="edit-subscription-name"
                  value={editingName}
                  onChange={(e) => {
                    updateEditField("name", e.target.value);
                    if (editValidationErrors.name)
                      setEditValidationErrors({
                        ...editValidationErrors,
                        name: undefined,
                      });
                  }}
                  className={`h-8 text-sm ${editValidationErrors.name ? "border-destructive" : ""}`}
                />
                {editValidationErrors.name && (
                  <p className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    {editValidationErrors.name}
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
                        updateEditField("color", preset.value);
                        if (editValidationErrors.color)
                          setEditValidationErrors({
                            ...editValidationErrors,
                            color: undefined,
                          });
                      }}
                      className={`h-6 w-6 rounded-full border-2 transition-all ${
                        editingColor === preset.value
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
                {editValidationErrors.color && (
                  <p className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    {editValidationErrors.color}
                  </p>
                )}
              </div>
            </div>

            {/* Holiday calendar info */}
            {isHolidayCalendar && editingSubscriptionData && (() => {
              const holidayInfo = findNationalHolidayCalendarByUrl(
                editingSubscriptionData.url,
              );
              return (
                <div className="px-4 pb-4 border-t border-border/50 pt-3">
                  <div className="rounded-md border border-border/50 bg-muted/20 p-3 space-y-2">
                    <div className="flex items-start gap-2.5">
                      <Globe className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="text-sm font-medium">
                          {holidayInfo?.countryName ||
                            editingSubscriptionData.calendar.name}
                          {holidayInfo?.language ? (
                            <span className="text-muted-foreground font-normal">
                              {" \u00b7 "}
                              {holidayInfo.language}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Public holidays are read-only and refresh automatically
                          in the background. Last synced{" "}
                          {formatLastSync(
                            editingSubscriptionData.lastSyncAt ?? undefined,
                          ).toLowerCase()}
                          .
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Sync Section — external feeds only */}
            {!isHolidayCalendar && (
              <>
                <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-t border-border/50 mt-1">
                  Sync
                </div>
                <div className="p-1">
                  <button
                    type="button"
                    onClick={() =>
                      editingSubscriptionData &&
                      handleSyncSubscription(editingSubscriptionData)
                    }
                    disabled={loading || !editingSubscriptionData}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent/30 focus:bg-accent/50 focus:outline-none disabled:opacity-60"
                  >
                    <RefreshCw
                      className={`h-4 w-4 text-muted-foreground shrink-0 ${
                        syncMutation.isPending ? "animate-spin" : ""
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">Sync now</div>
                      <div className="text-xs text-muted-foreground">
                        {editingSubscriptionData
                          ? `Last synced ${formatLastSync(
                              editingSubscriptionData.lastSyncAt ?? undefined,
                            ).toLowerCase()}`
                          : "Loading sync info\u2026"}
                      </div>
                    </div>
                  </button>
                </div>

                {editingSubscriptionData?.lastErrorMessage && (
                  <div className="mx-4 mb-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
                    <p className="flex items-start gap-2 text-xs text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span className="break-words">
                        {editingSubscriptionData.lastErrorMessage}
                      </span>
                    </p>
                  </div>
                )}

                {/* Source Section */}
                <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-t border-border/50 mt-1">
                  Source
                </div>
                <div className="px-4 pb-3 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Feed URL
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={editingSubscriptionData?.url ?? ""}
                      placeholder={
                        editingSubscriptionData ? undefined : "Loading\u2026"
                      }
                      readOnly
                      className="h-8 text-xs font-mono"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        if (!editingSubscriptionData) return;
                        try {
                          await navigator.clipboard.writeText(
                            editingSubscriptionData.url,
                          );
                          toast.success("Feed URL copied to clipboard");
                        } catch {
                          toast.error("Unable to copy link automatically");
                        }
                      }}
                      disabled={!editingSubscriptionData}
                      className="h-8 px-2"
                      title="Copy URL"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Action Buttons */}
          <div className="border-t border-border/50 px-4 py-3 flex items-center justify-between shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                editingSubscriptionData &&
                handleDeleteSubscription(editingSubscriptionData)
              }
              disabled={loading || !editingSubscriptionData}
              className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Remove
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleUpdateSubscription}
              disabled={loading || !editingSubscriptionData}
              className="h-8"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );

  const deleteConfirmDialog = (
    <Dialog
      open={!!pendingDelete}
      onOpenChange={(open) => !open && setPendingDelete(null)}
    >
      <DialogContent
        showClose={false}
        className="max-w-md p-0 overflow-hidden bg-popover border-border/50 shadow-2xl"
      >
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>Remove subscription?</DialogTitle>
          <DialogDescription>
            Remove &ldquo;{pendingDelete?.name}&rdquo;? The read-only calendar
            and its synced events will be deleted.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="px-5 py-4 border-t border-border/50 gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPendingDelete(null)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              if (pendingDelete) {
                deleteMutation.mutate(pendingDelete.id);
              }
              setPendingDelete(null);
            }}
          >
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // When used standalone (with onOpenChange), wrap in Dialog
  if (onOpenChange) {
    return (
      <>
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
        {deleteConfirmDialog}
      </>
    );
  }

  // When embedded in command palette, return content directly
  return (
    <>
      {content}
      {deleteConfirmDialog}
    </>
  );
}
