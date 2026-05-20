"use client";

import { useReducer, type ChangeEvent } from "react";
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
import {
  isValidCalendarColor,
  PRESET_COLOR_OPTIONS,
} from "@workspace/calendar-core";

const PRESET_COLORS = PRESET_COLOR_OPTIONS;

const calendarFormSchema = z.object({
  name: z.string().trim().min(1, "Calendar name is required").max(100),
  color: z
    .string()
    .trim()
    .refine(isValidCalendarColor, "Please select a valid color"),
});

interface CalendarManagementProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CalendarFormDraft {
  name: string;
  color: string;
  isDefault: boolean;
}

interface ValidationErrors {
  name?: string;
  color?: string;
  general?: string;
}

interface PendingUnsubscribe {
  subscriptionId: string;
  calendarName: string;
  action: string;
}

interface CalendarManagementState {
  showCreateForm: boolean;
  editingCalendar: Calendar | null;
  deletingCalendar: Calendar | null;
  deleteAction: CalendarDeleteAction;
  targetCalendarId: string;
  newCalendar: CalendarFormDraft;
  showImportDialog: boolean;
  importCalendarId: string;
  importFile: File | null;
  importResult: ImportICSResponse | null;
  sharingCalendar: Calendar | null;
  shareLinkInfo: CalendarShareLink | null;
  shareLinkLoading: boolean;
  showRegenerateConfirm: boolean;
  showSubscriptionDialog: boolean;
  subscriptionView: PaletteView;
  pendingUnsubscribe: PendingUnsubscribe | null;
  validationErrors: ValidationErrors;
}

type StateUpdater = (state: CalendarManagementState) => CalendarManagementState;
type SetStateValue<T> = T | ((previous: T) => T);

const initialNewCalendar: CalendarFormDraft = {
  name: "",
  color: "blue",
  isDefault: false,
};

const initialCalendarManagementState: CalendarManagementState = {
  showCreateForm: false,
  editingCalendar: null,
  deletingCalendar: null,
  deleteAction: "delete_events",
  targetCalendarId: "",
  newCalendar: initialNewCalendar,
  showImportDialog: false,
  importCalendarId: "",
  importFile: null,
  importResult: null,
  sharingCalendar: null,
  shareLinkInfo: null,
  shareLinkLoading: false,
  showRegenerateConfirm: false,
  showSubscriptionDialog: false,
  subscriptionView: "subscriptions",
  pendingUnsubscribe: null,
  validationErrors: {},
};

function calendarManagementReducer(
  state: CalendarManagementState,
  updater: StateUpdater,
) {
  return updater(state);
}

function resolveStateValue<T>(value: SetStateValue<T>, previous: T): T {
  return typeof value === "function"
    ? (value as (previous: T) => T)(previous)
    : value;
}

function useCalendarManagementState() {
  const [state, dispatch] = useReducer(
    calendarManagementReducer,
    initialCalendarManagementState,
  );

  const setField = <K extends keyof CalendarManagementState>(
    key: K,
    value: SetStateValue<CalendarManagementState[K]>,
  ) => {
    dispatch((current) => ({
      ...current,
      [key]: resolveStateValue(value, current[key]),
    }));
  };

  return {
    state,
    setShowCreateForm: (value: SetStateValue<boolean>) =>
      setField("showCreateForm", value),
    setEditingCalendar: (value: SetStateValue<Calendar | null>) =>
      setField("editingCalendar", value),
    setDeletingCalendar: (value: SetStateValue<Calendar | null>) =>
      setField("deletingCalendar", value),
    setDeleteAction: (value: SetStateValue<CalendarDeleteAction>) =>
      setField("deleteAction", value),
    setTargetCalendarId: (value: SetStateValue<string>) =>
      setField("targetCalendarId", value),
    setNewCalendar: (value: SetStateValue<CalendarFormDraft>) =>
      setField("newCalendar", value),
    setShowImportDialog: (value: SetStateValue<boolean>) =>
      setField("showImportDialog", value),
    setImportCalendarId: (value: SetStateValue<string>) =>
      setField("importCalendarId", value),
    setImportFile: (value: SetStateValue<File | null>) =>
      setField("importFile", value),
    setImportResult: (value: SetStateValue<ImportICSResponse | null>) =>
      setField("importResult", value),
    setSharingCalendar: (value: SetStateValue<Calendar | null>) =>
      setField("sharingCalendar", value),
    setShareLinkInfo: (value: SetStateValue<CalendarShareLink | null>) =>
      setField("shareLinkInfo", value),
    setShareLinkLoading: (value: SetStateValue<boolean>) =>
      setField("shareLinkLoading", value),
    setShowRegenerateConfirm: (value: SetStateValue<boolean>) =>
      setField("showRegenerateConfirm", value),
    setShowSubscriptionDialog: (value: SetStateValue<boolean>) =>
      setField("showSubscriptionDialog", value),
    setSubscriptionView: (value: SetStateValue<PaletteView>) =>
      setField("subscriptionView", value),
    setPendingUnsubscribe: (value: SetStateValue<PendingUnsubscribe | null>) =>
      setField("pendingUnsubscribe", value),
    setValidationErrors: (value: SetStateValue<ValidationErrors>) =>
      setField("validationErrors", value),
  };
}

function useCalendarManagementModel({
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

  const {
    state: {
      showCreateForm,
      editingCalendar,
      deletingCalendar,
      deleteAction,
      targetCalendarId,
      newCalendar,
      showImportDialog,
      importCalendarId,
      importFile,
      importResult,
      sharingCalendar,
      shareLinkInfo,
      shareLinkLoading,
      showRegenerateConfirm,
      showSubscriptionDialog,
      subscriptionView,
      pendingUnsubscribe,
      validationErrors,
    },
    setShowCreateForm,
    setEditingCalendar,
    setDeletingCalendar,
    setDeleteAction,
    setTargetCalendarId,
    setNewCalendar,
    setShowImportDialog,
    setImportCalendarId,
    setImportFile,
    setImportResult,
    setSharingCalendar,
    setShareLinkInfo,
    setShareLinkLoading,
    setShowRegenerateConfirm,
    setShowSubscriptionDialog,
    setSubscriptionView,
    setPendingUnsubscribe,
    setValidationErrors,
  } = useCalendarManagementState();

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
    const normalizedName = name.trim().toLowerCase();
    const nameExists = calendars.some(
      (cal) =>
        cal.id !== currentCalendarId &&
        cal.name.toLowerCase() === normalizedName,
    );
    if (nameExists) {
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

  return {
    managementDialogProps: {
      open,
      onOpenChange,
      openCalendarManagement,
      showCreateForm,
      setShowCreateForm,
      setShowSubscriptionDialog,
      setShowImportDialog,
      setImportResult,
      newCalendar,
      setNewCalendar,
      validationErrors,
      setValidationErrors,
      loading,
      onCreateCalendar: handleCreateCalendar,
      ownedCalendars,
      publicCalendars,
      subscribedCalendars,
      isCalendarVisible,
      onToggleVisibility: handleToggleVisibility,
      onSetDefault: handleSetDefault,
      onOpenShareDialog: openShareDialog,
      setEditingCalendar,
      setDeletingCalendar,
      onRemoveSubscribedCalendar: handleRemoveSubscribedCalendar,
    },
    overlayProps: {
      editingCalendar,
      setEditingCalendar,
      validationErrors,
      setValidationErrors,
      loading,
      onOpenShareDialog: openShareDialog,
      onUpdateCalendar: handleUpdateCalendar,
      deletingCalendar,
      setDeletingCalendar,
      deleteAction,
      setDeleteAction,
      targetCalendarId,
      setTargetCalendarId,
      availableTargetCalendars,
      onDelete: handleDeleteCalendar,
      showImportDialog,
      setShowImportDialog,
      importResult,
      setImportResult,
      importFile,
      setImportFile,
      importCalendarId,
      setImportCalendarId,
      calendars,
      onFileSelect: handleFileSelect,
      onImport: handleImportICS,
      showSubscriptionDialog,
      setShowSubscriptionDialog,
      subscriptionView,
      setSubscriptionView,
      sharingCalendar,
      setSharingCalendar,
      setShareLinkInfo,
      setShareLinkLoading,
      setShowRegenerateConfirm,
      shareLinkInfo,
      shareLinkLoading,
      onToggleShareLink: handleToggleShareLink,
      onCopyShareLink: handleCopyShareLink,
      showRegenerateConfirm,
      onConfirmRegenerate: handleRegenerateShareLinkConfirmed,
      pendingUnsubscribe,
      setPendingUnsubscribe,
      onRemoveSubscription: (subscriptionId: string) =>
        deleteSubscriptionMutation.mutate(subscriptionId),
    },
  };
}

export function CalendarManagement(props: CalendarManagementProps) {
  const { managementDialogProps, overlayProps } =
    useCalendarManagementModel(props);

  return (
    <>
      <CalendarManagementDialog {...managementDialogProps} />
      <CalendarManagementOverlays {...overlayProps} />
    </>
  );
}

function CalendarManagementOverlays({
  editingCalendar,
  setEditingCalendar,
  validationErrors,
  setValidationErrors,
  loading,
  onOpenShareDialog,
  onUpdateCalendar,
  deletingCalendar,
  setDeletingCalendar,
  deleteAction,
  setDeleteAction,
  targetCalendarId,
  setTargetCalendarId,
  availableTargetCalendars,
  onDelete,
  showImportDialog,
  setShowImportDialog,
  importResult,
  setImportResult,
  importFile,
  setImportFile,
  importCalendarId,
  setImportCalendarId,
  calendars,
  onFileSelect,
  onImport,
  showSubscriptionDialog,
  setShowSubscriptionDialog,
  subscriptionView,
  setSubscriptionView,
  sharingCalendar,
  setSharingCalendar,
  setShareLinkInfo,
  setShareLinkLoading,
  setShowRegenerateConfirm,
  shareLinkInfo,
  shareLinkLoading,
  onToggleShareLink,
  onCopyShareLink,
  showRegenerateConfirm,
  onConfirmRegenerate,
  pendingUnsubscribe,
  setPendingUnsubscribe,
  onRemoveSubscription,
}: {
  editingCalendar: Calendar | null;
  setEditingCalendar: (value: SetStateValue<Calendar | null>) => void;
  validationErrors: ValidationErrors;
  setValidationErrors: (value: SetStateValue<ValidationErrors>) => void;
  loading: boolean;
  onOpenShareDialog: (calendar: Calendar) => void;
  onUpdateCalendar: (
    calendar: Calendar,
    updates: Partial<UpdateCalendarRequest>,
  ) => Promise<boolean | undefined>;
  deletingCalendar: Calendar | null;
  setDeletingCalendar: (value: SetStateValue<Calendar | null>) => void;
  deleteAction: CalendarDeleteAction;
  setDeleteAction: (value: SetStateValue<CalendarDeleteAction>) => void;
  targetCalendarId: string;
  setTargetCalendarId: (value: SetStateValue<string>) => void;
  availableTargetCalendars: Calendar[];
  onDelete: () => void;
  showImportDialog: boolean;
  setShowImportDialog: (value: SetStateValue<boolean>) => void;
  importResult: ImportICSResponse | null;
  setImportResult: (value: SetStateValue<ImportICSResponse | null>) => void;
  importFile: File | null;
  setImportFile: (value: SetStateValue<File | null>) => void;
  importCalendarId: string;
  setImportCalendarId: (value: SetStateValue<string>) => void;
  calendars: Calendar[];
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onImport: () => void;
  showSubscriptionDialog: boolean;
  setShowSubscriptionDialog: (value: SetStateValue<boolean>) => void;
  subscriptionView: PaletteView;
  setSubscriptionView: (value: SetStateValue<PaletteView>) => void;
  sharingCalendar: Calendar | null;
  setSharingCalendar: (value: SetStateValue<Calendar | null>) => void;
  setShareLinkInfo: (value: SetStateValue<CalendarShareLink | null>) => void;
  setShareLinkLoading: (value: SetStateValue<boolean>) => void;
  setShowRegenerateConfirm: (value: SetStateValue<boolean>) => void;
  shareLinkInfo: CalendarShareLink | null;
  shareLinkLoading: boolean;
  onToggleShareLink: (enabled: boolean) => Promise<void>;
  onCopyShareLink: () => Promise<void>;
  showRegenerateConfirm: boolean;
  onConfirmRegenerate: () => Promise<void>;
  pendingUnsubscribe: PendingUnsubscribe | null;
  setPendingUnsubscribe: (value: SetStateValue<PendingUnsubscribe | null>) => void;
  onRemoveSubscription: (subscriptionId: string) => void;
}) {
  return (
    <>
      <EditCalendarDialog
        editingCalendar={editingCalendar}
        setEditingCalendar={setEditingCalendar}
        validationErrors={validationErrors}
        setValidationErrors={setValidationErrors}
        loading={loading}
        onOpenShareDialog={onOpenShareDialog}
        onUpdateCalendar={onUpdateCalendar}
      />

      <DeleteCalendarDialog
        deletingCalendar={deletingCalendar}
        setDeletingCalendar={setDeletingCalendar}
        deleteAction={deleteAction}
        setDeleteAction={setDeleteAction}
        targetCalendarId={targetCalendarId}
        setTargetCalendarId={setTargetCalendarId}
        availableTargetCalendars={availableTargetCalendars}
        loading={loading}
        onDelete={onDelete}
      />

      <ImportIcsDialog
        open={showImportDialog}
        setOpen={setShowImportDialog}
        importResult={importResult}
        setImportResult={setImportResult}
        importFile={importFile}
        setImportFile={setImportFile}
        importCalendarId={importCalendarId}
        setImportCalendarId={setImportCalendarId}
        calendars={calendars}
        loading={loading}
        onFileSelect={onFileSelect}
        onImport={onImport}
      />

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

      <ShareCalendarDialog
        sharingCalendar={sharingCalendar}
        setSharingCalendar={setSharingCalendar}
        setShareLinkInfo={setShareLinkInfo}
        setShareLinkLoading={setShareLinkLoading}
        setShowRegenerateConfirm={setShowRegenerateConfirm}
        shareLinkInfo={shareLinkInfo}
        shareLinkLoading={shareLinkLoading}
        onToggleShareLink={onToggleShareLink}
        onCopyShareLink={onCopyShareLink}
      />

      <RegenerateShareLinkDialog
        open={showRegenerateConfirm}
        setOpen={setShowRegenerateConfirm}
        loading={shareLinkLoading}
        onConfirm={onConfirmRegenerate}
      />

      <PendingUnsubscribeDialog
        pendingUnsubscribe={pendingUnsubscribe}
        setPendingUnsubscribe={setPendingUnsubscribe}
        onRemove={onRemoveSubscription}
      />
    </>
  );
}

function CalendarManagementDialog({
  open,
  onOpenChange,
  openCalendarManagement,
  showCreateForm,
  setShowCreateForm,
  setShowSubscriptionDialog,
  setShowImportDialog,
  setImportResult,
  newCalendar,
  setNewCalendar,
  validationErrors,
  setValidationErrors,
  loading,
  onCreateCalendar,
  ownedCalendars,
  publicCalendars,
  subscribedCalendars,
  isCalendarVisible,
  onToggleVisibility,
  onSetDefault,
  onOpenShareDialog,
  setEditingCalendar,
  setDeletingCalendar,
  onRemoveSubscribedCalendar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  openCalendarManagement: () => void;
  showCreateForm: boolean;
  setShowCreateForm: (value: SetStateValue<boolean>) => void;
  setShowSubscriptionDialog: (value: SetStateValue<boolean>) => void;
  setShowImportDialog: (value: SetStateValue<boolean>) => void;
  setImportResult: (value: SetStateValue<ImportICSResponse | null>) => void;
  newCalendar: CalendarFormDraft;
  setNewCalendar: (value: SetStateValue<CalendarFormDraft>) => void;
  validationErrors: ValidationErrors;
  setValidationErrors: (value: SetStateValue<ValidationErrors>) => void;
  loading: boolean;
  onCreateCalendar: () => Promise<void>;
  ownedCalendars: Calendar[];
  publicCalendars: Calendar[];
  subscribedCalendars: Calendar[];
  isCalendarVisible: (calendarId: string) => boolean;
  onToggleVisibility: (calendar: Calendar) => void;
  onSetDefault: (calendar: Calendar) => void;
  onOpenShareDialog: (calendar: Calendar) => void;
  setEditingCalendar: (value: SetStateValue<Calendar | null>) => void;
  setDeletingCalendar: (value: SetStateValue<Calendar | null>) => void;
  onRemoveSubscribedCalendar: (calendar: Calendar) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[calc(90dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Calendars</DialogTitle>
          <DialogDescription>
            Create, edit, and organize your calendars
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <CreateCalendarCard
            onOpenSettings={() => {
              onOpenChange(false);
              openCalendarManagement();
            }}
            onOpenSubscriptions={() => setShowSubscriptionDialog(true)}
            onOpenImport={() => {
              setShowImportDialog(true);
              setImportResult(null);
            }}
            showCreateForm={showCreateForm}
            setShowCreateForm={setShowCreateForm}
            newCalendar={newCalendar}
            setNewCalendar={setNewCalendar}
            validationErrors={validationErrors}
            setValidationErrors={setValidationErrors}
            loading={loading}
            onCreateCalendar={onCreateCalendar}
          />

          <CalendarSection
            title="Your Calendars"
            calendars={ownedCalendars}
            kind="owned"
            isCalendarVisible={isCalendarVisible}
            onToggleVisibility={onToggleVisibility}
            onSetDefault={onSetDefault}
            onOpenShareDialog={onOpenShareDialog}
            setEditingCalendar={setEditingCalendar}
            setDeletingCalendar={setDeletingCalendar}
            setValidationErrors={setValidationErrors}
            onRemoveSubscribedCalendar={onRemoveSubscribedCalendar}
          />

          {publicCalendars.length > 0 && (
            <CalendarSection
              title="Public Calendars"
              calendars={publicCalendars}
              kind="public"
              isCalendarVisible={isCalendarVisible}
              onToggleVisibility={onToggleVisibility}
              onSetDefault={onSetDefault}
              onOpenShareDialog={onOpenShareDialog}
              setEditingCalendar={setEditingCalendar}
              setDeletingCalendar={setDeletingCalendar}
              setValidationErrors={setValidationErrors}
              onRemoveSubscribedCalendar={onRemoveSubscribedCalendar}
            />
          )}

          {subscribedCalendars.length > 0 && (
            <CalendarSection
              title="Subscribed Calendars"
              calendars={subscribedCalendars}
              kind="subscribed"
              isCalendarVisible={isCalendarVisible}
              onToggleVisibility={onToggleVisibility}
              onSetDefault={onSetDefault}
              onOpenShareDialog={onOpenShareDialog}
              setEditingCalendar={setEditingCalendar}
              setDeletingCalendar={setDeletingCalendar}
              setValidationErrors={setValidationErrors}
              onRemoveSubscribedCalendar={onRemoveSubscribedCalendar}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateCalendarCard({
  onOpenSettings,
  onOpenSubscriptions,
  onOpenImport,
  showCreateForm,
  setShowCreateForm,
  newCalendar,
  setNewCalendar,
  validationErrors,
  setValidationErrors,
  loading,
  onCreateCalendar,
}: {
  onOpenSettings: () => void;
  onOpenSubscriptions: () => void;
  onOpenImport: () => void;
  showCreateForm: boolean;
  setShowCreateForm: (value: SetStateValue<boolean>) => void;
  newCalendar: CalendarFormDraft;
  setNewCalendar: (value: SetStateValue<CalendarFormDraft>) => void;
  validationErrors: ValidationErrors;
  setValidationErrors: (value: SetStateValue<ValidationErrors>) => void;
  loading: boolean;
  onCreateCalendar: () => Promise<void>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <span>Create New Calendar</span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenSettings}
              title="Calendar Settings"
            >
              <Settings className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenSubscriptions}
              title="Subscribe to external calendars"
            >
              <ExternalLink className="mr-1 size-4" />
              Subscriptions
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenImport}
              title="Import .ics file"
            >
              <Upload className="mr-1 size-4" />
              Import ICS
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowCreateForm((prev) => !prev);
                setValidationErrors({});
              }}
            >
              <Plus className="mr-1 size-4" />
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
                setNewCalendar((prev) => ({
                  ...prev,
                  name: e.target.value,
                }));
                if (validationErrors.name) {
                  setValidationErrors((prev) => ({
                    ...prev,
                    name: undefined,
                  }));
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
                <AlertCircle className="size-3" />
                {validationErrors.name}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <ColorPicker
              value={newCalendar.color}
              onChange={(color) => {
                setNewCalendar((prev) => ({
                  ...prev,
                  color,
                }));
                if (validationErrors.color) {
                  setValidationErrors((prev) => ({
                    ...prev,
                    color: undefined,
                  }));
                }
              }}
              presetColors={PRESET_COLORS}
            />
            {validationErrors.color && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="size-3" />
                {validationErrors.color}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="newCalendarDefault"
              checked={newCalendar.isDefault}
              onCheckedChange={(checked) =>
                setNewCalendar((prev) => ({
                  ...prev,
                  isDefault: checked,
                }))
              }
            />
            <Label htmlFor="newCalendarDefault">Set as default calendar</Label>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={onCreateCalendar} disabled={loading}>
              Create Calendar
            </Button>
            <Button variant="outline" onClick={() => setShowCreateForm(false)}>
              Cancel
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

type CalendarSectionKind = "owned" | "public" | "subscribed";

function CalendarSection({
  title,
  calendars,
  kind,
  isCalendarVisible,
  onToggleVisibility,
  onSetDefault,
  onOpenShareDialog,
  setEditingCalendar,
  setDeletingCalendar,
  setValidationErrors,
  onRemoveSubscribedCalendar,
}: {
  title: string;
  calendars: Calendar[];
  kind: CalendarSectionKind;
  isCalendarVisible: (calendarId: string) => boolean;
  onToggleVisibility: (calendar: Calendar) => void;
  onSetDefault: (calendar: Calendar) => void;
  onOpenShareDialog: (calendar: Calendar) => void;
  setEditingCalendar: (value: SetStateValue<Calendar | null>) => void;
  setDeletingCalendar: (value: SetStateValue<Calendar | null>) => void;
  setValidationErrors: (value: SetStateValue<ValidationErrors>) => void;
  onRemoveSubscribedCalendar: (calendar: Calendar) => void;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="space-y-2">
        {calendars.map((calendar) => (
          <CalendarRow
            key={calendar.id}
            calendar={calendar}
            kind={kind}
            visible={isCalendarVisible(calendar.id)}
            onToggleVisibility={onToggleVisibility}
            onSetDefault={onSetDefault}
            onOpenShareDialog={onOpenShareDialog}
            setEditingCalendar={setEditingCalendar}
            setDeletingCalendar={setDeletingCalendar}
            setValidationErrors={setValidationErrors}
            onRemoveSubscribedCalendar={onRemoveSubscribedCalendar}
          />
        ))}
      </div>
    </div>
  );
}

function CalendarRow({
  calendar,
  kind,
  visible,
  onToggleVisibility,
  onSetDefault,
  onOpenShareDialog,
  setEditingCalendar,
  setDeletingCalendar,
  setValidationErrors,
  onRemoveSubscribedCalendar,
}: {
  calendar: Calendar;
  kind: CalendarSectionKind;
  visible: boolean;
  onToggleVisibility: (calendar: Calendar) => void;
  onSetDefault: (calendar: Calendar) => void;
  onOpenShareDialog: (calendar: Calendar) => void;
  setEditingCalendar: (value: SetStateValue<Calendar | null>) => void;
  setDeletingCalendar: (value: SetStateValue<Calendar | null>) => void;
  setValidationErrors: (value: SetStateValue<ValidationErrors>) => void;
  onRemoveSubscribedCalendar: (calendar: Calendar) => void;
}) {
  const readOnlyDescription =
    kind === "public"
      ? "Read-only public holiday calendar"
      : "Read-only external calendar";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="size-4 rounded"
              style={{
                backgroundColor: getColorSwatchValue(calendar.color),
              }}
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{calendar.name}</span>
                {kind === "owned" && calendar.isSyncOnly && (
                  <Badge variant="secondary" className="text-xs bg-muted">
                    <ExternalLink className="mr-1 size-3" />
                    Synced
                  </Badge>
                )}
                {kind === "owned" && calendar.isDefault && (
                  <Badge variant="outline" className="text-xs">
                    <Star className="mr-1 size-3" />
                    Default
                  </Badge>
                )}
                {kind === "public" && (
                  <Badge
                    variant="secondary"
                    className="text-xs bg-primary/10 text-primary"
                  >
                    <Globe className="mr-1 size-3" />
                    Public
                  </Badge>
                )}
                {kind === "subscribed" && (
                  <Badge variant="secondary" className="text-xs bg-muted">
                    <ExternalLink className="mr-1 size-3" />
                    Subscribed
                  </Badge>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {kind === "owned" && calendar.isSyncOnly ? "Read-only · " : ""}
                {kind !== "owned" ? `${readOnlyDescription} · ` : ""}
                {visible ? "Visible" : "Hidden"}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggleVisibility(calendar)}
              title={visible ? "Hide calendar" : "Show calendar"}
            >
              {visible ? (
                <Eye className="size-4" />
              ) : (
                <EyeOff className="size-4" />
              )}
            </Button>

            {kind === "owned" && !calendar.isSyncOnly && !calendar.isDefault && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSetDefault(calendar)}
                title="Set as default calendar"
              >
                <Star className="size-4" />
              </Button>
            )}

            {kind === "owned" && !calendar.isSyncOnly && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenShareDialog(calendar)}
                title="Share calendar as ICS"
                className="h-8 px-2 text-xs"
              >
                <Share2 className="mr-1 size-3.5" />
                Share
              </Button>
            )}

            {kind === "owned" && !calendar.isSyncOnly && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingCalendar(calendar);
                  setValidationErrors({});
                }}
                title="Edit calendar"
              >
                <Edit className="size-4" />
              </Button>
            )}

            {kind === "owned" && !calendar.isSyncOnly && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeletingCalendar(calendar)}
                title="Delete calendar"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            )}

            {kind !== "owned" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRemoveSubscribedCalendar(calendar)}
                title={
                  kind === "public"
                    ? "Remove public calendar"
                    : "Remove subscribed calendar"
                }
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DeleteCalendarDialog({
  deletingCalendar,
  setDeletingCalendar,
  deleteAction,
  setDeleteAction,
  targetCalendarId,
  setTargetCalendarId,
  availableTargetCalendars,
  loading,
  onDelete,
}: {
  deletingCalendar: Calendar | null;
  setDeletingCalendar: (value: SetStateValue<Calendar | null>) => void;
  deleteAction: CalendarDeleteAction;
  setDeleteAction: (value: SetStateValue<CalendarDeleteAction>) => void;
  targetCalendarId: string;
  setTargetCalendarId: (value: SetStateValue<string>) => void;
  availableTargetCalendars: Calendar[];
  loading: boolean;
  onDelete: () => void;
}) {
  return (
    <Dialog
      open={!!deletingCalendar}
      onOpenChange={(open) => !open && setDeletingCalendar(null)}
    >
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            Delete Calendar
          </DialogTitle>
          <DialogDescription>
            You&apos;re about to delete &quot;{deletingCalendar?.name}&quot;. What
            would you like to do with existing events?
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
              <div className="flex items-start gap-3">
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

              <div className="flex items-start gap-3">
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
            onClick={onDelete}
            disabled={
              loading || (deleteAction === "move_events" && !targetCalendarId)
            }
          >
            {loading ? "Deleting…" : "Delete Calendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportIcsDialog({
  open,
  setOpen,
  importResult,
  setImportResult,
  importFile,
  setImportFile,
  importCalendarId,
  setImportCalendarId,
  calendars,
  loading,
  onFileSelect,
  onImport,
}: {
  open: boolean;
  setOpen: (value: SetStateValue<boolean>) => void;
  importResult: ImportICSResponse | null;
  setImportResult: (value: SetStateValue<ImportICSResponse | null>) => void;
  importFile: File | null;
  setImportFile: (value: SetStateValue<File | null>) => void;
  importCalendarId: string;
  setImportCalendarId: (value: SetStateValue<string>) => void;
  calendars: Calendar[];
  loading: boolean;
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onImport: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
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
                  <AlertTriangle className="size-4" />
                  Errors ({importResult.errors.length})
                </h4>
                <div className="max-h-40 overflow-y-auto text-xs space-y-1 p-2 border rounded-md bg-destructive/10">
                  {importResult.errors.map((err) => (
                    <div key={err} className="text-destructive">
                      {err}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Close</Button>
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
                  onChange={onFileSelect}
                  className="cursor-pointer"
                />
              </div>
              {importFile && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="size-4" />
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
                  {calendars.map((cal) =>
                    cal.isSyncOnly ? null : (
                      <SelectItem key={cal.id} value={cal.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="size-3 rounded-full"
                            style={{
                              backgroundColor: getColorSwatchValue(cal.color),
                            }}
                          />
                          {cal.name}
                        </div>
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={onImport}
                disabled={loading || !importFile || !importCalendarId}
              >
                {loading ? "Importing…" : "Import Events"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditCalendarDialog({
  editingCalendar,
  setEditingCalendar,
  validationErrors,
  setValidationErrors,
  loading,
  onOpenShareDialog,
  onUpdateCalendar,
}: {
  editingCalendar: Calendar | null;
  setEditingCalendar: (value: SetStateValue<Calendar | null>) => void;
  validationErrors: ValidationErrors;
  setValidationErrors: (value: SetStateValue<ValidationErrors>) => void;
  loading: boolean;
  onOpenShareDialog: (calendar: Calendar) => void;
  onUpdateCalendar: (
    calendar: Calendar,
    updates: Partial<UpdateCalendarRequest>,
  ) => Promise<boolean | undefined>;
}) {
  return (
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
                  setEditingCalendar((prev) =>
                    prev ? { ...prev, name: e.target.value } : prev,
                  );
                  if (validationErrors.name) {
                    setValidationErrors((prev) => ({
                      ...prev,
                      name: undefined,
                    }));
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
                  <AlertCircle className="size-3" />
                  {validationErrors.name}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <ColorPicker
                value={editingCalendar.color}
                onChange={(color) => {
                  setEditingCalendar((prev) =>
                    prev ? { ...prev, color } : prev,
                  );
                  if (validationErrors.color) {
                    setValidationErrors((prev) => ({
                      ...prev,
                      color: undefined,
                    }));
                  }
                }}
                presetColors={PRESET_COLORS}
              />
              {validationErrors.color && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="size-3" />
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
                void onOpenShareDialog(selectedCalendar);
              }}
            >
              <Share2 className="mr-2 size-4" />
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
                const success = await onUpdateCalendar(editingCalendar, {
                  name: editingCalendar.name,
                  color: editingCalendar.color,
                });
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
  );
}

function ShareCalendarDialog({
  sharingCalendar,
  setSharingCalendar,
  setShareLinkInfo,
  setShareLinkLoading,
  setShowRegenerateConfirm,
  shareLinkInfo,
  shareLinkLoading,
  onToggleShareLink,
  onCopyShareLink,
}: {
  sharingCalendar: Calendar | null;
  setSharingCalendar: (value: SetStateValue<Calendar | null>) => void;
  setShareLinkInfo: (value: SetStateValue<CalendarShareLink | null>) => void;
  setShareLinkLoading: (value: SetStateValue<boolean>) => void;
  setShowRegenerateConfirm: (value: SetStateValue<boolean>) => void;
  shareLinkInfo: CalendarShareLink | null;
  shareLinkLoading: boolean;
  onToggleShareLink: (enabled: boolean) => Promise<void>;
  onCopyShareLink: () => Promise<void>;
}) {
  return (
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
                  void onToggleShareLink(checked);
                }}
                disabled={shareLinkLoading}
              />
            </div>

            {shareLinkLoading ? (
              <div className="text-sm text-muted-foreground">
                Updating share settings…
              </div>
            ) : shareLinkInfo?.enabled && shareLinkInfo.shareUrl ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="shareLink">Subscription URL</Label>
                  <div className="flex items-center gap-2">
                    <Input id="shareLink" value={shareLinkInfo.shareUrl} readOnly />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onCopyShareLink}
                    >
                      <Copy className="mr-1 size-4" />
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
                  <RefreshCw className="mr-1 size-4" />
                  Regenerate URL
                </Button>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Link2 className="size-4" />
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
  );
}

function RegenerateShareLinkDialog({
  open,
  setOpen,
  loading,
  onConfirm,
}: {
  open: boolean;
  setOpen: (value: SetStateValue<boolean>) => void;
  loading: boolean;
  onConfirm: () => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              The current URL stops working immediately. Everyone using it must
              subscribe again with the new URL.
            </p>
          </div>
        </div>
        <DialogFooter className="px-5 py-4 border-t border-border/50 gap-2">
          <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              void onConfirm();
            }}
            disabled={loading}
          >
            Confirm Regenerate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PendingUnsubscribeDialog({
  pendingUnsubscribe,
  setPendingUnsubscribe,
  onRemove,
}: {
  pendingUnsubscribe: PendingUnsubscribe | null;
  setPendingUnsubscribe: (value: SetStateValue<PendingUnsubscribe | null>) => void;
  onRemove: (subscriptionId: string) => void;
}) {
  return (
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
                onRemove(pendingUnsubscribe.subscriptionId);
              }
              setPendingUnsubscribe(null);
            }}
          >
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
