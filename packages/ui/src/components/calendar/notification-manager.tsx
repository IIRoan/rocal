"use client";

import { useState } from "react";
import { Bell, Plus, X, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "../ui/drawer";
import { useIsMobile } from "@workspace/ui/hooks/use-mobile";
import { cn } from "@workspace/ui/lib/utils";

export interface EventNotification {
  id?: string;
  notificationType: "email";
  minutesBefore: number;
  notificationTime?: string;
  isEnabled: boolean;
  isSent?: boolean;
}

const TIME_OPTIONS = [
  { value: 5, label: "5 min before" },
  { value: 10, label: "10 min before" },
  { value: 15, label: "15 min before" },
  { value: 30, label: "30 min before" },
  { value: 60, label: "1 hour before" },
  { value: 120, label: "2 hours before" },
  { value: 360, label: "6 hours before" },
  { value: 720, label: "12 hours before" },
  { value: 1440, label: "1 day before" },
  { value: 2880, label: "2 days before" },
  { value: 4320, label: "3 days before" },
  { value: 10080, label: "1 week before" },
];

function formatTimeShort(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440)
    return `${minutes / 60} hour${minutes / 60 > 1 ? "s" : ""}`;
  const days = minutes / 1440;
  return `${days} day${days > 1 ? "s" : ""}`;
}

interface NotificationManagerProps {
  eventId?: string;
  notifications: EventNotification[];
  onChange: (notifications: EventNotification[]) => void;
  loading?: boolean;
}

function ReminderRow({
  value,
  onSelect,
  onRemove,
  isMobile,
}: {
  value: number;
  onSelect: (value: number) => void;
  onRemove?: () => void;
  isMobile: boolean;
}) {
  const [open, setOpen] = useState(false);

  const content = (
    <div className="grid grid-cols-2 gap-1 p-2">
      {TIME_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => {
            onSelect(option.value);
            setOpen(false);
          }}
          className={cn(
            "flex items-center justify-center h-9 rounded-lg text-sm font-medium transition-colors",
            option.value === value
              ? "bg-primary text-primary-foreground"
              : "bg-muted/50 hover:bg-muted active:bg-muted/80",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          <div className="flex items-center gap-2 w-full cursor-pointer group">
            <div className="flex items-center justify-center h-9 w-9 shrink-0 rounded-lg bg-muted/50 group-hover:bg-muted transition-colors">
              <Bell className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 inline-flex items-center justify-between gap-1 px-3 h-9 rounded-lg bg-muted/30 group-hover:bg-muted/50 text-sm font-medium text-foreground transition-colors">
              <span>{formatTimeShort(value)} before</span>
              {onRemove ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                  }}
                  className="flex items-center justify-center h-6 w-6 -mr-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <ChevronDown className="h-4 w-4 opacity-50" />
              )}
            </div>
          </div>
        </DrawerTrigger>
        <DrawerContent className="max-h-[60dvh]">
          <DrawerTitle className="sr-only">Select reminder time</DrawerTitle>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="flex items-center gap-2 w-full cursor-pointer group">
          <div className="flex items-center justify-center h-9 w-9 shrink-0 rounded-lg bg-muted/50 group-hover:bg-muted transition-colors">
            <Bell className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 inline-flex items-center justify-between gap-1 px-3 h-9 rounded-lg bg-muted/30 group-hover:bg-muted/50 text-sm font-medium text-foreground transition-colors">
            <span>{formatTimeShort(value)} before</span>
            {onRemove ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="flex items-center justify-center h-6 w-6 -mr-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <ChevronDown className="h-4 w-4 opacity-50" />
            )}
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        {content}
      </PopoverContent>
    </Popover>
  );
}

export function NotificationManager({
  notifications,
  onChange,
  loading = false,
}: NotificationManagerProps) {
  const isMobile = useIsMobile();

  const handleAdd = () => {
    onChange([
      ...notifications,
      { notificationType: "email", minutesBefore: 15, isEnabled: true },
    ]);
  };

  const handleRemove = (index: number) => {
    onChange(notifications.filter((_, i) => i !== index));
  };

  const handleSelect = (index: number, value: number) => {
    onChange(
      notifications.map((n, i) =>
        i === index ? { ...n, minutesBefore: value } : n,
      ),
    );
  };

  return (
    <div className="space-y-1">
      {notifications.map((notification, index) => (
        <ReminderRow
          key={index}
          value={notification.minutesBefore}
          onSelect={(value) => handleSelect(index, value)}
          onRemove={() => handleRemove(index)}
          isMobile={isMobile}
        />
      ))}

      {/* Add button */}
      <button
        type="button"
        onClick={handleAdd}
        disabled={loading}
        className={cn(
          "flex items-center gap-2 w-full text-left group cursor-pointer",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        <div className="flex items-center justify-center h-9 w-9 shrink-0 rounded-lg bg-muted/50 group-hover:bg-muted transition-colors">
          <Plus className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 flex items-center px-3 h-9 rounded-lg bg-muted/30 group-hover:bg-muted/50 transition-colors">
          <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
            Add reminder
          </span>
        </div>
      </button>
    </div>
  );
}
