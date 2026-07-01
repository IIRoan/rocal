"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

export type MailKeyboardShortcutActions = {
  navigatePrev: () => void;
  navigateNext: () => void;
  reply: () => void;
  replyAll: () => void;
  forward: () => void;
  archive: () => void;
  deleteMessage: () => void;
  toggleFlagged: () => void;
  markAsRead: () => void;
  markAsUnread: () => void;
  toggleReadUnread: () => void;
  compose: () => void;
  refresh: () => void;
  closeMessage: () => void;
  focusSearch: () => void;
};

function isEditableTarget(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable ||
    target.getAttribute("contenteditable") === "true" ||
    target.getAttribute("contenteditable") === ""
  );
}

const SHORTCUT_LABELS: { key: string; label: string }[] = [
  { key: "j", label: "Next message" },
  { key: "k", label: "Previous message" },
  { key: "r", label: "Reply" },
  { key: "R", label: "Reply all" },
  { key: "f", label: "Forward" },
  { key: "e", label: "Archive" },
  { key: "#", label: "Delete" },
  { key: "s", label: "Star / unstar" },
  { key: "u", label: "Mark unread / read" },
  { key: "c", label: "Compose" },
  { key: "/", label: "Search" },
  { key: "Escape", label: "Close message" },
];

export function getMailShortcutHelpItems() {
  return SHORTCUT_LABELS;
}

export function showMailShortcutHelp() {
  const items = SHORTCUT_LABELS.map(
    ({ key, label }) => `**${key === " " ? "Space" : key}** — ${label}`,
  );
  toast.message("Keyboard shortcuts", {
    description: items.join("\n"),
    duration: 8000,
  });
}

export function useMailKeyboardShortcuts(
  actions: MailKeyboardShortcutActions,
  enabled: boolean,
) {
  const actionsRef = useRef(actions);
  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event)) return;

      const key = event.key;

      switch (key) {
        case "j":
          event.preventDefault();
          actionsRef.current.navigateNext();
          break;
        case "k":
          event.preventDefault();
          actionsRef.current.navigatePrev();
          break;
        case "r":
          event.preventDefault();
          actionsRef.current.reply();
          break;
        case "R":
          event.preventDefault();
          actionsRef.current.replyAll();
          break;
        case "f":
          event.preventDefault();
          actionsRef.current.forward();
          break;
        case "e":
          event.preventDefault();
          actionsRef.current.archive();
          break;
        case "#":
          event.preventDefault();
          actionsRef.current.deleteMessage();
          break;
        case "s":
          event.preventDefault();
          actionsRef.current.toggleFlagged();
          break;
        case "u":
          event.preventDefault();
          actionsRef.current.toggleReadUnread();
          break;
        case "c":
          event.preventDefault();
          actionsRef.current.compose();
          break;
        case "/":
          event.preventDefault();
          actionsRef.current.focusSearch();
          break;
        case "Escape":
          event.preventDefault();
          actionsRef.current.closeMessage();
          break;
        case "?":
          event.preventDefault();
          showMailShortcutHelp();
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
