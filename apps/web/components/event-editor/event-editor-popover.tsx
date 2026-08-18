import React from "react";
import { createPortal } from "react-dom";
import { usePrefersReducedMotion } from "@workspace/ui/hooks";
import { gsap } from "@workspace/ui/lib/gsap";

import { EventEditorBody } from "./event-editor-body";
import { EventEditorFooter } from "./event-editor-footer";
import { EventEditorDesktopHeader } from "./event-editor-header";
import { useEffectEvent } from "./use-effect-event";
import { useEventEditorPopoverPosition } from "./use-event-editor-popover-position";
import type {
  EventEditorBadgeItem,
  EventEditorFormState,
  EventEditorInvitationResponseStatus,
  EventEditorViewFlags,
  EventEditorVisibleSections,
} from "./types";
import type { Calendar } from "@workspace/ui/components/calendar";
import type { UserSettings } from "@/lib/types/calendar";

type EventEditorPopoverProps = {
  anchorPosition: { x: number; y: number };
  badgeItem: EventEditorBadgeItem;
  calendars: Calendar[];
  dialogTitle: string;
  eventForm: EventEditorFormState;
  flags: Pick<EventEditorViewFlags, "canEdit" | "isViewMode">;
  handleEventDelete: () => void;
  handleEventDownloadIcs: () => void;
  handleEventSave: () => void;
  invitationResponsePending: EventEditorInvitationResponseStatus | null;
  invitationStatus: EventEditorInvitationResponseStatus | null;
  leadingSlot: React.ReactNode;
  localSettings: UserSettings;
  onInvitationResponse: (
    status: EventEditorInvitationResponseStatus,
  ) => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  recurringModal: React.ReactNode;
  setShowDescription: (value: boolean) => void;
  setShowLocation: (value: boolean) => void;
  setShowParticipants: (value: boolean) => void;
  visibleSections: Pick<
    EventEditorVisibleSections,
    "description" | "location" | "participants"
  >;
};

export function EventEditorPopover({
  anchorPosition,
  badgeItem,
  calendars,
  dialogTitle,
  eventForm,
  flags,
  handleEventDelete,
  handleEventDownloadIcs,
  handleEventSave,
  invitationResponsePending,
  invitationStatus,
  leadingSlot,
  localSettings,
  onInvitationResponse,
  onOpenChange,
  open,
  recurringModal,
  setShowDescription,
  setShowLocation,
  setShowParticipants,
  visibleSections,
}: EventEditorPopoverProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const { popoverRef, position } = useEventEditorPopoverPosition({
    anchorPosition,
    open,
    sectionKey: [
      visibleSections.description,
      visibleSections.location,
      visibleSections.participants,
    ].join(":"),
  });
  const appliedPositionRef = React.useRef<{
    top: number;
    left: number;
    maxHeight: number;
  } | null>(null);
  const allowPositionAnimationRef = React.useRef(false);
  const closePopover = useEffectEvent(() => {
    onOpenChange(false);
  });

  React.useEffect(() => {
    if (!open) {
      allowPositionAnimationRef.current = false;
      return;
    }

    allowPositionAnimationRef.current = false;
    const timeoutId = window.setTimeout(() => {
      allowPositionAnimationRef.current = true;
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
      allowPositionAnimationRef.current = false;
    };
  }, [open]);

  React.useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!open || !position || !popover) {
      appliedPositionRef.current = null;
      return;
    }

    const previousPosition = appliedPositionRef.current;

    if (
      !previousPosition ||
      prefersReducedMotion ||
      !allowPositionAnimationRef.current
    ) {
      gsap.set(popover, {
        top: position.top,
        left: position.left,
        maxHeight: position.maxHeight,
      });
    } else if (
      previousPosition.top !== position.top ||
      previousPosition.left !== position.left ||
      previousPosition.maxHeight !== position.maxHeight
    ) {
      gsap.killTweensOf(popover);
      gsap.fromTo(
        popover,
        {
          top: previousPosition.top,
          left: previousPosition.left,
          maxHeight: previousPosition.maxHeight,
        },
        {
          top: position.top,
          left: position.left,
          maxHeight: position.maxHeight,
          duration: 0.22,
          ease: "power2.out",
          overwrite: "auto",
        },
      );
    }

    appliedPositionRef.current = position;

    return () => {
      gsap.killTweensOf(popover);
    };
  }, [open, popoverRef, position, prefersReducedMotion]);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      closePopover();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const ignoreUntil = Date.now() + 100;
    const handleClickOutside = (event: MouseEvent) => {
      if (Date.now() < ignoreUntil) {
        return;
      }

      if (popoverRef.current?.contains(event.target as Node)) {
        return;
      }

      const target = event.target as HTMLElement;
      if (
        target.closest("[data-radix-popper-content-wrapper]") ||
        target.closest("[role='listbox']") ||
        target.closest("[role='dialog']")
      ) {
        return;
      }

      closePopover();
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, popoverRef]);

  if (!open || !position || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close event editor"
        className="fixed inset-0 z-50 appearance-none"
        onClick={() => onOpenChange(false)}
      />
      <div
        ref={popoverRef}
        className="fixed z-50 w-[420px] bg-popover border border-border shadow-xl rounded-lg flex flex-col overflow-hidden"
        style={{
          top: position.top,
          left: position.left,
          maxHeight: position.maxHeight,
        }}
      >
        <EventEditorDesktopHeader
          badgeItem={badgeItem}
          dialogTitle={dialogTitle}
          isRecurring={eventForm.isRecurring}
          isViewMode={flags.isViewMode}
          leadingSlot={leadingSlot}
          onToggleDescription={() =>
            setShowDescription(!visibleSections.description)
          }
          onToggleLocation={() => setShowLocation(!visibleSections.location)}
          onToggleNotifications={() =>
            eventForm.setShowNotifications(!eventForm.showNotifications)
          }
          onToggleParticipants={() =>
            setShowParticipants(!visibleSections.participants)
          }
          onToggleRecurring={() =>
            eventForm.setIsRecurring(!eventForm.isRecurring)
          }
          showDescription={visibleSections.description}
          showLocation={visibleSections.location}
          showNotifications={eventForm.showNotifications}
          showParticipants={visibleSections.participants}
        />
        <EventEditorBody
          eventForm={eventForm}
          isViewMode={flags.isViewMode}
          visibleSections={visibleSections}
          setShowLocation={setShowLocation}
          setShowDescription={setShowDescription}
          setShowParticipants={setShowParticipants}
          localSettings={localSettings}
          calendars={calendars}
          desktop
        />
        <EventEditorFooter
          canEditEvent={flags.canEdit}
          isViewMode={flags.isViewMode}
          eventForm={eventForm}
          handleEventSave={handleEventSave}
          handleEventDelete={handleEventDelete}
          handleEventDownloadIcs={handleEventDownloadIcs}
          invitationResponsePending={invitationResponsePending}
          invitationStatus={invitationStatus}
          onInvitationResponse={onInvitationResponse}
          desktop
          onClose={() => onOpenChange(false)}
        />
      </div>
      {recurringModal}
    </>,
    document.body,
  );
}
