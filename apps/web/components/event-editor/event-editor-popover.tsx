import React from "react";
import { createPortal } from "react-dom";
import { usePrefersReducedMotion } from "@workspace/ui/hooks";
import { gsap } from "@workspace/ui/lib/gsap";

import { EventEditorBody } from "./event-editor-body";
import { EventEditorFooter } from "./event-editor-footer";
import { EventEditorDesktopHeader } from "./event-editor-header";
import type {
  EventEditorBadgeItem,
  EventEditorFormState,
} from "./types";
import type { Calendar } from "@workspace/ui/components/calendar";
import type { UserSettings } from "@/lib/types/calendar";

type EventEditorPopoverProps = {
  anchorPosition: { x: number; y: number };
  badgeItem: EventEditorBadgeItem;
  calendars: Calendar[];
  dialogTitle: string;
  eventForm: EventEditorFormState;
  handleEventDelete: () => void;
  handleEventDownloadIcs: () => void;
  handleEventSave: () => void;
  isViewMode: boolean;
  leadingSlot: React.ReactNode;
  localSettings: UserSettings;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  recurringModal: React.ReactNode;
  setShowDescription: (value: boolean) => void;
  setShowLocation: (value: boolean) => void;
  showDescription: boolean;
  showLocation: boolean;
};

export function EventEditorPopover({
  anchorPosition,
  badgeItem,
  calendars,
  dialogTitle,
  eventForm,
  handleEventDelete,
  handleEventDownloadIcs,
  handleEventSave,
  isViewMode,
  leadingSlot,
  localSettings,
  onOpenChange,
  open,
  recurringModal,
  setShowDescription,
  setShowLocation,
  showDescription,
  showLocation,
}: EventEditorPopoverProps) {
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [position, setPosition] = React.useState<{
    top: number;
    left: number;
    maxHeight: number;
  } | null>(null);
  const positionRef = React.useRef<{
    top: number;
    left: number;
    maxHeight: number;
  } | null>(null);
  const appliedPositionRef = React.useRef<{
    top: number;
    left: number;
    maxHeight: number;
  } | null>(null);
  const allowPositionAnimationRef = React.useRef(false);

  React.useLayoutEffect(() => {
    if (!open || !anchorPosition) {
      if (!open) {
        setPosition(null);
        positionRef.current = null;
      }

      return;
    }

    const POPOVER_WIDTH = 420;
    const POPOVER_MAX_HEIGHT = 750;
    const POPOVER_MIN_HEIGHT = 320;
    const VIEWPORT_PADDING = 16;
    const GAP = 12;

    const computePosition = () => {
      const previewElement = document.querySelector(
        "[data-preview-event='true']",
      ) as HTMLElement | null;

      const rawRect = previewElement?.getBoundingClientRect();
      const hasValidRect =
        rawRect && rawRect.width > 0 && rawRect.height > 0;

      const previewRect = hasValidRect
        ? rawRect
        : {
            top: anchorPosition.y,
            left: anchorPosition.x,
            right: anchorPosition.x,
            bottom: anchorPosition.y,
            width: 0,
            height: 0,
          };

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const spaceRight =
        viewportWidth - previewRect.right - GAP - VIEWPORT_PADDING;
      const spaceLeft = previewRect.left - GAP - VIEWPORT_PADDING;

      let left = VIEWPORT_PADDING;
      if (spaceRight >= POPOVER_WIDTH) {
        left = previewRect.right + GAP;
      } else if (spaceLeft >= POPOVER_WIDTH) {
        left = previewRect.left - POPOVER_WIDTH - GAP;
      } else if (spaceRight >= spaceLeft) {
        left = viewportWidth - POPOVER_WIDTH - VIEWPORT_PADDING;
      }

      let top = previewRect.top;
      const bottomLimit = viewportHeight - VIEWPORT_PADDING;
      const viewportMax = viewportHeight - VIEWPORT_PADDING * 2;
      let measuredHeight = 0;
      const root = popoverRef.current;

      if (root) {
        const children = Array.from(root.children) as HTMLElement[];
        for (const child of children) {
          const isScrollable =
            getComputedStyle(child).overflowY !== "visible" &&
            child.scrollHeight > child.clientHeight;
          measuredHeight += isScrollable ? child.scrollHeight : child.offsetHeight;
        }

        if (measuredHeight === 0) {
          measuredHeight = root.offsetHeight;
        }

        measuredHeight += root.offsetHeight - root.clientHeight + 2;
      }

      let maxHeight = Math.min(
        POPOVER_MAX_HEIGHT,
        Math.max(measuredHeight, POPOVER_MIN_HEIGHT),
        viewportMax,
      );

      if (top + maxHeight > bottomLimit) {
        top = bottomLimit - maxHeight;
      }

      if (top < VIEWPORT_PADDING) {
        top = VIEWPORT_PADDING;
        maxHeight = Math.min(maxHeight, bottomLimit - top);
      }

      const nextPosition = { left, maxHeight, top };
      const previousPosition = positionRef.current;

      if (
        !previousPosition ||
        previousPosition.top !== nextPosition.top ||
        previousPosition.left !== nextPosition.left ||
        previousPosition.maxHeight !== nextPosition.maxHeight
      ) {
        positionRef.current = nextPosition;
        setPosition(nextPosition);
      }

      return true;
    };

    computePosition();
    const animationFrameId = requestAnimationFrame(computePosition);
    const timeoutId = window.setTimeout(computePosition, 80);
    const handleResize = () => computePosition();

    window.addEventListener("resize", handleResize);

    let resizeObserver: ResizeObserver | null = null;
    if (popoverRef.current && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => computePosition());
      resizeObserver.observe(popoverRef.current);

      for (const child of Array.from(popoverRef.current.children)) {
        resizeObserver.observe(child as HTMLElement);
        for (const grandChild of Array.from(child.children)) {
          resizeObserver.observe(grandChild as HTMLElement);
        }
      }
    }

    let mutationObserver: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined") {
      mutationObserver = new MutationObserver(() => {
        computePosition();
      });
      const previewEl = document.querySelector("[data-preview-event='true']");
      if (previewEl) {
        mutationObserver.observe(previewEl, {
          childList: true,
          subtree: true,
          attributes: true,
        });
      }
      if (popoverRef.current) {
        mutationObserver.observe(popoverRef.current, {
          childList: true,
          subtree: true,
        });
      }
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.clearTimeout(timeoutId);
      window.removeEventListener("resize", handleResize);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [anchorPosition, open, showDescription, showLocation]);

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
  }, [open, position, prefersReducedMotion]);

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
      onOpenChange(false);
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onOpenChange, open]);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
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

      onOpenChange(false);
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onOpenChange, open]);

  if (!open || !position) {
    return null;
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-50" onClick={() => onOpenChange(false)} />
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
          isViewMode={isViewMode}
          leadingSlot={leadingSlot}
          onToggleDescription={() => setShowDescription(!showDescription)}
          onToggleLocation={() => setShowLocation(!showLocation)}
          onToggleNotifications={() =>
            eventForm.setShowNotifications(!eventForm.showNotifications)
          }
          onToggleRecurring={() =>
            eventForm.setIsRecurring(!eventForm.isRecurring)
          }
          showDescription={showDescription}
          showLocation={showLocation}
          showNotifications={eventForm.showNotifications}
        />
        <EventEditorBody
          eventForm={eventForm}
          isViewMode={isViewMode}
          showLocation={showLocation}
          showDescription={showDescription}
          setShowLocation={setShowLocation}
          setShowDescription={setShowDescription}
          localSettings={localSettings}
          calendars={calendars}
          desktop
        />
        <EventEditorFooter
          isViewMode={isViewMode}
          eventForm={eventForm}
          handleEventSave={handleEventSave}
          handleEventDelete={handleEventDelete}
          handleEventDownloadIcs={handleEventDownloadIcs}
          desktop
          onClose={() => onOpenChange(false)}
        />
      </div>
      {recurringModal}
    </>,
    document.body,
  );
}