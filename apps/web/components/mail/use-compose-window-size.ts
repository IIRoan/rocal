"use client";

import { useRef, useState, type PointerEvent } from "react";

export type ComposeResizeEdge = "top" | "left" | "corner";

export const COMPOSE_WINDOW_DEFAULT_SIZE = { width: 880, height: 830 };
const MIN_SIZE = { width: 600, height: 440 };
// The window keeps an 8px gap to every viewport edge.
const VIEWPORT_MARGIN = 16;

function clampSize(width: number, height: number) {
  return {
    width: Math.round(Math.min(Math.max(width, MIN_SIZE.width), window.innerWidth - VIEWPORT_MARGIN)),
    height: Math.round(Math.min(Math.max(height, MIN_SIZE.height), window.innerHeight - VIEWPORT_MARGIN)),
  };
}

type Size = typeof COMPOSE_WINDOW_DEFAULT_SIZE;
type Drag = { edge: ComposeResizeEdge; x: number; y: number; start: Size; next: Size | null };

/** The docked compose window is anchored bottom-right, so it grows from its top and left edges; a drag writes the DOM and commits once on release. */
export function useComposeWindowSize() {
  const [size, setSize] = useState(COMPOSE_WINDOW_DEFAULT_SIZE);
  const windowRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);

  const move = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    const node = windowRef.current;
    if (!drag || !node) return;
    const next = clampSize(
      drag.edge === "top" ? drag.start.width : drag.start.width + drag.x - event.clientX,
      drag.edge === "left" ? drag.start.height : drag.start.height + drag.y - event.clientY,
    );
    drag.next = next;
    node.style.width = `${next.width}px`;
    node.style.height = `${next.height}px`;
  };

  // Browsers coalesce pointer moves, so the release position is applied too.
  const finish = (event: PointerEvent<HTMLElement>) => {
    move(event);
    const next = dragRef.current?.next;
    dragRef.current = null;
    if (next) setSize(next);
  };

  const handleProps = (edge: ComposeResizeEdge) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      const node = windowRef.current;
      if (!node || event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        edge,
        x: event.clientX,
        y: event.clientY,
        start: { width: node.offsetWidth, height: node.offsetHeight },
        next: null,
      };
    },
    onPointerMove: move,
    onPointerUp: finish,
    onPointerCancel: finish,
    onDoubleClick: () => setSize({ ...COMPOSE_WINDOW_DEFAULT_SIZE }),
  });

  return { size, windowRef, handleProps };
}
