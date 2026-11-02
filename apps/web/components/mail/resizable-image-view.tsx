"use client";

import { useRef } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";

export function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);

  const onMouseDown = (e: React.MouseEvent, handle: "left" | "right" | "bottom-right") => {
    e.preventDefault();
    e.stopPropagation();
    const img = imgRef.current;
    if (!img) return;
    const startX = e.clientX;
    const startWidth = img.offsetWidth;

    const onMouseMove = (event: MouseEvent) => {
      const dx = event.clientX - startX;
      const newWidth = handle === "left" ? startWidth - dx : startWidth + dx;
      updateAttributes({ width: Math.round(Math.max(50, newWidth)) });
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const width = node.attrs.width;
  const style: React.CSSProperties = {
    ...(width ? { width: `${width}px` } : {}),
    maxWidth: "100%",
  };

  return (
    <NodeViewWrapper as="span" className="inline-block relative" draggable data-drag-handle>
      <span
        className={`relative inline-block group ${selected ? "ring-2 ring-accent rounded" : ""}`}
        style={style}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={node.attrs.src}
          alt={node.attrs.alt || ""}
          title={node.attrs.title || undefined}
          style={{ width: "100%", height: "auto", display: "block" }}
          draggable={false}
        />
        {/* Drag handles are a pointer shortcut; the formatting toolbar resizes a selected image by keyboard. */}
        {selected && (
          <>
            <span
              role="presentation"
              onMouseDown={(e) => onMouseDown(e, "right")}
              className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-8 bg-accent rounded cursor-ew-resize"
            />
            <span
              role="presentation"
              onMouseDown={(e) => onMouseDown(e, "left")}
              className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-8 bg-accent rounded cursor-ew-resize"
            />
            <span
              role="presentation"
              onMouseDown={(e) => onMouseDown(e, "bottom-right")}
              className="absolute -bottom-1.5 -right-1.5 size-3 bg-accent rounded cursor-nwse-resize"
            />
          </>
        )}
      </span>
    </NodeViewWrapper>
  );
}
