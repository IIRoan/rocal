"use client";

import { useEffect, type RefObject } from "react";

interface UseHorizontalSwipeGestureOptions {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  threshold?: number;
  disabled?: boolean;
}

const HORIZONTAL_SWIPE_RATIO = 1.25;

export function useHorizontalSwipeGesture<T extends HTMLElement>(
  ref: RefObject<T | null>,
  {
    onSwipeLeft,
    onSwipeRight,
    threshold = 40,
    disabled = false,
  }: UseHorizontalSwipeGestureOptions,
) {
  useEffect(() => {
    if (disabled || typeof window === "undefined") return;

    const element = ref.current;
    if (!element) return;

    let startX = 0;
    let startY = 0;
    let deltaX = 0;
    let deltaY = 0;
    let isTracking = false;

    const reset = () => {
      startX = 0;
      startY = 0;
      deltaX = 0;
      deltaY = 0;
      isTracking = false;
    };

    const startTracking = (clientX: number, clientY: number) => {
      startX = clientX;
      startY = clientY;
      deltaX = 0;
      deltaY = 0;
      isTracking = true;
    };

    const updateTracking = (clientX: number, clientY: number) => {
      if (!isTracking) return;

      deltaX = clientX - startX;
      deltaY = clientY - startY;
    };

    const finishTracking = () => {
      if (!isTracking) return;

      const shouldTriggerSwipe =
        Math.abs(deltaX) > threshold &&
        Math.abs(deltaX) > Math.abs(deltaY) * HORIZONTAL_SWIPE_RATIO;

      const completedDeltaX = deltaX;
      reset();

      if (!shouldTriggerSwipe) {
        return;
      }

      if (completedDeltaX < 0) {
        onSwipeLeft();
        return;
      }

      onSwipeRight();
    };

    if ("PointerEvent" in window) {
      const handlePointerDown = (event: PointerEvent) => {
        if (!event.isPrimary || event.pointerType === "mouse") return;

        startTracking(event.clientX, event.clientY);
      };

      const handlePointerMove = (event: PointerEvent) => {
        if (!event.isPrimary) return;

        updateTracking(event.clientX, event.clientY);
      };

      const handlePointerUp = (event: PointerEvent) => {
        if (!event.isPrimary) return;

        updateTracking(event.clientX, event.clientY);
        finishTracking();
      };

      const handlePointerCancel = () => {
        reset();
      };

      element.addEventListener("pointerdown", handlePointerDown, {
        passive: true,
      });
      window.addEventListener("pointermove", handlePointerMove, {
        passive: true,
      });
      window.addEventListener("pointerup", handlePointerUp, {
        passive: true,
      });
      window.addEventListener("pointercancel", handlePointerCancel, {
        passive: true,
      });

      return () => {
        element.removeEventListener("pointerdown", handlePointerDown);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerCancel);
      };
    }

    const getTouchPoint = (event: TouchEvent) => {
      return event.changedTouches[0] ?? event.touches[0] ?? null;
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        reset();
        return;
      }

      const touch = getTouchPoint(event);
      if (!touch) return;

      startTracking(touch.clientX, touch.clientY);
    };

    const handleTouchMove = (event: TouchEvent) => {
      const touch = getTouchPoint(event);
      if (!touch) return;

      updateTracking(touch.clientX, touch.clientY);
    };

    const handleTouchEnd = (event: TouchEvent) => {
      const touch = getTouchPoint(event);
      if (touch) {
        updateTracking(touch.clientX, touch.clientY);
      }

      finishTracking();
    };

    const handleTouchCancel = () => {
      reset();
    };

    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchmove", handleTouchMove, { passive: true });
    element.addEventListener("touchend", handleTouchEnd, { passive: true });
    element.addEventListener("touchcancel", handleTouchCancel, {
      passive: true,
    });

    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
      element.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [ref, onSwipeLeft, onSwipeRight, threshold, disabled]);
}
