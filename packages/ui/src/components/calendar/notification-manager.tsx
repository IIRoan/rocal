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
    <div className="space-y-2.5">
      {/* Default notification indicator */}
      {defaultReminder && (
        <div className="flex items-center gap-2 p-2 border rounded-md bg-info-bg border-info-border">
          <Mail className="h-3.5 w-3.5 text-info flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-info-foreground">
              Default: {formatMinutesToReadable(defaultReminder)} before
            </div>
          </div>
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 h-5 border-info-border text-info"
          >
            Auto
          </Badge>
        </div>
      )}

      {notifications.length === 0 ? (
        <div className="text-xs text-muted-foreground bg-muted/30 rounded-md p-2.5 text-center">
          {defaultReminder
            ? "Default reminder set. Add more if needed."
            : "Add reminders to be notified about this event."}
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification, index) => (
            <div
              key={index}
              className="flex items-center gap-2 p-2 border rounded-md bg-card"
            >
              <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />

              <div className="flex-1 min-w-0">
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
                  <SelectTrigger className="h-7 text-xs">
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
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
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
        className="w-full h-7 text-xs"
      >
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Add Reminder
      </Button>
    </div>
  );
}
