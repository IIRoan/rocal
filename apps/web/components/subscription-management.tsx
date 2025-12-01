"use client";

import { useState } from "react";
import { calendarApiService } from "@/lib/calendar-api-service";
import { useCalendarData } from "@/hooks/use-calendar-data";
import type { Calendar as CalendarType } from "@/lib/types/calendar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandList,
  CommandGroup,
  CommandItem,
} from "@workspace/ui/components/navigation/command";
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
import { Badge } from "@workspace/ui/components/ui/badge";
import { Alert, AlertDescription } from "@workspace/ui/components/ui/alert";
import {
  Plus,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Clock,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";

interface CalendarSubscription {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  syncIntervalMinutes: number;
  lastSyncAt?: string;
  lastSyncStatus: "success" | "error" | "pending";
  lastErrorMessage?: string;
  calendar: CalendarType;
  _count: {
    syncLogs: number;
  };
}

interface SubscriptionManagementProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBack?: () => void;
}

export function SubscriptionManagement({
  open,
  onOpenChange,
  onBack,
}: SubscriptionManagementProps) {
  const queryClient = useQueryClient();
  const { calendars, refetchCalendars } = useCalendarData();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [newSubscription, setNewSubscription] = useState({
    name: "",
    url: "",
    calendarId: "",
  });

  const [validationErrors, setValidationErrors] = useState<{
    name?: string;
    url?: string;
    calendarId?: string;
  }>({});

  // Query
  const {
    data: subscriptions = [],
    isLoading: isLoadingSubscriptions,
    error: queryError,
  } = useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => calendarApiService.getSubscriptions(),
    enabled: open,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: { name: string; url: string; calendarId: string }) =>
      calendarApiService.createSubscription(data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      await refetchCalendars();
      setSuccess("Calendar subscription created successfully!");
      setNewSubscription({ name: "", url: "", calendarId: "" });
      setShowCreateForm(false);
      setLocalError(null);
    },
    onError: (err: any) =>
      setLocalError(err.message || "Failed to create subscription"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => calendarApiService.deleteSubscription(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      await refetchCalendars();
      setSuccess("Subscription deleted successfully!");
      setLocalError(null);
    },
    onError: (err: any) =>
      setLocalError(err.message || "Failed to delete subscription"),
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => calendarApiService.syncSubscription(id),
    onSuccess: async (_: any, id: string) => {
      await queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      await refetchCalendars();
      const sub = subscriptions.find((s: CalendarSubscription) => s.id === id);
      setSuccess(`Successfully synced "${sub?.name || "subscription"}"`);
      setLocalError(null);
    },
    onError: (err: any) =>
      setLocalError(err.message || "Failed to sync subscription"),
  });

  const loading =
    isLoadingSubscriptions ||
    createMutation.isPending ||
    deleteMutation.isPending ||
    syncMutation.isPending;
  const error =
    localError ||
    (queryError
      ? (queryError as any).message || "Failed to load subscriptions"
      : null);

  const validateForm = () => {
    const errors: typeof validationErrors = {};

    if (!newSubscription.name.trim()) {
      errors.name = "Subscription name is required";
    }

    if (!newSubscription.url.trim()) {
      errors.url = "Calendar URL is required";
    } else {
      try {
        new URL(newSubscription.url);
        if (!newSubscription.url.toLowerCase().includes(".ics")) {
          errors.url = "URL should point to an .ics calendar file";
        }
      } catch {
        errors.url = "Please enter a valid URL";
      }
    }

    if (!newSubscription.calendarId) {
      errors.calendarId = "Please select a calendar";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateSubscription = () => {
    if (!validateForm()) return;
    createMutation.mutate({
      name: newSubscription.name.trim(),
      url: newSubscription.url.trim(),
      calendarId: newSubscription.calendarId,
    });
  };

  const handleDeleteSubscription = (subscription: CalendarSubscription) => {
    if (
      !confirm(
        `Are you sure you want to unsubscribe from "${subscription.name}"?`
      )
    ) {
      return;
    }
    deleteMutation.mutate(subscription.id);
  };

  const handleSyncSubscription = (subscription: CalendarSubscription) => {
    syncMutation.mutate(subscription.id);
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
          <Badge variant="secondary" className="bg-green-100 text-green-800">
            Synced
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive" title={lastErrorMessage}>
            Error
          </Badge>
        );
      case "pending":
        return <Badge variant="outline">Pending</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
        <ExternalLink className="h-5 w-5" />
        <h2 className="text-lg font-semibold text-foreground">
          Calendar Subscriptions
        </h2>
      </div>

      <CommandList>
        {error && (
          <div className="px-6 py-3 border-b border-border">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        {success && (
          <div className="px-6 py-3 border-b border-border">
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                {success}
              </AlertDescription>
            </Alert>
          </div>
        )}

        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() => {
              setShowCreateForm(!showCreateForm);
              setValidationErrors({});
              setLocalError(null);
              setSuccess(null);
            }}
            className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
          >
            <Plus className="mr-3 h-4 w-4 text-muted-foreground" />
            <span className="text-foreground">New Subscription</span>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              queryClient.invalidateQueries({ queryKey: ["subscriptions"] })
            }
            disabled={loading}
            className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
          >
            <RefreshCw
              className={`mr-3 h-4 w-4 text-muted-foreground ${loading ? "animate-spin" : ""}`}
            />
            <span className="text-foreground">Refresh Subscriptions</span>
          </CommandItem>
        </CommandGroup>

        {showCreateForm && (
          <div className="px-6 py-4 border-b border-border space-y-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label
                  htmlFor="subscription-name"
                  className="text-sm font-medium"
                >
                  Subscription Name
                </Label>
                <Input
                  id="subscription-name"
                  value={newSubscription.name}
                  onChange={(e) => {
                    setNewSubscription({
                      ...newSubscription,
                      name: e.target.value,
                    });
                    if (validationErrors.name) {
                      setValidationErrors({
                        ...validationErrors,
                        name: undefined,
                      });
                    }
                  }}
                  placeholder="e.g., Work Calendar, Holidays"
                  className={
                    validationErrors.name
                      ? "border-red-500 focus-visible:ring-red-500"
                      : ""
                  }
                />
                {validationErrors.name && (
                  <p className="text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {validationErrors.name}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="subscription-url"
                  className="text-sm font-medium"
                >
                  Calendar URL (.ics)
                </Label>
                <Input
                  id="subscription-url"
                  value={newSubscription.url}
                  onChange={(e) => {
                    setNewSubscription({
                      ...newSubscription,
                      url: e.target.value,
                    });
                    if (validationErrors.url) {
                      setValidationErrors({
                        ...validationErrors,
                        url: undefined,
                      });
                    }
                  }}
                  placeholder="https://example.com/calendar.ics"
                  className={
                    validationErrors.url
                      ? "border-red-500 focus-visible:ring-red-500"
                      : ""
                  }
                />
                {validationErrors.url && (
                  <p className="text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {validationErrors.url}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Enter the URL of an .ics calendar file
                </p>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="subscription-calendar"
                  className="text-sm font-medium"
                >
                  Target Calendar
                </Label>
                <Select
                  value={newSubscription.calendarId}
                  onValueChange={(value) => {
                    setNewSubscription({
                      ...newSubscription,
                      calendarId: value,
                    });
                    if (validationErrors.calendarId) {
                      setValidationErrors({
                        ...validationErrors,
                        calendarId: undefined,
                      });
                    }
                  }}
                >
                  <SelectTrigger
                    id="subscription-calendar"
                    className={
                      validationErrors.calendarId
                        ? "border-red-500 focus-visible:ring-red-500"
                        : ""
                    }
                  >
                    <SelectValue placeholder="Select calendar" />
                  </SelectTrigger>
                  <SelectContent>
                    {calendars.map((calendar) => (
                      <SelectItem key={calendar.id} value={calendar.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: calendar.color }}
                          />
                          {calendar.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {validationErrors.calendarId && (
                  <p className="text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {validationErrors.calendarId}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewSubscription({ name: "", url: "", calendarId: "" });
                  setValidationErrors({});
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreateSubscription}
                disabled={loading}
              >
                {loading ? "Creating..." : "Subscribe"}
              </Button>
            </div>
          </div>
        )}

        {subscriptions.length === 0 ? (
          <div className="px-6 py-8 text-center text-muted-foreground">
            <ExternalLink className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No calendar subscriptions yet</p>
            <p className="text-sm">
              Subscribe to external calendars to sync them automatically
            </p>
          </div>
        ) : (
          <CommandGroup
            heading={`Active Subscriptions (${subscriptions.length})`}
          >
            {subscriptions.map((subscription: CalendarSubscription) => (
              <div
                key={subscription.id}
                className="px-4 py-3 border-b border-border/30 last:border-b-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium text-sm">
                        {subscription.name}
                      </h4>
                      {getStatusBadge(
                        subscription.lastSyncStatus,
                        subscription.lastErrorMessage
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <div className="flex items-center gap-1">
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: subscription.calendar.color,
                          }}
                        />
                        <span className="truncate">
                          {subscription.calendar.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 flex-shrink-0" />
                        <span>{formatLastSync(subscription.lastSyncAt)}</span>
                      </div>
                    </div>
                    <div
                      className="text-xs text-muted-foreground font-mono truncate"
                      title={subscription.url}
                    >
                      {subscription.url}
                    </div>
                    {subscription.lastErrorMessage && (
                      <div className="flex items-start gap-1 text-xs text-red-600">
                        <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                        <span className="break-words">
                          {subscription.lastErrorMessage}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSyncSubscription(subscription)}
                      disabled={loading}
                      className="h-7 px-2"
                      title="Sync now"
                    >
                      <RefreshCw
                        className={`h-3 w-3 ${loading ? "animate-spin" : ""}`}
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteSubscription(subscription)}
                      disabled={loading}
                      className="h-7 px-2 text-red-600 hover:text-red-700"
                      title="Delete subscription"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
