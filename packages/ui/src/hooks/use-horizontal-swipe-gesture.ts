"use client";

import { createGesture } from "@ionic/core";
import { useEffect, type RefObject } from "react";

interface UseHorizontalSwipeGestureOptions {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  threshold?: number;
  disabled?: boolean;
}

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
    if (disabled) return;
    const element = ref.current;
    if (!element) return;

    let deltaX = 0;
    let deltaY = 0;

    const gesture = createGesture({
      el: element,
      gestureName: "horizontal-swipe",
      direction: "x",
      threshold: 0,
      onMove: (detail) => {
        deltaX = detail.deltaX;
        deltaY = detail.deltaY;
      },
      onEnd: () => {
        if (Math.abs(deltaX) > threshold && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
          if (deltaX < 0) {
            onSwipeLeft();
          } else {
            onSwipeRight();
          }
        }
        deltaX = 0;
        deltaY = 0;
      },
    });

    gesture.enable(true);
    return () => {
      gesture.destroy();
    };
  }, [ref, onSwipeLeft, onSwipeRight, threshold, disabled]);
}
