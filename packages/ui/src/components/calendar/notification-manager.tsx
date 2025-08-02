"use client";

import { useState } from "react";
import { Plus, X, Bell, Mail } from "lucide-react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Badge } from "../ui/badge";

export interface EventNotification {
  id?: string;
  notificationType: "email";
  minutesBefore: number;
  notificationTime?: string;
  isEnabled: boolean;
  isSent?: boolean;
}

const NOTIFICATION_OPTIONS = [
  { value: 5, label: "5 minutes before" },
  { value: 10, label: "10 minutes before" },
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 120, label: "2 hours before" },
  { value: 360, label: "6 hours before" },
  { value: 720, label: "12 hours before" },
  { value: 1440, label: "1 day before" },
  { value: 2880, label: "2 days before" },
  { value: 4320, label: "3 days before" },
  { value: 10080, label: "1 week before" },
];

interface NotificationManagerProps {
  eventId?: string;
  notifications: EventNotification[];
  onChange: (notifications: EventNotification[]) => void;
  loading?: boolean;
  defaultReminder?: number | null; // User's default reminder setting
}

export function NotificationManager({
  eventId,
  notifications,
  onChange,
  loading = false,
  defaultReminder = null,
}: NotificationManagerProps) {
  const handleAddNotification = () => {
    const newNotification: EventNotification = {
      notificationType: "email",
      minutesBefore: 15, // Default to 15 minutes
      isEnabled: true,
    };
    onChange([...notifications, newNotification]);
  };

  const handleRemoveNotification = (index: number) => {
    const updated = notifications.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleUpdateNotification = (
    index: number,
    field: keyof EventNotification,
    value: any,
  ) => {
    const updated = notifications.map((notification, i) =>
      i === index ? { ...notification, [field]: value } : notification,
    );
    onChange(updated);
  };

  const formatMinutesToReadable = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes}min`;
    } else if (minutes < 1440) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0
        ? `${hours}h ${remainingMinutes}min`
        : `${hours}h`;
    } else {
      const days = Math.floor(minutes / 1440);
      const remainingHours = Math.floor((minutes % 1440) / 60);
      return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Email Notifications
        </Label>
      </div>

      {/* Default notification indicator */}
      {defaultReminder && (
        <div className="flex items-center gap-2 p-3 border rounded-lg bg-info-bg border-info-border">
          <Mail className="h-4 w-4 text-info" />
          <div className="flex-1">
            <div className="text-sm font-medium text-info-foreground">
              Default Email Reminder
            </div>
            <div className="text-xs text-info">
              {formatMinutesToReadable(defaultReminder)} before the event
            </div>
          </div>
          <Badge
            variant="outline"
            className="text-xs border-info-border text-info"
          >
            Auto
          </Badge>
        </div>
      )}

      {notifications.length === 0 ? (
        <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4 text-center">
          {defaultReminder
            ? "Your default email reminder is already configured above. Add additional notifications below if needed."
            : "No email notifications configured. Add one below to get reminded about this event."}
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification, index) => (
            <div
              key={index}
              className="flex items-center gap-2 p-3 border rounded-lg bg-card"
            >
              <Mail className="h-4 w-4 text-muted-foreground" />

              <div className="flex-1">
                <Select
                  value={notification.minutesBefore.toString()}
                  onValueChange={(value) =>
                    handleUpdateNotification(
                      index,
                      "minutesBefore",
                      parseInt(value),
                    )
                  }
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTIFICATION_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value.toString()}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveNotification(index)}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={handleAddNotification}
        disabled={loading}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Email Notification
      </Button>
    </div>
  );
}
