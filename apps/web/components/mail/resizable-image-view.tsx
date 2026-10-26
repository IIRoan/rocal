"use client";

import { useEffect, useRef, useState } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";

export function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [resizing, setResizing] = useState(false);
  const startState = useRef({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    handle: "",
  });

  const onMouseDown = (e: React.MouseEvent, handle: string) => {
    e.preventDefault();
    e.stopPropagation();
    const img = imgRef.current;
    if (!img) return;
    startState.current = {
      x: e.clientX,
      y: e.clientY,
      width: img.offsetWidth,
      height: img.offsetHeight,
      handle,
    };
    setResizing(true);
  };

  useEffect(() => {
    if (!resizing) return;

    const onMouseMove = (e: MouseEvent) => {
      const { x, width, handle } = startState.current;
      const dx = e.clientX - x;
      const newWidth =
        handle === "right" || handle === "bottom-right" || handle === "top-right"
          ? Math.max(50, width + dx)
          : Math.max(50, width - dx);
      updateAttributes({ width: Math.round(newWidth) });
    };

    const onMouseUp = () => {
      setResizing(false);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [resizing, updateAttributes]);

  const width = node.attrs.width;
  const style: React.CSSProperties = {
    ...(width ? { width: `${width}px` } : {}),
    maxWidth: "100%",
  };

  return (
    <NodeViewWrapper as="span" className="inline-block relative" draggable data-drag-handle>
      <span
        className={`relative inline-block group ${selected ? "ring-2 ring-primary rounded" : ""}`}
        style={style}
      >
        <img
          ref={imgRef}
          src={node.attrs.src}
          alt={node.attrs.alt || ""}
          title={node.attrs.title || undefined}
          style={{ width: "100%", height: "auto", display: "block" }}
          draggable={false}
        />
        {selected && (
          <>
            <span
              onMouseDown={(e) => onMouseDown(e, "right")}
              className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-8 bg-primary rounded cursor-ew-resize"
            />
            <span
              onMouseDown={(e) => onMouseDown(e, "left")}
              className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-8 bg-primary rounded cursor-ew-resize"
            />
            <span
              onMouseDown={(e) => onMouseDown(e, "bottom-right")}
              className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-primary rounded cursor-nwse-resize"
            />
          </>
        )}
      </span>
    </NodeViewWrapper>
  );
}
