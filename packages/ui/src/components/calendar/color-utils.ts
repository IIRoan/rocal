import type React from "react";

import type { EventColor } from "./types";

const NAMED_EVENT_COLOR_TOKENS: Record<string, string> = {
  blue: "sky",
  sky: "sky",
  violet: "violet",
  rose: "rose",
  emerald: "emerald",
  orange: "orange",
  red: "red",
  cyan: "cyan",
  lime: "lime",
  amber: "amber",
  indigo: "indigo",
  pink: "pink",
  teal: "teal",
  default: "default",
};

export function isHexColor(color: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}

function normalizeNamedEventColorToken(color?: EventColor | string): string {
  if (!color) {
    return "default";
  }

  return NAMED_EVENT_COLOR_TOKENS[color] || "default";
}

export function resolveInlineColorValue(color?: EventColor | string): string {
  if (!color) {
    return "var(--event-default)";
  }

  if (isHexColor(color)) {
    return color;
  }

  return `var(--event-${normalizeNamedEventColorToken(color)})`;
}

export function getEventColorClasses(color?: EventColor | string): string {
  const eventColor = color || "default";
  const colorToken = normalizeNamedEventColorToken(eventColor);

  if (isHexColor(eventColor)) {
    return "event-hex-adaptive shadow-sm";
  }

  switch (colorToken) {
    case "sky":
      return "bg-event-sky hover:bg-event-sky/80 text-event-sky-foreground shadow-sm";
    case "violet":
      return "bg-event-violet hover:bg-event-violet/80 text-event-violet-foreground shadow-sm";
    case "rose":
      return "bg-event-rose hover:bg-event-rose/80 text-event-rose-foreground shadow-sm";
    case "emerald":
      return "bg-event-emerald hover:bg-event-emerald/80 text-event-emerald-foreground shadow-sm";
    case "orange":
      return "bg-event-orange hover:bg-event-orange/80 text-event-orange-foreground shadow-sm";
    case "red":
      return "bg-event-red hover:bg-event-red/80 text-event-red-foreground shadow-sm";
    case "cyan":
      return "bg-event-cyan hover:bg-event-cyan/80 text-event-cyan-foreground shadow-sm";
    case "lime":
      return "bg-event-lime hover:bg-event-lime/80 text-event-lime-foreground shadow-sm";
    case "amber":
      return "bg-event-amber hover:bg-event-amber/80 text-event-amber-foreground shadow-sm";
    case "indigo":
      return "bg-event-indigo hover:bg-event-indigo/80 text-event-indigo-foreground shadow-sm";
    case "pink":
      return "bg-event-pink hover:bg-event-pink/80 text-event-pink-foreground shadow-sm";
    case "teal":
      return "bg-event-teal hover:bg-event-teal/80 text-event-teal-foreground shadow-sm";
    default:
      return "bg-event-default hover:bg-event-default/80 text-event-default-foreground shadow-sm";
  }
}

export function getEventColorStyles(
  color?: EventColor | string,
): React.CSSProperties {
  const eventColor = color || "sky";

  if (isHexColor(eventColor)) {
    return {
      "--event-hex-color": eventColor,
    } as React.CSSProperties;
  }

  return {};
}

export function resolveEventColorValue(color?: EventColor | string): string {
  return resolveInlineColorValue(color);
}

export function getColorSwatchValue(color: string): string {
  return resolveInlineColorValue(color);
}