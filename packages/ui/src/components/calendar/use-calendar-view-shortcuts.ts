"use client";

import { useEffect, useEffectEvent } from "react";

import type { CalendarView } from "./types";

/** Plain letters, since browsers keep ⌘W and ⌘T for themselves and the page never sees them. */
export const CALENDAR_VIEW_SHORTCUTS: Record<CalendarView, string> = {
  month: "M",
  week: "W",
  "3day": "T",
  day: "D",
  agenda: "A",
};

type CalendarShortcutAction =
  | { type: "view"; view: CalendarView }
  | {
      type: "previous" | "next" | "today" | "goToDate" | "create" | "search" | "help";
    };

export type CalendarShortcut = {
  key: string;
  label: string;
  action: CalendarShortcutAction;
};

const viewShortcut = (view: CalendarView, label: string): CalendarShortcut => ({
  key: CALENDAR_VIEW_SHORTCUTS[view],
  label,
  action: { type: "view", view },
});

/** J/K match mail's next/previous; N is "now" because T is already the 3-day view. */
export const CALENDAR_SHORTCUTS: CalendarShortcut[] = [
  viewShortcut("month", "Month view"),
  viewShortcut("week", "Week view"),
  viewShortcut("3day", "3-day view"),
  viewShortcut("day", "Day view"),
  viewShortcut("agenda", "Agenda view"),
  { key: "J", label: "Next period", action: { type: "next" } },
  { key: "K", label: "Previous period", action: { type: "previous" } },
  { key: "N", label: "Today", action: { type: "today" } },
  { key: "G", label: "Go to date", action: { type: "goToDate" } },
  { key: "C", label: "New event", action: { type: "create" } },
  { key: "/", label: "Search", action: { type: "search" } },
  { key: "?", label: "Keyboard shortcuts", action: { type: "help" } },
];

export type CalendarShortcutActions = {
  onViewChange: (view: CalendarView) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onToday?: () => void;
  onGoToDate?: () => void;
  onCreate?: () => void;
  onSearch?: () => void;
  onHelp?: () => void;
};

/** Letters type text in fields, and jump between items in selects, open menus and dialogs; Shift only reaches symbols such as ? on any layout. */
function isShortcutBlocked(event: KeyboardEvent) {
  if (
    event.defaultPrevented ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    (event.shiftKey && /^[a-z]$/i.test(event.key))
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
    // Dialogs stay mounted while closed for their exit motion, and focus can stay behind in one.
    target.closest(
      "dialog[open], [role='combobox'], [role='listbox'], :is([role='dialog'], [role='alertdialog'], [role='menu']):not([data-state='closed'])",
    ) !== null
  );
}

function actionHandler(
  action: CalendarShortcutAction,
  actions: CalendarShortcutActions,
): (() => void) | undefined {
  switch (action.type) {
    case "view":
      return () => actions.onViewChange(action.view);
    case "previous":
      return actions.onPrevious;
    case "next":
      return actions.onNext;
    case "today":
      return actions.onToday;
    case "goToDate":
      return actions.onGoToDate;
    case "create":
      return actions.onCreate;
    case "search":
      return actions.onSearch;
    case "help":
      return actions.onHelp;
  }
}

/** Single-key shortcuts; `enabled` false turns every one off (WCAG 2.1.4). */
export function useCalendarShortcuts(
  actions: CalendarShortcutActions,
  enabled: boolean,
) {
  const runShortcut = useEffectEvent((shortcut: CalendarShortcut) => {
    const handler = actionHandler(shortcut.action, actions);
    handler?.();
    return Boolean(handler);
  });

  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isShortcutBlocked(event)) return;
      const key = event.key.toUpperCase();
      const shortcut = CALENDAR_SHORTCUTS.find(
        (candidate) => candidate.key === key,
      );
      if (shortcut && runShortcut(shortcut)) event.preventDefault();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
