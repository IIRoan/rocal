"use client";

import { useState } from "react";
import { calendarApiService } from "@/lib/calendar-api-service";
import { useCalendarData } from "@/hooks/use-calendar-data";
import type {
  CalendarSubscription,
  SyncSubscriptionResponse,
} from "@/lib/types/calendar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { VisuallyHidden } from "@workspace/ui/components/ui/visually-hidden";
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
    onSuccess: async (_: SyncSubscriptionResponse, id: string) => {
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
        `Are you sure you want to unsubscribe from "${subscription.name}"?`,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="spotlight"
        showClose={false}
        className="overflow-hidden p-0 bg-popover border-border/50 shadow-2xl max-h-[480px]"
      >
        <VisuallyHidden>
          <DialogTitle>Calendar Subscriptions</DialogTitle>
        </VisuallyHidden>
        <div className="flex flex-col">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
            {onBack && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onBack}
                className="p-1 h-auto"
              >
                <ArrowLeft className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}
            <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium">Subscriptions</span>
          </div>

          {error && (
            <div className="px-4 py-2 border-b border-border/50">
              <Alert variant="destructive" className="py-2">
                <AlertCircle className="h-3 w-3" />
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            </div>
          )}

          {success && (
            <div className="px-4 py-2 border-b border-border/50">
              <Alert className="py-2 border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950">
                <CheckCircle className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                <AlertDescription className="text-xs text-emerald-800 dark:text-emerald-200">
                  {success}
                </AlertDescription>
              </Alert>
            </div>
          )}

          <div className="flex-1 overflow-y-auto min-h-0">
            {/* Actions Section */}
            <div className="px-4 py-2 text-xs font-medium text-muted-foreground">
              Actions
            </div>
            <div className="p-1">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowCreateForm(!showCreateForm);
                  setValidationErrors({});
                  setLocalError(null);
                  setSuccess(null);
                }}
                className="w-full justify-start h-auto px-3 py-2 font-normal"
              >
                <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm">New Subscription</span>
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  queryClient.invalidateQueries({ queryKey: ["subscriptions"] })
                }
                disabled={loading}
                className="w-full justify-start h-auto px-3 py-2 font-normal"
              >
                <RefreshCw
                  className={`h-4 w-4 text-muted-foreground shrink-0 ${loading ? "animate-spin" : ""}`}
                />
                <span className="text-sm">Refresh</span>
              </Button>
            </div>

            {showCreateForm && (
              <div className="px-4 py-3 border-b border-border/50 space-y-3">
                <div className="space-y-2">
                  <Label
                    htmlFor="subscription-name"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    NAME
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
                    placeholder="e.g., Work Calendar"
                    className={`h-8 text-sm ${validationErrors.name ? "border-destructive" : ""}`}
                  />
                  {validationErrors.name && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {validationErrors.name}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="subscription-url"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    CALENDAR URL (.ics)
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
                    className={`h-8 text-sm ${validationErrors.url ? "border-destructive" : ""}`}
                  />
                  {validationErrors.url && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {validationErrors.url}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="subscription-calendar"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    TARGET CALENDAR
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
                      className={`h-8 text-sm ${validationErrors.calendarId ? "border-destructive" : ""}`}
                    >
                      <SelectValue placeholder="Select calendar" />
                    </SelectTrigger>
                    <SelectContent>
                      {calendars.map((calendar) => (
                        <SelectItem key={calendar.id} value={calendar.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: calendar.color }}
                            />
                            {calendar.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {validationErrors.calendarId && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {validationErrors.calendarId}
                    </p>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowCreateForm(false);
                      setNewSubscription({ name: "", url: "", calendarId: "" });
                      setValidationErrors({});
                    }}
                    className="h-7"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCreateSubscription}
                    disabled={loading}
                    className="h-7"
                  >
                    {loading ? "Creating..." : "Subscribe"}
                  </Button>
                </div>
              </div>
            )}

            {subscriptions.length === 0 ? (
              <div className="px-4 py-6 text-center text-muted-foreground">
                <ExternalLink className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No subscriptions yet</p>
                <p className="text-xs">
                  Subscribe to external calendars to sync automatically
                </p>
              </div>
            ) : (
              <>
                <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-t border-border/50 mt-1">
                  Active ({subscriptions.length})
                </div>
                <div className="p-1">
                  {subscriptions.map((subscription: CalendarSubscription) => (
                    <div
                      key={subscription.id}
                      className="px-3 py-2 mb-1 rounded-md border border-border/50 hover:bg-accent/20 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">
                              {subscription.name}
                            </span>
                            {getStatusBadge(
                              subscription.lastSyncStatus,
                              subscription.lastErrorMessage,
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
                              <span>
                                {formatLastSync(subscription.lastSyncAt)}
                              </span>
                            </div>
                          </div>
                          {subscription.lastErrorMessage && (
                            <div className="flex items-start gap-1 text-xs text-destructive">
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
                            className="h-6 w-6 p-0"
                            title="Sync now"
                          >
                            <RefreshCw
                              className={`h-3 w-3 ${loading ? "animate-spin" : ""}`}
                            />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleDeleteSubscription(subscription)
                            }
                            disabled={loading}
                            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                            title="Delete subscription"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
