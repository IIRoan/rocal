import { useLayoutEffect, useRef, useState, type RefObject } from "react";

type PopoverPosition = {
  top: number;
  left: number;
  maxHeight: number;
};

export function useEventEditorPopoverPosition({
  anchorPosition,
  open,
  sectionKey,
}: {
  anchorPosition: { x: number; y: number };
  open: boolean;
  sectionKey: string;
}): {
  popoverRef: RefObject<HTMLDivElement | null>;
  position: PopoverPosition | null;
} {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const positionRef = useRef<PopoverPosition | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorPosition) {
      if (!open) {
        queueMicrotask(() => setPosition(null));
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

      const previewRect = previewElement?.getBoundingClientRect();
      const hasValidPreviewRect =
        previewRect && previewRect.width > 0 && previewRect.height > 0;

      const fallbackRect = {
        top: anchorPosition.y,
        left: anchorPosition.x,
        right: anchorPosition.x,
        bottom: anchorPosition.y,
        width: 0,
        height: 0,
      };
      const anchorRect = hasValidPreviewRect ? previewRect : fallbackRect;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const spaceRight =
        viewportWidth - anchorRect.right - GAP - VIEWPORT_PADDING;
      const spaceLeft = anchorRect.left - GAP - VIEWPORT_PADDING;

      let left = VIEWPORT_PADDING;
      if (spaceRight >= POPOVER_WIDTH) {
        left = anchorRect.right + GAP;
      } else if (spaceLeft >= POPOVER_WIDTH) {
        left = anchorRect.left - POPOVER_WIDTH - GAP;
      } else if (spaceRight >= spaceLeft) {
        left = viewportWidth - POPOVER_WIDTH - VIEWPORT_PADDING;
      }

      let top = anchorRect.top;
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
          measuredHeight += isScrollable
            ? child.scrollHeight
            : child.offsetHeight;
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
  }, [anchorPosition, open, sectionKey]);

  return { popoverRef, position };
}
