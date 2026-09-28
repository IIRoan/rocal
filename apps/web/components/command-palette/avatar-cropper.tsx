"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { ZoomIn, ZoomOut } from "lucide-react";

import {
  MAX_AVATAR_ZOOM,
  avatarCropSide,
  clampAvatarCrop,
  encodeAvatarCrop,
  initialAvatarCrop,
  type AvatarCrop,
} from "@/lib/profile-picture";
import { PaletteButton } from "./palette-ui";

const VIEWPORT_PX = 240;
const CIRCLE_INSET_PX = 20;
const CIRCLE_PX = VIEWPORT_PX - CIRCLE_INSET_PX * 2;
const KEYBOARD_STEP_PX = 12;

export function AvatarCropper({
  image,
  saving,
  onCancel,
  onSave,
}: {
  image: ImageBitmap;
  saving: boolean;
  onCancel: () => void;
  onSave: (encoded: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [crop, setCrop] = useState<AvatarCrop>(() => initialAvatarCrop(image));

  const update = (change: (current: AvatarCrop) => Partial<AvatarCrop>) =>
    setCrop((current) =>
      clampAvatarCrop(image, { ...current, ...change(current) }),
    );

  /** Converts a screen-space drag into source pixels at the current zoom. */
  const panBy = (dx: number, dy: number) =>
    update((current) => {
      const perPixel = avatarCropSide(image, current.zoom) / CIRCLE_PX;
      return {
        centerX: current.centerX - dx * perPixel,
        centerY: current.centerY - dy * perPixel,
      };
    });

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = VIEWPORT_PX * ratio;
    canvas.height = VIEWPORT_PX * ratio;
    const scale = (CIRCLE_PX / avatarCropSide(image, crop.zoom)) * ratio;
    const center = (VIEWPORT_PX / 2) * ratio;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      image,
      center - crop.centerX * scale,
      center - crop.centerY * scale,
      image.width * scale,
      image.height * scale,
    );
  }, [crop, image]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Native listener: React's onWheel is passive, so it can't stop the palette from scrolling.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setCrop((current) =>
        clampAvatarCrop(image, {
          ...current,
          zoom: current.zoom * Math.exp(-event.deltaY * 0.002),
        }),
      );
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [image]);

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY };
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const last = dragRef.current;
    if (!last) return;
    dragRef.current = { x: event.clientX, y: event.clientY };
    panBy(event.clientX - last.x, event.clientY - last.y);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const step = {
      ArrowLeft: [KEYBOARD_STEP_PX, 0],
      ArrowRight: [-KEYBOARD_STEP_PX, 0],
      ArrowUp: [0, KEYBOARD_STEP_PX],
      ArrowDown: [0, -KEYBOARD_STEP_PX],
    }[event.key];
    if (!step) return;
    event.preventDefault();
    panBy(step[0], step[1]);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative overflow-hidden rounded-lg bg-muted"
        style={{ width: VIEWPORT_PX, height: VIEWPORT_PX }}
      >
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="img"
          aria-label="Profile picture crop. Drag or use the arrow keys to move, scroll to zoom."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (dragRef.current = null)}
          onPointerCancel={() => (dragRef.current = null)}
          onKeyDown={onKeyDown}
          className="size-full cursor-grab touch-none outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring/60"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-full border border-background/80 ring-[400px] ring-background/60"
          style={{ inset: CIRCLE_INSET_PX }}
        />
      </div>
      <label className="flex w-full items-center gap-2 px-2">
        <ZoomOut className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          type="range"
          min={1}
          max={MAX_AVATAR_ZOOM}
          step={0.01}
          value={crop.zoom}
          onChange={(event) =>
            update(() => ({ zoom: Number(event.target.value) }))
          }
          aria-label="Zoom"
          className="h-1 flex-1 cursor-pointer accent-primary"
        />
        <ZoomIn className="size-3.5 shrink-0 text-muted-foreground" />
      </label>
      <div className="flex w-full items-center gap-2">
        <PaletteButton
          variant="primary"
          onClick={() => onSave(encodeAvatarCrop(image, crop))}
          loading={saving}
          className="h-9 flex-1"
        >
          Save photo
        </PaletteButton>
        <PaletteButton
          variant="ghost"
          onClick={onCancel}
          disabled={saving}
          className="h-9"
        >
          Cancel
        </PaletteButton>
      </div>
    </div>
  );
}
