import type { ComponentProps, ReactNode } from "react";
import type { Calendar } from "@workspace/ui/components/calendar";
import { EncryptionStatusBadge } from "@workspace/ui/components/calendar";

import { useEventForm } from "@/hooks/use-event-form";
import type { UserSettings } from "@/lib/types/calendar";

export type EventEditorFormState = ReturnType<typeof useEventForm>;
export type EventEditorBadgeItem = ComponentProps<
  typeof EncryptionStatusBadge
>["item"];
export type EventEditorInvitationResponseStatus =
  | "accepted"
  | "declined"
  | "tentative";

export type EventEditorBodyProps = {
  calendars: Calendar[];
  desktop?: boolean;
  eventForm: EventEditorFormState;
  isViewMode: boolean;
  localSettings: UserSettings | null | undefined;
  onSubmit: () => void;
};

export type EventEditorFooterProps = {
  canEditEvent: boolean;
  desktop?: boolean;
  eventForm: EventEditorFormState;
  handleEventDelete: () => void;
  handleEventDownloadIcs: () => void;
  handleEventSave: () => void;
  invitationResponsePending: EventEditorInvitationResponseStatus | null;
  invitationStatus: EventEditorInvitationResponseStatus | null;
  isViewMode: boolean;
  onInvitationResponse: (
    status: EventEditorInvitationResponseStatus,
  ) => void | Promise<void>;
  onBack?: () => void;
  onClose?: () => void;
};

export type EventEditorDesktopHeaderProps = {
  badgeItem: EventEditorBadgeItem;
  dialogTitle: string;
  leadingSlot: ReactNode;
  onClose?: () => void;
};

export type EventEditorViewLayout =
  | "mobile"
  | "popover"
  | "embedded"
  | "dialog";

export type EventEditorViewFlags = {
  canEdit: boolean;
  isRecurring: boolean;
  isViewMode: boolean;
};

export type EventEditorViewProps = {
  anchorPosition: { x: number; y: number } | null;
  badgeItem: EventEditorBadgeItem;
  calendars: Calendar[];
  dialogTitle: string;
  eventForm: EventEditorFormState;
  flags: EventEditorViewFlags;
  handleEventDelete: () => void;
  handleEventDownloadIcs: () => void;
  handleEventSave: () => void;
  handleInvitationResponse: (
    status: EventEditorInvitationResponseStatus,
  ) => void;
  invitationResponsePending: EventEditorInvitationResponseStatus | null;
  invitationStatus: EventEditorInvitationResponseStatus | null;
  layout: EventEditorViewLayout;
  localSettings: UserSettings;
  onBack: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  recurringModal: ReactNode;
};
