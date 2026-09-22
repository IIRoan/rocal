"use client";

import { useState } from "react";
import { Plus, X, ChevronDown } from "lucide-react";
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
  size?: "sm" | "md";
}

const CHIP_CLASS =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-accent/60 text-sm text-foreground transition-colors cursor-pointer outline-none hover:bg-accent data-[state=open]:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50";

function ReminderChip({
  value,
  takenValues,
  onSelect,
  onRemove,
  isMobile,
  size,
}: {
  value: number;
  takenValues: number[];
  onSelect: (value: number) => void;
  onRemove: () => void;
  isMobile: boolean;
  size: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const height = size === "sm" ? "h-8" : "h-11";

  const content = (
    <div className="grid grid-cols-2 gap-1 p-2">
      {TIME_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={takenValues.includes(option.value)}
          onClick={() => {
            onSelect(option.value);
            setOpen(false);
          }}
          className={cn(
            "flex items-center justify-center h-9 rounded-md text-sm transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
            option.value === value
              ? "bg-primary text-primary-foreground"
              : "hover:bg-accent",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  const trigger = (
    <button
      type="button"
      aria-label={`Reminder ${formatTimeShort(value)} before, change time`}
      className={cn(CHIP_CLASS, height, "pl-2.5 pr-1.5")}
    >
      {formatTimeShort(value)} before
      <ChevronDown className="size-3.5 opacity-60" />
    </button>
  );

  return (
    <div className="inline-flex items-center">
      {isMobile ? (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerTrigger asChild>{trigger}</DrawerTrigger>
          <DrawerContent
            responsive
            responsiveHeight="60dvh"
            className="max-h-[60dvh]"
          >
            <DrawerTitle className="sr-only">Select reminder time</DrawerTitle>
            {content}
          </DrawerContent>
        </Drawer>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            {content}
          </PopoverContent>
        </Popover>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${formatTimeShort(value)} reminder`}
        title="Remove reminder"
        className={cn(
          "tap-target ml-0.5 flex aspect-square items-center justify-center rounded-md text-muted-foreground transition-colors cursor-pointer outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
          height,
        )}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function NotificationManager({
  notifications,
  onChange,
  loading = false,
  size = "md",
}: NotificationManagerProps) {
  const isMobile = useIsMobile();

  const usedValues = notifications.map((n) => n.minutesBefore);
  const nextValue = [15, ...TIME_OPTIONS.map((option) => option.value)].find(
    (value) => !usedValues.includes(value),
  );

  const handleAdd = () => {
    if (nextValue === undefined) return;
    onChange([
      ...notifications,
      { notificationType: "email", minutesBefore: nextValue, isEnabled: true },
    ]);
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {notifications.map((notification, index) => (
        <ReminderChip
          key={notification.minutesBefore}
          value={notification.minutesBefore}
          takenValues={usedValues.filter((_, i) => i !== index)}
          onSelect={(value) =>
            onChange(
              notifications.map((n, i) =>
                i === index ? { ...n, minutesBefore: value } : n,
              ),
            )
          }
          onRemove={() => onChange(notifications.filter((_, i) => i !== index))}
          isMobile={isMobile}
          size={size}
        />
      ))}
      <button
        type="button"
        onClick={handleAdd}
        disabled={loading || nextValue === undefined}
        className={cn(
          CHIP_CLASS,
          size === "sm" ? "h-8" : "h-11",
          "px-2.5 bg-transparent text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <Plus className="size-3.5" />
        {notifications.length === 0 ? "Add reminder" : "Add"}
      </button>
    </div>
  );
}
