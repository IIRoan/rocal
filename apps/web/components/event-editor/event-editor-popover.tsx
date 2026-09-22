import React from "react";
import { createPortal } from "react-dom";
import { usePrefersReducedMotion } from "@workspace/ui/hooks";
import { gsap } from "@workspace/ui/lib/gsap";

import { useEffectEvent } from "./use-effect-event";
import { useEventEditorPopoverPosition } from "./use-event-editor-popover-position";

type EventEditorPopoverProps = {
  anchorPosition: { x: number; y: number };
  ariaLabel: string;
  children: React.ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  recurringModal: React.ReactNode;
};

export function EventEditorPopover({
  anchorPosition,
  ariaLabel,
  children,
  onOpenChange,
  open,
  recurringModal,
}: EventEditorPopoverProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const { popoverRef, position } = useEventEditorPopoverPosition({
    anchorPosition,
    open,
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

      // Nested pickers and menus dismiss themselves first.
      if (document.querySelector("[data-radix-popper-content-wrapper]")) {
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
      <dialog
        open
        ref={popoverRef}
        aria-label={ariaLabel}
        className="fixed z-50 m-0 p-0 w-[440px] bg-popover text-popover-foreground border border-border shadow-lg rounded-xl flex flex-col overflow-hidden"
        style={{
          top: position.top,
          left: position.left,
          maxHeight: position.maxHeight,
        }}
      >
        {children}
      </dialog>
      {recurringModal}
    </>,
    document.body,
  );
}
