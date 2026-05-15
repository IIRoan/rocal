"use client";

import { useState, type ChangeEvent } from "react";
import { calendarApiService } from "@/lib/calendar-api-service";
import {
  getErrorMessage,
  partitionCalendarsByKind,
} from "@/lib/calendar-ui-helpers";
import { useCalendarData } from "@/hooks/use-calendar-data";
import { useCommandPalette } from "@/components/command-palette-context";
import type { PaletteView } from "@/components/command-palette/index";
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

export function CalendarManagement({
  open,
  onOpenChange,
}: CalendarManagementProps) {
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
  const [subscriptionView, setSubscriptionView] =
    useState<PaletteView>("subscriptions");
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

    // Check for duplicate names (excluding current calendar)
    const existingNames = calendars
      .filter((cal) => cal.id !== currentCalendarId)
      .map((cal) => cal.name.toLowerCase());
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

    // Validate if name is being updated
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
      return true; // Indicate success
    } catch (error: unknown) {
      // Handle specific API errors
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
      toast.error(
        getErrorMessage(error, "Failed to enable calendar share link"),
      );
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
      toast.error(
        getErrorMessage(error, "Failed to disable calendar share link"),
      );
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
      toast.error(
        "Unable to copy link automatically. Please copy it manually.",
      );
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
            {/* Create New Calendar */}
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <span>Create New Calendar</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        onOpenChange(false);
                        openCalendarManagement();
                      }}
                      title="Calendar Settings"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowSubscriptionDialog(true);
                      }}
                      title="Subscribe to external calendars"
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Subscriptions
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowImportDialog(true);
                        setImportResult(null);
                      }}
                      title="Import .ics file"
                    >
                      <Upload className="h-4 w-4 mr-1" />
                      Import ICS
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowCreateForm(!showCreateForm);
                        // Clear errors when opening/closing form
                        setValidationErrors({});
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      New Calendar
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              {showCreateForm && (
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="newCalendarName">Calendar Name</Label>
                    <Input
                      id="newCalendarName"
                      value={newCalendar.name}
                      onChange={(e) => {
                        setNewCalendar({
                          ...newCalendar,
                          name: e.target.value,
                        });
                        // Clear name error when user starts typing
                        if (validationErrors.name) {
                          setValidationErrors({
                            ...validationErrors,
                            name: undefined,
                          });
                        }
                      }}
                      placeholder="Enter calendar name"
                      className={
                        validationErrors.name
                          ? "border-destructive focus-visible:ring-destructive"
                          : ""
                      }
                    />
                    {validationErrors.name && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {validationErrors.name}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Color</Label>
                    <ColorPicker
                      value={newCalendar.color}
                      onChange={(color) => {
                        setNewCalendar({
                          ...newCalendar,
                          color,
                        });
                        // Clear color error when user selects a new color
                        if (validationErrors.color) {
                          setValidationErrors({
                            ...validationErrors,
                            color: undefined,
                          });
                        }
                      }}
                      presetColors={PRESET_COLORS}
                    />
                    {validationErrors.color && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {validationErrors.color}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="newCalendarDefault"
                      checked={newCalendar.isDefault}
                      onCheckedChange={(checked) =>
                        setNewCalendar({ ...newCalendar, isDefault: checked })
                      }
                    />
                    <Label htmlFor="newCalendarDefault">
                      Set as default calendar
                    </Label>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button onClick={handleCreateCalendar} disabled={loading}>
                      Create Calendar
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowCreateForm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Existing Calendars */}
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Your Calendars</h3>
              <div className="space-y-2">
                {ownedCalendars.map((calendar) => (
                  <Card key={calendar.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div
                            className="w-4 h-4 rounded"
                            style={{
                              backgroundColor: getColorSwatchValue(
                                calendar.color,
                              ),
                            }}
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {calendar.name}
                              </span>
                              {calendar.isSyncOnly && (
                                <Badge
                                  variant="secondary"
                                  className="text-xs bg-muted"
                                >
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  Synced
                                </Badge>
                              )}
                              {calendar.isDefault && (
                                <Badge variant="outline" className="text-xs">
                                  <Star className="h-3 w-3 mr-1" />
                                  Default
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {calendar.isSyncOnly ? "Read-only \u00B7 " : ""}
                              {isCalendarVisible(calendar.id)
                                ? "Visible"
                                : "Hidden"}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleVisibility(calendar)}
                            title={
                              isCalendarVisible(calendar.id)
                                ? "Hide calendar"
                                : "Show calendar"
                            }
                          >
                            {isCalendarVisible(calendar.id) ? (
                              <Eye className="h-4 w-4" />
                            ) : (
                              <EyeOff className="h-4 w-4" />
                            )}
                          </Button>

                          {!calendar.isSyncOnly && !calendar.isDefault && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSetDefault(calendar)}
                              title="Set as default calendar"
                            >
                              <Star className="h-4 w-4" />
                            </Button>
                          )}

                          {!calendar.isSyncOnly && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openShareDialog(calendar)}
                              title="Share calendar as ICS"
                              className="h-8 px-2 text-xs"
                            >
                              <Share2 className="h-3.5 w-3.5 mr-1" />
                              Share
                            </Button>
                          )}

                          {!calendar.isSyncOnly && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingCalendar(calendar);
                                setValidationErrors({});
                              }}
                              title="Edit calendar"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          )}

                          {!calendar.isSyncOnly && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeletingCalendar(calendar)}
                              title="Delete calendar"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {publicCalendars.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Public Calendars</h3>
                <div className="space-y-2">
                  {publicCalendars.map((calendar) => (
                    <Card key={calendar.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center space-x-3">
                            <div
                              className="w-4 h-4 rounded"
                              style={{
                                backgroundColor: getColorSwatchValue(
                                  calendar.color,
                                ),
                              }}
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  {calendar.name}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className="text-xs bg-primary/10 text-primary"
                                >
                                  <Globe className="h-3 w-3 mr-1" />
                                  Public
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Read-only public holiday calendar ·{" "}
                                {isCalendarVisible(calendar.id)
                                  ? "Visible"
                                  : "Hidden"}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleVisibility(calendar)}
                              title={
                                isCalendarVisible(calendar.id)
                                  ? "Hide calendar"
                                  : "Show calendar"
                              }
                            >
                              {isCalendarVisible(calendar.id) ? (
                                <Eye className="h-4 w-4" />
                              ) : (
                                <EyeOff className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleRemoveSubscribedCalendar(calendar)
                              }
                              title="Remove public calendar"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {subscribedCalendars.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Subscribed Calendars</h3>
                <div className="space-y-2">
                  {subscribedCalendars.map((calendar) => (
                    <Card key={calendar.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center space-x-3">
                            <div
                              className="w-4 h-4 rounded"
                              style={{
                                backgroundColor: getColorSwatchValue(
                                  calendar.color,
                                ),
                              }}
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  {calendar.name}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className="text-xs bg-muted"
                                >
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  Subscribed
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Read-only external calendar ·{" "}
                                {isCalendarVisible(calendar.id)
                                  ? "Visible"
                                  : "Hidden"}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleVisibility(calendar)}
                              title={
                                isCalendarVisible(calendar.id)
                                  ? "Hide calendar"
                                  : "Show calendar"
                              }
                            >
                              {isCalendarVisible(calendar.id) ? (
                                <Eye className="h-4 w-4" />
                              ) : (
                                <EyeOff className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleRemoveSubscribedCalendar(calendar)
                              }
                              title="Remove subscribed calendar"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
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
        </DialogContent>
      </Dialog>

      {/* Edit Calendar Dialog */}
      <Dialog
        open={!!editingCalendar}
        onOpenChange={(open) => !open && setEditingCalendar(null)}
      >
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Edit Calendar</DialogTitle>
          </DialogHeader>

          {editingCalendar && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="editCalendarName">Calendar Name</Label>
                <Input
                  id="editCalendarName"
                  value={editingCalendar.name}
                  onChange={(e) => {
                    setEditingCalendar({
                      ...editingCalendar,
                      name: e.target.value,
                    });
                    // Clear name error when user starts typing
                    if (validationErrors.name) {
                      setValidationErrors({
                        ...validationErrors,
                        name: undefined,
                      });
                    }
                  }}
                  className={
                    validationErrors.name
                      ? "border-destructive focus-visible:ring-destructive"
                      : ""
                  }
                />
                {validationErrors.name && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {validationErrors.name}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Color</Label>
                <ColorPicker
                  value={editingCalendar.color}
                  onChange={(color) => {
                    setEditingCalendar({
                      ...editingCalendar,
                      color,
                    });
                    // Clear color error when user selects a new color
                    if (validationErrors.color) {
                      setValidationErrors({
                        ...validationErrors,
                        color: undefined,
                      });
                    }
                  }}
                  presetColors={PRESET_COLORS}
                />
                {validationErrors.color && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {validationErrors.color}
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            {editingCalendar && (
              <Button
                variant="outline"
                onClick={() => {
                  const selectedCalendar = editingCalendar;
                  setEditingCalendar(null);
                  void openShareDialog(selectedCalendar);
                }}
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setEditingCalendar(null);
                setValidationErrors({});
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (editingCalendar) {
                  const success = await handleUpdateCalendar(editingCalendar, {
                    name: editingCalendar.name,
                    color: editingCalendar.color,
                  });
                  // Only close dialog on successful update
                  if (success) {
                    setEditingCalendar(null);
                  }
                }
              }}
              disabled={loading}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Calendar Dialog */}
      <Dialog
        open={!!deletingCalendar}
        onOpenChange={(open) => !open && setDeletingCalendar(null)}
      >
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Calendar
            </DialogTitle>
            <DialogDescription>
              You&apos;re about to delete &quot;{deletingCalendar?.name}&quot;.
              What would you like to do with existing events?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <RadioGroup
              value={deleteAction}
              onValueChange={(value) =>
                setDeleteAction(value as CalendarDeleteAction)
              }
            >
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <RadioGroupItem
                    value="delete_events"
                    id="delete_events"
                    className="mt-1"
                  />
                  <div className="space-y-1">
                    <Label
                      htmlFor="delete_events"
                      className="font-medium cursor-pointer"
                    >
                      Delete calendar and all events (default)
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Permanently delete the calendar and all its events
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <RadioGroupItem
                    value="move_events"
                    id="move_events"
                    className="mt-1"
                  />
                  <div className="space-y-1">
                    <Label
                      htmlFor="move_events"
                      className="font-medium cursor-pointer"
                    >
                      Move events to another calendar
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Select a calendar to move events to
                    </p>
                  </div>
                </div>

                {deleteAction === "move_events" && (
                  <div className="ml-7">
                    <Select
                      value={targetCalendarId}
                      onValueChange={setTargetCalendarId}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select target calendar" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableTargetCalendars.map((cal) => (
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
            <Button variant="outline" onClick={() => setDeletingCalendar(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteCalendar}
              disabled={
                loading || (deleteAction === "move_events" && !targetCalendarId)
              }
            >
              {loading ? "Deleting..." : "Delete Calendar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import ICS Dialog */}
      <Dialog
        open={showImportDialog}
        onOpenChange={(open) => {
          setShowImportDialog(open);
          if (!open) {
            setImportFile(null);
            setImportCalendarId("");
            setImportResult(null);
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

          {importResult ? (
            <div className="space-y-4">
              <div className="p-4 rounded-md bg-muted">
                <h4 className="font-medium mb-2">Import Summary</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Total Events Found:</span>
                    <span className="font-medium">
                      {importResult.eventsTotal}
                    </span>
                  </div>
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Events Created:</span>
                    <span className="font-medium">
                      {importResult.eventsCreated}
                    </span>
                  </div>
                </div>
              </div>

              {importResult.errors && importResult.errors.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm text-destructive flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Errors ({importResult.errors.length})
                  </h4>
                  <div className="max-h-40 overflow-y-auto text-xs space-y-1 p-2 border rounded-md bg-destructive/10">
                    {importResult.errors.map((err, i) => (
                      <div key={i} className="text-destructive">
                        {err}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button onClick={() => setShowImportDialog(false)}>
                  Close
                </Button>
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
                    onChange={handleFileSelect}
                    className="cursor-pointer"
                  />
                </div>
                {importFile && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="importCalendar">Target Calendar</Label>
                <Select
                  value={importCalendarId}
                  onValueChange={setImportCalendarId}
                >
                  <SelectTrigger id="importCalendar">
                    <SelectValue placeholder="Select calendar" />
                  </SelectTrigger>
                  <SelectContent>
                    {calendars
                      .filter((c) => !c.isSyncOnly)
                      .map((cal) => (
                        <SelectItem key={cal.id} value={cal.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{
                                backgroundColor: getColorSwatchValue(cal.color),
                              }}
                            />
                            {cal.name}
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowImportDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleImportICS}
                  disabled={loading || !importFile || !importCalendarId}
                >
                  {loading ? "Importing..." : "Import Events"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Subscription Management Dialog */}
      <SubscriptionManagement
        open={showSubscriptionDialog}
        onOpenChange={(open) => {
          setShowSubscriptionDialog(open);
          if (!open) setSubscriptionView("subscriptions");
        }}
        onBack={() => {
          if (subscriptionView !== "subscriptions") {
            setSubscriptionView("subscriptions");
          } else {
            setShowSubscriptionDialog(false);
          }
        }}
        currentView={subscriptionView}
        onNavigateTo={setSubscriptionView}
      />

      {/* Share Calendar Dialog */}
      <Dialog
        open={!!sharingCalendar}
        onOpenChange={(open) => {
          if (!open) {
            setSharingCalendar(null);
            setShareLinkInfo(null);
            setShareLinkLoading(false);
            setShowRegenerateConfirm(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Calendar as ICS</DialogTitle>
            <DialogDescription>
              Enable a public .ics subscription link for{" "}
              <strong>{sharingCalendar?.name}</strong>.
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
                  checked={!!shareLinkInfo?.enabled}
                  onCheckedChange={(checked) => {
                    void handleToggleShareLink(checked);
                  }}
                  disabled={shareLinkLoading}
                />
              </div>

              {shareLinkLoading ? (
                <div className="text-sm text-muted-foreground">
                  Updating share settings...
                </div>
              ) : shareLinkInfo?.enabled && shareLinkInfo.shareUrl ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="shareLink">Subscription URL</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="shareLink"
                        value={shareLinkInfo.shareUrl}
                        readOnly
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleCopyShareLink}
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        Copy
                      </Button>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowRegenerateConfirm(true)}
                    disabled={shareLinkLoading}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Regenerate URL
                  </Button>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Sharing is currently off. Enable it to create a subscription
                  link.
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSharingCalendar(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                void handleRegenerateShareLinkConfirmed();
              }}
              disabled={shareLinkLoading}
            >
              Confirm Regenerate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!pendingUnsubscribe}
        onOpenChange={(open) => !open && setPendingUnsubscribe(null)}
      >
        <DialogContent
          showClose={false}
          className="max-w-md p-0 overflow-hidden bg-popover border-border/50 shadow-2xl"
        >
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle>
              {pendingUnsubscribe?.action === "remove"
                ? "Remove calendar?"
                : "Unsubscribe from calendar?"}
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to {pendingUnsubscribe?.action} &ldquo;
              {pendingUnsubscribe?.calendarName}&rdquo;? The read-only calendar
              and its synced events will be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="px-5 py-4 border-t border-border/50 gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPendingUnsubscribe(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (pendingUnsubscribe) {
                  deleteSubscriptionMutation.mutate(
                    pendingUnsubscribe.subscriptionId,
                  );
                }
                setPendingUnsubscribe(null);
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
