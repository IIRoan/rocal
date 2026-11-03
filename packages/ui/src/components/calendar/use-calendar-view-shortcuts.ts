"use client";

import { useEffect, useEffectEvent } from "react";

import { CALENDAR_VIEWS, type CalendarView } from "./types";

/** Plain letters, since browsers keep ⌘W and ⌘T for themselves and the page never sees them. */
export const CALENDAR_VIEW_SHORTCUTS: Record<CalendarView, string> = {
  month: "M",
  week: "W",
  "3day": "T",
  day: "D",
  agenda: "A",
};

/** Letters type text in fields, and jump between items in open menus and dialogs. */
function isShortcutBlocked(event: KeyboardEvent) {
  if (
    event.defaultPrevented ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey
  ) {
    return true;
  }
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable ||
    target.closest(
      "dialog, [role='dialog'], [role='alertdialog'], [role='menu']",
    ) !== null
  );
}

export function useCalendarViewShortcuts(
  onViewChange: (view: CalendarView) => void,
) {
  const changeView = useEffectEvent(onViewChange);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isShortcutBlocked(event)) return;
      const key = event.key.toUpperCase();
      const view = CALENDAR_VIEWS.find(
        (candidate) => CALENDAR_VIEW_SHORTCUTS[candidate] === key,
      );
      if (!view) return;
      event.preventDefault();
      changeView(view);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}
