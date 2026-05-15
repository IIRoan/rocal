import type { ComponentProps, ReactNode } from "react";
import type { Calendar } from "@workspace/ui/components/calendar";
import { EncryptionStatusBadge } from "@workspace/ui/components/calendar";

import { useEventForm } from "@/hooks/use-event-form";
import type { UserSettings } from "@/lib/types/calendar";

export type EventEditorFormState = ReturnType<typeof useEventForm>;
export type EventEditorBadgeItem = ComponentProps<
  typeof EncryptionStatusBadge
>["item"];

export type EventEditorBodyProps = {
  calendars: Calendar[];
  desktop?: boolean;
  eventForm: EventEditorFormState;
  isViewMode: boolean;
  localSettings: UserSettings | null | undefined;
  setShowDescription: (value: boolean) => void;
  setShowLocation: (value: boolean) => void;
  showDescription: boolean;
  showLocation: boolean;
};

export type EventEditorFooterProps = {
  desktop?: boolean;
  eventForm: EventEditorFormState;
  handleEventDelete: () => void;
  handleEventDownloadIcs: () => void;
  handleEventSave: () => void;
  isViewMode: boolean;
  onBack?: () => void;
  onClose?: () => void;
};

export type EventEditorDesktopHeaderProps = {
  badgeItem: EventEditorBadgeItem;
  dialogTitle: string;
  isRecurring: boolean;
  isViewMode: boolean;
  leadingSlot: ReactNode;
  onToggleDescription: () => void;
  onToggleLocation: () => void;
  onToggleNotifications: () => void;
  onToggleRecurring: () => void;
  showDescription: boolean;
  showLocation: boolean;
  showNotifications: boolean;
};
