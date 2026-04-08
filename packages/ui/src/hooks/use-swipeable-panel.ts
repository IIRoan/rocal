"use client";

import { createAnimation, createGesture } from "@ionic/core";
import { useEffect, useRef, useCallback, useState, type RefObject } from "react";

const SNAP_THRESHOLD = 0.35;
const VELOCITY_THRESHOLD = 0.3;
const OPEN_ZONE_PX = 40;
const ANIMATION_DURATION_OPEN = 240;
const ANIMATION_DURATION_CLOSE = 200;

interface UseSwipeablePanelOptions {
  panelRef: RefObject<HTMLElement | null>;
  overlayRef: RefObject<HTMLElement | null>;
  gestureTargetRef: RefObject<HTMLElement | null>;
  panelWidthPx?: number;
  gesturePriority?: number;
}

interface UseSwipeablePanelReturn {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export function useSwipeablePanel({
  panelRef,
  overlayRef,
  gestureTargetRef,
  panelWidthPx = 320,
  gesturePriority = 40,
}: UseSwipeablePanelOptions): UseSwipeablePanelReturn {
  const [isOpen, setIsOpen] = useState(false);
  const isOpenRef = useRef(false);

  const animateToOpen = useCallback(() => {
    const panel = panelRef.current;
    const overlay = overlayRef.current;

    if (!panel || !overlay) {
      isOpenRef.current = true;
      setIsOpen(true);
      return;
    }

    const panelAnim = createAnimation()
      .addElement(panel)
      .duration(ANIMATION_DURATION_OPEN)
      .easing("cubic-bezier(0.16, 1, 0.3, 1)")
      .fromTo("transform", panel.style.transform || `translateX(-${panelWidthPx}px)`, "translateX(0px)");

    const overlayAnim = createAnimation()
      .addElement(overlay)
      .duration(ANIMATION_DURATION_OPEN)
      .easing("ease-out")
      .fromTo("opacity", overlay.style.opacity || "0", "0.5");

    void Promise.all([panelAnim.play(), overlayAnim.play()]).then(() => {
      panel.style.transform = "translateX(0px)";
      overlay.style.opacity = "0.5";
      overlay.style.pointerEvents = "auto";
      isOpenRef.current = true;
      setIsOpen(true);
    });
  }, [overlayRef, panelRef, panelWidthPx]);

  const animateToClose = useCallback(() => {
    const panel = panelRef.current;
    const overlay = overlayRef.current;

    if (!panel || !overlay) {
      isOpenRef.current = false;
      setIsOpen(false);
      return;
    }

    const panelAnim = createAnimation()
      .addElement(panel)
      .duration(ANIMATION_DURATION_CLOSE)
      .easing("cubic-bezier(0.4, 0, 0.6, 1)")
      .fromTo("transform", panel.style.transform || "translateX(0px)", `translateX(-${panelWidthPx}px)`);

    const overlayAnim = createAnimation()
      .addElement(overlay)
      .duration(ANIMATION_DURATION_CLOSE)
      .easing("ease-in")
      .fromTo("opacity", overlay.style.opacity || "0.5", "0");

    void Promise.all([panelAnim.play(), overlayAnim.play()]).then(() => {
      panel.style.transform = `translateX(-${panelWidthPx}px)`;
      overlay.style.opacity = "0";
      overlay.style.pointerEvents = "none";
      isOpenRef.current = false;
      setIsOpen(false);
    });
  }, [overlayRef, panelRef, panelWidthPx]);

  useEffect(() => {
    const target = gestureTargetRef.current;
    const panel = panelRef.current;
    const overlay = overlayRef.current;

    if (!target || !panel || !overlay) return;

    const openGesture = createGesture({
      el: target,
      gestureName: "swipeable-panel-open",
      direction: "x",
      threshold: 8,
      gesturePriority,
      canStart: (detail) => {
        if (isOpenRef.current) return false;
        return detail.startX <= OPEN_ZONE_PX;
      },
      onMove: (detail) => {
        if (isOpenRef.current) return;

        const progress = Math.min(1, Math.max(0, detail.deltaX / panelWidthPx));
        const translateX = -panelWidthPx + progress * panelWidthPx;

        panel.style.transform = `translateX(${translateX}px)`;
        overlay.style.opacity = `${progress * 0.5}`;
        overlay.style.pointerEvents = "auto";
      },
      onEnd: (detail) => {
        if (isOpenRef.current) return;

        const progress = detail.deltaX / panelWidthPx;
        const shouldOpen = progress > SNAP_THRESHOLD || detail.velocityX > VELOCITY_THRESHOLD;

        if (shouldOpen) {
          animateToOpen();
        } else {
          animateToClose();
        }
      },
    });

    const closeGesture = createGesture({
      el: panel,
      gestureName: "swipeable-panel-close",
      direction: "x",
      threshold: 8,
      gesturePriority,
      canStart: (detail) => {
        return isOpenRef.current;
      },
      onMove: (detail) => {
        if (!isOpenRef.current) return;

        const progress = Math.max(0, 1 + detail.deltaX / panelWidthPx);
        const translateX = -panelWidthPx + progress * panelWidthPx;

        panel.style.transform = `translateX(${translateX}px)`;
        overlay.style.opacity = `${progress * 0.5}`;
      },
      onEnd: (detail) => {
        if (!isOpenRef.current) return;

        const progress = 1 + detail.deltaX / panelWidthPx;
        const shouldClose = progress < 1 - SNAP_THRESHOLD || detail.velocityX < -VELOCITY_THRESHOLD;

        if (shouldClose) {
          animateToClose();
        } else {
          animateToOpen();
        }
      },
    });

    openGesture.enable(true);
    closeGesture.enable(true);

    return () => {
      openGesture.destroy();
      closeGesture.destroy();
    };
  }, [animateToClose, animateToOpen, gesturePriority, gestureTargetRef, overlayRef, panelRef, panelWidthPx]);

  return {
    isOpen,
    open: animateToOpen,
    close: animateToClose,
    toggle: () => (isOpenRef.current ? animateToClose() : animateToOpen()),
  };
}
