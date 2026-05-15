"use client";

import { useState, type ChangeEvent } from "react";
import { calendarApiService } from "@/lib/calendar-api-service";
import {
  getErrorMessage,
  partitionCalendarsByKind,
} from "@/lib/calendar-ui-helpers";
import { useCalendarData } from "@/hooks/use-calendar-data";
import { useCommandPalette } from "@/components/command-palette-context";
import type { PaletteView } from "@/components/command-palette/constants";
import type {
  ApiError,
  Calendar,
  CalendarSubscription,
  CalendarShareLink,
  CreateCalendarRequest,
  UpdateCalendarRequest,
  CalendarDeleteAction,
  ImportICSResponse,
} from "@/lib/types/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@workspace/ui/components/ui/dialog";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/ui/select";
import { Switch } from "@workspace/ui/components/ui/switch";
import { Badge } from "@workspace/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/ui/card";
import { ColorPicker } from "@workspace/ui/components/ui/color-picker";
import { getColorSwatchValue } from "@workspace/ui/components/calendar";
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/ui/radio-group";
import { SubscriptionManagement } from "./subscription-management";
import { useCalendarContext } from "@workspace/ui/components/calendar";
import {
  Plus,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  Star,
  AlertTriangle,
  MoveRight,
  AlertCircle,
  Settings,
  Upload,
  FileText,
  ExternalLink,
  Globe,
  Share2,
  Copy,
  RefreshCw,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

const PRESET_COLORS = [
  { value: "blue", label: "Blue" },
  { value: "emerald", label: "Emerald" },
  { value: "orange", label: "Orange" },
  { value: "violet", label: "Violet" },
  { value: "rose", label: "Rose" },
  { value: "red", label: "Red" },
  { value: "cyan", label: "Cyan" },
  { value: "lime", label: "Lime" },
  { value: "amber", label: "Amber" },
  { value: "indigo", label: "Indigo" },
  { value: "pink", label: "Pink" },
  { value: "teal", label: "Teal" },
];

const ALLOWED_COLOR_VALUES = PRESET_COLORS.map((c) => c.value);

const calendarFormSchema = z.object({
  name: z.string().trim().min(1, "Calendar name is required").max(100),
  color: z
    .string()
    .trim()
    .refine((value) => {
      return (
        ALLOWED_COLOR_VALUES.includes(value) ||
        /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(value)
      );
    }, "Please select a valid color"),
});

interface CalendarManagementProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function useCalendarManagementState(
  open: boolean,
  onOpenChange: (open: boolean) => void,
) {
  const queryClient = useQueryClient();
  const { calendars, refetchCalendars, updateCalendar, createCalendar } =
    useCalendarData();
  const { toggleCalendarVisibility, isCalendarVisible } = useCalendarContext();
  const { openCalendarManagement } = useCommandPalette();
  const { ownedCalendars, publicCalendars, subscribedCalendars } =
    partitionCalendarsByKind(calendars);
  const { data: subscriptions = [] } = useQuery<
    CalendarSubscription[],
    ApiError
  >({
    queryKey: ["subscriptions"],
    queryFn: () => calendarApiService.getSubscriptions(),
    enabled: open,
  });
  const subscriptionByCalendarId = new Map<string, CalendarSubscription>(
    subscriptions.map((subscription) => [
      subscription.calendar.id,
      subscription,
    ]),
  );

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<Calendar | null>(null);
  const [deletingCalendar, setDeletingCalendar] = useState<Calendar | null>(
    null,
  );
  const [deleteAction, setDeleteAction] =
    useState<CalendarDeleteAction>("delete_events");
  const [targetCalendarId, setTargetCalendarId] = useState<string>("");

  const [newCalendar, setNewCalendar] = useState({
    name: "",
    color: "blue",
    isDefault: false,
  });

  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importCalendarId, setImportCalendarId] = useState<string>("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<ImportICSResponse | null>(
    null,
  );
  const [sharingCalendar, setSharingCalendar] = useState<Calendar | null>(null);
  const [shareLinkInfo, setShareLinkInfo] = useState<CalendarShareLink | null>(
    null,
  );
  const [shareLinkLoading, setShareLinkLoading] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [showSubscriptionDialog, setShowSubscriptionDialog] = useState(false);
  const [subscriptionView, setSubscriptionView] = useState<PaletteView>("subscriptions");
  const [pendingUnsubscribe, setPendingUnsubscribe] = useState<{
    subscriptionId: string;
    calendarName: string;
    action: string;
  } | null>(null);
  const [validationErrors, setValidationErrors] = useState<{
    name?: string;
    color?: string;
    general?: string;
  }>({});

  // Mutations
  const deleteCalendarMutation = useMutation({
    mutationFn: async (data: {
      id: string;
      action: CalendarDeleteAction;
      targetId?: string;
    }) => {
      await calendarApiService.deleteCalendarAdvanced(
        data.id,
        data.action,
        data.targetId,
      );
    },
    onSuccess: async () => {
      await refetchCalendars();
      await queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      setDeletingCalendar(null);
      setDeleteAction("delete_events");
      setTargetCalendarId("");
      toast.success("Calendar deleted successfully!");
      // Also invalidate events since they might have been moved or deleted
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (error: ApiError) => {
      toast.error(getErrorMessage(error, "Failed to delete calendar"));
    },
  });

  const deleteSubscriptionMutation = useMutation({
    mutationFn: async (subscriptionId: string) =>
      calendarApiService.deleteSubscription(subscriptionId),
    onSuccess: async () => {
      await refetchCalendars();
      await queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success("Calendar removed successfully!");
    },
    onError: (error: ApiError) => {
      toast.error(getErrorMessage(error, "Failed to remove calendar"));
    },
  });

  const importICSMutation = useMutation({
    mutationFn: async (data: { calendarId: string; file: File }) => {
      const fileContent = await data.file.text();
      return calendarApiService.importICS({
        calendarId: data.calendarId,
        icsContent: fileContent,
        fileName: data.file.name,
      });
    },
    onSuccess: async (response) => {
      setImportResult(response);

      if (response.eventsCreated > 0) {
        toast.success(
          `Successfully imported ${response.eventsCreated} events from ${importFile?.name}`,
        );
        await refetchCalendars();
        queryClient.invalidateQueries({ queryKey: ["events"] });
      }

      if (!response.errors || response.errors.length === 0) {
        setTimeout(() => {
          setShowImportDialog(false);
          setImportFile(null);
          setImportCalendarId("");
          setImportResult(null);
        }, 2000);
      }
    },
    onError: (error: ApiError) => {
      toast.error(getErrorMessage(error, "Failed to import ICS file"));
    },
  });

  const loading =
    deleteCalendarMutation.isPending ||
    deleteSubscriptionMutation.isPending ||
    importICSMutation.isPending ||
    shareLinkLoading;

  const validateCalendarForm = () => {
    const errors: { name?: string; color?: string; general?: string } = {};

    const parsed = calendarFormSchema.safeParse(newCalendar);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "name") {
          errors.name = issue.message;
        }
        if (issue.path[0] === "color") {
          errors.color = issue.message;
        }
      }
    }

    // Check for duplicate names (case-insensitive)
    const existingNames = calendars.map((cal) => cal.name.toLowerCase());
    if (existingNames.includes(newCalendar.name.trim().toLowerCase())) {
      errors.name = "A calendar with this name already exists";
    }
    return errors;
  };

  const handleCreateCalendar = async () => {
    // Clear any previous errors
    setValidationErrors({});

    // Validate form
    const errors = validateCalendarForm();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    try {
      const calendarData: CreateCalendarRequest = {
        name: newCalendar.name.trim(),
        color: newCalendar.color,
        isDefault: newCalendar.isDefault,
      };

      await createCalendar(calendarData);
      setNewCalendar({ name: "", color: "blue", isDefault: false });
      setShowCreateForm(false);
      setValidationErrors({});
      toast.success("Calendar created successfully!");
    } catch (error: unknown) {
      // Handle specific API errors
      const message = getErrorMessage(error, "Failed to create calendar.");
      if (message.includes("already exists")) {
        setValidationErrors({
          name: "A calendar with this name already exists",
        });
      } else if (message.includes("name is required")) {
        setValidationErrors({ name: "Calendar name is required" });
      } else if (message.includes("exceed 100 characters")) {
        setValidationErrors({
          name: "Calendar name cannot exceed 100 characters",
        });
      } else if (message.includes("Color must be")) {
        setValidationErrors({ color: "Please select a valid color" });
      } else {
        // Generic error fallback
        toast.error(message);
      }
    }
  };

  const validateEditCalendarForm = (
    name: string,
    currentCalendarId: string,
  ) => {
    const errors: { name?: string; color?: string; general?: string } = {};

    const parsed = calendarFormSchema.shape.name.safeParse(name);
    if (!parsed.success) {
      errors.name = parsed.error.issues[0]?.message || "Invalid calendar name";
    }

    const existingNames: string[] = [];
    for (const cal of calendars) {
      if (cal.id !== currentCalendarId) existingNames.push(cal.name.toLowerCase());
    }
    if (existingNames.includes(name.trim().toLowerCase())) {
      errors.name = "A calendar with this name already exists";
    }

    return errors;
  };

  const handleUpdateCalendar = async (
    calendar: Calendar,
    updates: Partial<UpdateCalendarRequest>,
  ) => {
    setValidationErrors({});

    if (updates.name) {
      const errors = validateEditCalendarForm(updates.name, calendar.id);
      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors);
        return;
      }
    }

    try {
      await updateCalendar(calendar.id, updates);
      toast.success("Calendar updated successfully!");
      return true;
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Failed to update calendar.");
      if (message.includes("already exists")) {
        setValidationErrors({
          name: "A calendar with this name already exists",
        });
      } else if (message.includes("name is required")) {
        setValidationErrors({ name: "Calendar name is required" });
      } else if (message.includes("exceed 100 characters")) {
        setValidationErrors({
          name: "Calendar name cannot exceed 100 characters",
        });
      } else if (message.includes("Color must be")) {
        setValidationErrors({ color: "Please select a valid color" });
      } else {
        toast.error(message);
      }
      return false; // Indicate failure
    }
  };

  const handleDeleteCalendar = async () => {
    if (!deletingCalendar) return;
    deleteCalendarMutation.mutate({
      id: deletingCalendar.id,
      action: deleteAction,
      targetId: targetCalendarId || undefined,
    });
  };

  const handleToggleVisibility = (calendar: Calendar) => {
    toggleCalendarVisibility(calendar.id);
  };

  const handleRemoveSubscribedCalendar = (calendar: Calendar) => {
    const subscription = subscriptionByCalendarId.get(calendar.id);
    if (!subscription) {
      toast.error("Unable to find the backing subscription for this calendar.");
      return;
    }

    const action =
      calendar.kind === "public_holiday" ? "remove" : "unsubscribe from";

    setPendingUnsubscribe({
      subscriptionId: subscription.id,
      calendarName: calendar.name,
      action,
    });
  };

  const handleSetDefault = (calendar: Calendar) => {
    handleUpdateCalendar(calendar, { isDefault: true });
  };

  const handleImportICS = async () => {
    if (!importFile || !importCalendarId) return;
    setImportResult(null);
    importICSMutation.mutate({
      calendarId: importCalendarId,
      file: importFile,
    });
  };

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.name.toLowerCase().endsWith(".ics")) {
        toast.error("Please select a valid .ics calendar file");
        return;
      }
      setImportFile(file);
    }
  };

  const availableTargetCalendars = calendars.filter(
    (c) => c.id !== deletingCalendar?.id && !c.isSyncOnly,
  );

  const openShareDialog = async (calendar: Calendar) => {
    setSharingCalendar(calendar);
    setShareLinkInfo(null);
    setShareLinkLoading(true);

    try {
      const shareInfo = await calendarApiService.getCalendarShareLink(
        calendar.id,
      );
      setShareLinkInfo(shareInfo);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to load calendar share link"));
    } finally {
      setShareLinkLoading(false);
    }
  };

  const handleEnableShareLink = async (regenerate = false) => {
    if (!sharingCalendar) return;

    setShareLinkLoading(true);

    try {
      const response = await calendarApiService.enableCalendarShareLink(
        sharingCalendar.id,
        { regenerate },
      );
      setShareLinkInfo(response);
      toast.success(
        regenerate
          ? "Calendar share link regenerated successfully"
          : "Calendar share link enabled successfully",
      );
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to enable calendar share link"));
    } finally {
      setShareLinkLoading(false);
    }
  };

  const handleDisableShareLink = async () => {
    if (!sharingCalendar) return;

    setShareLinkLoading(true);

    try {
      await calendarApiService.disableCalendarShareLink(sharingCalendar.id);
      setShareLinkInfo({
        calendarId: sharingCalendar.id,
        calendarName: sharingCalendar.name,
        enabled: false,
        shareUrl: null,
      });
      toast.success("Calendar share link disabled successfully");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to disable calendar share link"));
    } finally {
      setShareLinkLoading(false);
    }
  };

  const handleCopyShareLink = async () => {
    if (!shareLinkInfo?.shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareLinkInfo.shareUrl);
      toast.success("Share link copied to clipboard");
    } catch {
      toast.error("Unable to copy link automatically. Please copy it manually.");
    }
  };

  const handleToggleShareLink = async (enabled: boolean) => {
    if (!sharingCalendar) return;

    if (enabled) {
      await handleEnableShareLink(false);
      return;
    }

    await handleDisableShareLink();
  };

  const handleRegenerateShareLinkConfirmed = async () => {
    setShowRegenerateConfirm(false);
    await handleEnableShareLink(true);
  };

  return {
    queryClient,
    calendars,
    refetchCalendars,
    updateCalendar,
    createCalendar,
    toggleCalendarVisibility,
    isCalendarVisible,
    openCalendarManagement,
    ownedCalendars,
    publicCalendars,
    subscribedCalendars,
    subscriptions,
    subscriptionByCalendarId,
    showCreateForm,
    setShowCreateForm,
    editingCalendar,
    setEditingCalendar,
    deletingCalendar,
    setDeletingCalendar,
    deleteAction,
    setDeleteAction,
    targetCalendarId,
    setTargetCalendarId,
    newCalendar,
    setNewCalendar,
    showImportDialog,
    setShowImportDialog,
    importCalendarId,
    setImportCalendarId,
    importFile,
    setImportFile,
    importResult,
    setImportResult,
    sharingCalendar,
    setSharingCalendar,
    shareLinkInfo,
    setShareLinkInfo,
    shareLinkLoading,
    setShareLinkLoading,
    showRegenerateConfirm,
    setShowRegenerateConfirm,
    showSubscriptionDialog,
    setShowSubscriptionDialog,
    subscriptionView,
    setSubscriptionView,
    pendingUnsubscribe,
    setPendingUnsubscribe,
    validationErrors,
    setValidationErrors,
    deleteCalendarMutation,
    deleteSubscriptionMutation,
    importICSMutation,
    loading,
    validateCalendarForm,
    handleCreateCalendar,
    validateEditCalendarForm,
    handleUpdateCalendar,
    handleDeleteCalendar,
    handleToggleVisibility,
    handleRemoveSubscribedCalendar,
    handleSetDefault,
    handleImportICS,
    handleFileSelect,
    availableTargetCalendars,
    openShareDialog,
    handleEnableShareLink,
    handleDisableShareLink,
    handleCopyShareLink,
    handleToggleShareLink,
    handleRegenerateShareLinkConfirmed,
    onOpenChange,
  };
}

type SubState = ReturnType<typeof useCalendarManagementState>;

function CreateCalendarCard(s: SubState) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <span>Create New Calendar</span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                s.onOpenChange(false);
                s.openCalendarManagement();
              }}
              title="Calendar Settings"
            >
              <Settings className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                s.setShowSubscriptionDialog(true);
              }}
              title="Subscribe to external calendars"
            >
              <ExternalLink className="size-4 mr-1" />
              Subscriptions
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                s.setShowImportDialog(true);
                s.setImportResult(null);
              }}
              title="Import .ics file"
            >
              <Upload className="size-4 mr-1" />
              Import ICS
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                s.setShowCreateForm(!s.showCreateForm);
                s.setValidationErrors({});
              }}
            >
              <Plus className="size-4 mr-1" />
              New Calendar
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      {s.showCreateForm && (
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newCalendarName">Calendar Name</Label>
            <Input
              id="newCalendarName"
              value={s.newCalendar.name}
              onChange={(e) => {
                s.setNewCalendar({ ...s.newCalendar, name: e.target.value });
                if (s.validationErrors.name) {
                  s.setValidationErrors((prev) => ({ ...prev, name: undefined }));
                }
              }}
              placeholder="Enter calendar name"
              className={
                s.validationErrors.name
                  ? "border-destructive focus-visible:ring-destructive"
                  : ""
              }
            />
            {s.validationErrors.name && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="size-3" />
                {s.validationErrors.name}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <ColorPicker
              value={s.newCalendar.color}
              onChange={(color) => {
                s.setNewCalendar({ ...s.newCalendar, color });
                if (s.validationErrors.color) {
                  s.setValidationErrors((prev) => ({ ...prev, color: undefined }));
                }
              }}
              presetColors={PRESET_COLORS}
            />
            {s.validationErrors.color && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="size-3" />
                {s.validationErrors.color}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="newCalendarDefault"
              checked={s.newCalendar.isDefault}
              onCheckedChange={(checked) =>
                s.setNewCalendar((prev) => ({ ...prev, isDefault: checked }))
              }
            />
            <Label htmlFor="newCalendarDefault">Set as default calendar</Label>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={s.handleCreateCalendar} disabled={s.loading}>
              Create Calendar
            </Button>
            <Button variant="outline" onClick={() => s.setShowCreateForm(false)}>
              Cancel
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function ExistingCalendarsSection(s: SubState) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Your Calendars</h3>
        <div className="space-y-2">
          {s.ownedCalendars.map((calendar) => (
            <Card key={calendar.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="size-4 rounded"
                      style={{ backgroundColor: getColorSwatchValue(calendar.color) }}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{calendar.name}</span>
                        {calendar.isSyncOnly && (
                          <Badge variant="secondary" className="text-xs bg-muted">
                            <ExternalLink className="size-3 mr-1" />
                            Synced
                          </Badge>
                        )}
                        {calendar.isDefault && (
                          <Badge variant="outline" className="text-xs">
                            <Star className="size-3 mr-1" />
                            Default
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {calendar.isSyncOnly ? "Read-only \u00B7 " : ""}
                        {s.isCalendarVisible(calendar.id) ? "Visible" : "Hidden"}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => s.handleToggleVisibility(calendar)}
                      title={s.isCalendarVisible(calendar.id) ? "Hide calendar" : "Show calendar"}
                    >
                      {s.isCalendarVisible(calendar.id) ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    </Button>
                    {!calendar.isSyncOnly && !calendar.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => s.handleSetDefault(calendar)}
                        title="Set as default calendar"
                      >
                        <Star className="size-4" />
                      </Button>
                    )}
                    {!calendar.isSyncOnly && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => s.openShareDialog(calendar)}
                        title="Share calendar as ICS"
                        className="h-8 px-2 text-xs"
                      >
                        <Share2 className="size-3.5 mr-1" />
                        Share
                      </Button>
                    )}
                    {!calendar.isSyncOnly && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { s.setEditingCalendar(calendar); s.setValidationErrors({}); }}
                        title="Edit calendar"
                      >
                        <Edit className="size-4" />
                      </Button>
                    )}
                    {!calendar.isSyncOnly && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => s.setDeletingCalendar(calendar)}
                        title="Delete calendar"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {s.publicCalendars.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Public Calendars</h3>
          <div className="space-y-2">
            {s.publicCalendars.map((calendar) => (
              <Card key={calendar.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="size-4 rounded"
                        style={{ backgroundColor: getColorSwatchValue(calendar.color) }}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{calendar.name}</span>
                          <Badge variant="secondary" className="text-xs bg-primary/10 text-primary">
                            <Globe className="size-3 mr-1" />
                            Public
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Read-only public holiday calendar &middot;{" "}
                          {s.isCalendarVisible(calendar.id) ? "Visible" : "Hidden"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => s.handleToggleVisibility(calendar)}
                        title={s.isCalendarVisible(calendar.id) ? "Hide calendar" : "Show calendar"}
                      >
                        {s.isCalendarVisible(calendar.id) ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => s.handleRemoveSubscribedCalendar(calendar)}
                        title="Remove public calendar"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {s.subscribedCalendars.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Subscribed Calendars</h3>
          <div className="space-y-2">
            {s.subscribedCalendars.map((calendar) => (
              <Card key={calendar.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="size-4 rounded"
                        style={{ backgroundColor: getColorSwatchValue(calendar.color) }}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{calendar.name}</span>
                          <Badge variant="secondary" className="text-xs bg-muted">
                            <ExternalLink className="size-3 mr-1" />
                            Subscribed
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Read-only external calendar &middot;{" "}
                          {s.isCalendarVisible(calendar.id) ? "Visible" : "Hidden"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => s.handleToggleVisibility(calendar)}
                        title={s.isCalendarVisible(calendar.id) ? "Hide calendar" : "Show calendar"}
                      >
                        {s.isCalendarVisible(calendar.id) ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => s.handleRemoveSubscribedCalendar(calendar)}
                        title="Remove subscribed calendar"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EditCalendarDialog(s: SubState) {
  return (
    <Dialog
      open={!!s.editingCalendar}
      onOpenChange={(open) => !open && s.setEditingCalendar(null)}
    >
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Edit Calendar</DialogTitle>
        </DialogHeader>

        {s.editingCalendar && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editCalendarName">Calendar Name</Label>
              <Input
                id="editCalendarName"
                value={s.editingCalendar.name}
                onChange={(e) => {
                  s.setEditingCalendar((prev) => ({ ...prev, name: e.target.value }));
                  if (s.validationErrors.name) {
                    s.setValidationErrors((prev) => ({ ...prev, name: undefined }));
                  }
                }}
                className={
                  s.validationErrors.name
                    ? "border-destructive focus-visible:ring-destructive"
                    : ""
                }
              />
              {s.validationErrors.name && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="size-3" />
                  {s.validationErrors.name}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <ColorPicker
                value={s.editingCalendar.color}
                onChange={(color) => {
                  s.setEditingCalendar((prev) => ({ ...prev, color }));
                  if (s.validationErrors.color) {
                    s.setValidationErrors((prev) => ({ ...prev, color: undefined }));
                  }
                }}
                presetColors={PRESET_COLORS}
              />
              {s.validationErrors.color && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="size-3" />
                  {s.validationErrors.color}
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {s.editingCalendar && (
            <Button
              variant="outline"
              onClick={() => {
                const selectedCalendar = s.editingCalendar!;
                s.setEditingCalendar(null);
                void s.openShareDialog(selectedCalendar);
              }}
            >
              <Share2 className="size-4 mr-2" />
              Share
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => { s.setEditingCalendar(null); s.setValidationErrors({}); }}
          >
            Cancel
          </Button>
          <Button
            onClick={async () => {
              if (s.editingCalendar) {
                const success = await s.handleUpdateCalendar(s.editingCalendar, {
                  name: s.editingCalendar.name,
                  color: s.editingCalendar.color,
                });
                if (success) s.setEditingCalendar(null);
              }
            }}
            disabled={s.loading}
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCalendarDialog(s: SubState) {
  return (
    <Dialog
      open={!!s.deletingCalendar}
      onOpenChange={(open) => !open && s.setDeletingCalendar(null)}
    >
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            Delete Calendar
          </DialogTitle>
          <DialogDescription>
            You&apos;re about to delete &quot;{s.deletingCalendar?.name}&quot;.
            What would you like to do with existing events?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup
            value={s.deleteAction}
            onValueChange={(value) =>
              s.setDeleteAction(value as import("@/lib/types/calendar").CalendarDeleteAction)
            }
          >
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <RadioGroupItem value="delete_events" id="delete_events" className="mt-1" />
                <div className="space-y-1">
                  <Label htmlFor="delete_events" className="font-medium cursor-pointer">
                    Delete calendar and all events (default)
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Permanently delete the calendar and all its events
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <RadioGroupItem value="move_events" id="move_events" className="mt-1" />
                <div className="space-y-1">
                  <Label htmlFor="move_events" className="font-medium cursor-pointer">
                    Move events to another calendar
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Select a calendar to move events to
                  </p>
                </div>
              </div>

              {s.deleteAction === "move_events" && (
                <div className="ml-7">
                  <Select value={s.targetCalendarId} onValueChange={s.setTargetCalendarId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select target calendar" />
                    </SelectTrigger>
                    <SelectContent>
                      {s.availableTargetCalendars.map((cal) => (
                        <SelectItem key={cal.id} value={cal.id}>
                          {cal.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </RadioGroup>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => s.setDeletingCalendar(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={s.handleDeleteCalendar}
            disabled={s.loading || (s.deleteAction === "move_events" && !s.targetCalendarId)}
          >
            {s.loading ? "Deleting..." : "Delete Calendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportICSDialog(s: SubState) {
  return (
    <Dialog
      open={s.showImportDialog}
      onOpenChange={(open) => {
        s.setShowImportDialog(open);
        if (!open) {
          s.setImportFile(null);
          s.setImportCalendarId("");
          s.setImportResult(null);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Calendar (ICS)</DialogTitle>
          <DialogDescription>
            Import events from an .ics file into one of your calendars.
          </DialogDescription>
        </DialogHeader>

        {s.importResult ? (
          <div className="space-y-4">
            <div className="p-4 rounded-md bg-muted">
              <h4 className="font-medium mb-2">Import Summary</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Total Events Found:</span>
                  <span className="font-medium">{s.importResult.eventsTotal}</span>
                </div>
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>Events Created:</span>
                  <span className="font-medium">{s.importResult.eventsCreated}</span>
                </div>
              </div>
            </div>

            {s.importResult.errors && s.importResult.errors.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-destructive flex items-center gap-2">
                  <AlertTriangle className="size-4" />
                  Errors ({s.importResult.errors.length})
                </h4>
                <div className="max-h-40 overflow-y-auto text-xs space-y-1 p-2 border rounded-md bg-destructive/10">
                  {s.importResult.errors.map((err) => (
                    <div key={err} className="text-destructive">
                      {err}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button onClick={() => s.setShowImportDialog(false)}>Close</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="importFile">Select .ics File</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="importFile"
                  type="file"
                  accept=".ics"
                  onChange={s.handleFileSelect}
                  className="cursor-pointer"
                />
              </div>
              {s.importFile && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="size-4" />
                  {s.importFile.name} ({(s.importFile.size / 1024).toFixed(1)} KB)
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="importCalendar">Target Calendar</Label>
              <Select value={s.importCalendarId} onValueChange={s.setImportCalendarId}>
                <SelectTrigger id="importCalendar">
                  <SelectValue placeholder="Select calendar" />
                </SelectTrigger>
                <SelectContent>
                  {s.calendars
                    .filter((c) => !c.isSyncOnly)
                    .map((cal) => (
                      <SelectItem key={cal.id} value={cal.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="size-3 rounded-full"
                            style={{ backgroundColor: getColorSwatchValue(cal.color) }}
                          />
                          {cal.name}
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => s.setShowImportDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={s.handleImportICS}
                disabled={s.loading || !s.importFile || !s.importCalendarId}
              >
                {s.loading ? "Importing..." : "Import Events"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ShareCalendarDialog(s: SubState) {
  return (
    <>
      <Dialog
        open={!!s.sharingCalendar}
        onOpenChange={(open) => {
          if (!open) {
            s.setSharingCalendar(null);
            s.setShareLinkInfo(null);
            s.setShareLinkLoading(false);
            s.setShowRegenerateConfirm(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Calendar as ICS</DialogTitle>
            <DialogDescription>
              Enable a public .ics subscription link for{" "}
              <strong>{s.sharingCalendar?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">ICS Sharing</p>
                  <p className="text-xs text-muted-foreground">
                    Turn this on to generate a private URL that anyone with the
                    link can subscribe to.
                  </p>
                </div>
                <Switch
                  checked={!!s.shareLinkInfo?.enabled}
                  onCheckedChange={(checked) => { void s.handleToggleShareLink(checked); }}
                  disabled={s.shareLinkLoading}
                />
              </div>

              {s.shareLinkLoading ? (
                <div className="text-sm text-muted-foreground">
                  Updating share settings&hellip;
                </div>
              ) : s.shareLinkInfo?.enabled && s.shareLinkInfo.shareUrl ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="shareLink">Subscription URL</Label>
                    <div className="flex items-center gap-2">
                      <Input id="shareLink" value={s.shareLinkInfo.shareUrl} readOnly />
                      <Button type="button" variant="outline" onClick={s.handleCopyShareLink}>
                        <Copy className="size-4 mr-1" />
                        Copy
                      </Button>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => s.setShowRegenerateConfirm(true)}
                    disabled={s.shareLinkLoading}
                  >
                    <RefreshCw className="size-4 mr-1" />
                    Regenerate URL
                  </Button>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Link2 className="size-4" />
                  Sharing is currently off. Enable it to create a subscription link.
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => s.setSharingCalendar(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={s.showRegenerateConfirm} onOpenChange={s.setShowRegenerateConfirm}>
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
                <AlertTriangle className="size-4 mt-0.5 text-destructive shrink-0" />
                The current URL stops working immediately. Everyone using it
                must subscribe again with the new URL.
              </p>
            </div>
          </div>
          <DialogFooter className="px-5 py-4 border-t border-border/50 gap-2">
            <Button size="sm" variant="outline" onClick={() => s.setShowRegenerateConfirm(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => { void s.handleRegenerateShareLinkConfirmed(); }}
              disabled={s.shareLinkLoading}
            >
              Confirm Regenerate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!s.pendingUnsubscribe}
        onOpenChange={(open) => !open && s.setPendingUnsubscribe(null)}
      >
        <DialogContent
          showClose={false}
          className="max-w-md p-0 overflow-hidden bg-popover border-border/50 shadow-2xl"
        >
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle>
              {s.pendingUnsubscribe?.action === "remove"
                ? "Remove calendar?"
                : "Unsubscribe from calendar?"}
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to {s.pendingUnsubscribe?.action}{" "}
              &ldquo;{s.pendingUnsubscribe?.calendarName}&rdquo;? The read-only
              calendar and its synced events will be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="px-5 py-4 border-t border-border/50 gap-2">
            <Button size="sm" variant="outline" onClick={() => s.setPendingUnsubscribe(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (s.pendingUnsubscribe) {
                  s.deleteSubscriptionMutation.mutate(s.pendingUnsubscribe.subscriptionId);
                }
                s.setPendingUnsubscribe(null);
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface CalendarManagementProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CalendarManagement({ open, onOpenChange }: CalendarManagementProps) {
  const s = useCalendarManagementState(open, onOpenChange);
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[calc(90dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Calendars</DialogTitle>
            <DialogDescription>
              Create, edit, and organize your calendars
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <CreateCalendarCard {...s} />
            <ExistingCalendarsSection {...s} />
          </div>
        </DialogContent>
      </Dialog>
      <EditCalendarDialog {...s} />
      <DeleteCalendarDialog {...s} />
      <ImportICSDialog {...s} />
      <SubscriptionManagement
        open={s.showSubscriptionDialog}
        onOpenChange={(open) => {
          s.setShowSubscriptionDialog(open);
          if (!open) s.setSubscriptionView("subscriptions");
        }}
        onBack={() => {
          if (s.subscriptionView !== "subscriptions") {
            s.setSubscriptionView("subscriptions");
          } else {
            s.setShowSubscriptionDialog(false);
          }
        }}
        currentView={s.subscriptionView}
        onNavigateTo={s.setSubscriptionView}
      />
      <ShareCalendarDialog {...s} />
    </>
  );
}
