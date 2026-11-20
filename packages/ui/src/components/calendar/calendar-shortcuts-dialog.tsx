"use client";

import { formatShortcut, useIsApplePlatform } from "../../hooks/use-shortcut-label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { CALENDAR_SHORTCUTS } from "./use-calendar-view-shortcuts";

const KEY_CAP_CLASS =
  "rounded bg-muted px-1.5 py-0.5 font-sans text-[11px] font-medium text-foreground";

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="justify-self-end">
        <kbd className={KEY_CAP_CLASS}>{keys}</kbd>
      </dd>
    </>
  );
}

export function CalendarShortcutsDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const apple = useIsApplePlatform();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100dvw-1rem)] sm:w-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Turn single-key shortcuts off in Settings, under Calendar Defaults.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2 px-5 pb-5 text-sm">
          {CALENDAR_SHORTCUTS.map(({ key, label }) => (
            <ShortcutRow key={key} keys={key} label={label} />
          ))}
          <ShortcutRow keys={formatShortcut(".", apple)} label="Commands" />
          <ShortcutRow keys="Ctrl+J" label="Search everything" />
        </dl>
      </DialogContent>
    </Dialog>
  );
}
