"use client";

import { ImageDithering } from "@paper-design/shaders-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const WALLPAPER_SRC = "/wallpaper.jpg";

const DARK_PALETTE = {
  colorBack: "#212121",
  colorFront: "#5c4a2c",
  colorHighlight: "#f0d9a0",
} as const;

const LIGHT_PALETTE = {
  colorBack: "#f8f8f8",
  colorFront: "#5a4a36",
  colorHighlight: "#8a7050",
} as const;

const subscribeNoop = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function WallpaperBackdrop() {
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribeNoop,
    getClientSnapshot,
    getServerSnapshot,
  );

  const isDark = !mounted || resolvedTheme !== "light";
  const palette = isDark ? DARK_PALETTE : LIGHT_PALETTE;

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-background">
      <div
        className="absolute inset-0 opacity-[0.6] will-change-transform"
        style={{
          transformOrigin: "26% 32%",
          transform: "translate(20%, 10%) scale(1.78)",
        }}
      >
        <ImageDithering
          className="size-full"
          width="100%"
          height="100%"
          image={WALLPAPER_SRC}
          colorBack={palette.colorBack}
          colorFront={palette.colorFront}
          colorHighlight={palette.colorHighlight}
          inverted
          originalColors={false}
          type="8x8"
          size={2}
          colorSteps={3}
          fit="cover"
        />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_52%_50%_at_16%_38%,var(--background)_22%,transparent_64%)]" />
      <div className="absolute inset-y-0 left-0 w-[42%] bg-gradient-to-r from-background/55 via-background/18 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[22%] bg-gradient-to-t from-background via-background/40 to-transparent [mask-image:linear-gradient(to_right,black_0%,black_45%,transparent_78%)]" />
    </div>
  );
}
