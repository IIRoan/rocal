import type { ComponentProps } from "react";
import type { Feather } from "@expo/vector-icons";
import type { MailSwipeAction } from "@workspace/calendar-core";

export type MailSwipeSpec = {
  name: Exclude<MailSwipeAction, "none">;
  icon: ComponentProps<typeof Feather>["name"];
  label: string;
  destructive: boolean;
  dismisses: boolean;
  run: () => void | Promise<unknown>;
};

export type MailSwipeRowState = {
  ids: string[];
  latestId: string;
  read: boolean;
  flagged: boolean;
};

export type MailSwipeHandlers = {
  onToggleRead: (ids: string[], read: boolean) => void;
  onTrash?: (ids: string[]) => void | Promise<unknown>;
  onArchive?: (ids: string[]) => void | Promise<unknown>;
  onToggleStar: (messageId: string, flagged: boolean) => void;
  onMove: (ids: string[]) => void;
};

/** The swipe for one configured action, or `undefined` when it has no target on this row. */
export function resolveMailSwipeSpec(
  action: MailSwipeAction,
  row: MailSwipeRowState,
  handlers: MailSwipeHandlers,
): MailSwipeSpec | undefined {
  const { onArchive, onTrash } = handlers;
  switch (action) {
    case "read":
      return {
        name: "read",
        icon: row.read ? "mail" : "check",
        label: row.read ? "Mark as unread" : "Mark as read",
        destructive: false,
        dismisses: false,
        run: () => handlers.onToggleRead(row.ids, row.read),
      };
    case "archive":
      return onArchive
        ? {
            name: "archive",
            icon: "archive",
            label: "Archive",
            destructive: false,
            dismisses: true,
            run: () => onArchive(row.ids),
          }
        : undefined;
    case "trash":
      return onTrash
        ? {
            name: "trash",
            icon: "trash-2",
            label: "Move to trash",
            destructive: true,
            dismisses: true,
            run: () => onTrash(row.ids),
          }
        : undefined;
    case "star":
      return {
        name: "star",
        icon: "star",
        label: row.flagged ? "Unstar" : "Star",
        destructive: false,
        dismisses: false,
        run: () => handlers.onToggleStar(row.latestId, row.flagged),
      };
    case "move":
      return {
        name: "move",
        icon: "folder",
        label: "Move to…",
        destructive: false,
        dismisses: false,
        run: () => handlers.onMove(row.ids),
      };
    case "none":
      return undefined;
  }
}

/** Both configured swipes plus read and trash, so screen readers keep today's actions even with swipes off. */
export function resolveMailSwipeAccessibilityActions(
  right: MailSwipeAction,
  left: MailSwipeAction,
  row: MailSwipeRowState,
  handlers: MailSwipeHandlers,
): MailSwipeSpec[] {
  const specs: MailSwipeSpec[] = [];
  for (const action of [right, left, "read", "trash"] as const) {
    const spec = resolveMailSwipeSpec(action, row, handlers);
    if (spec && !specs.some((existing) => existing.name === spec.name)) {
      specs.push(spec);
    }
  }
  return specs;
}
