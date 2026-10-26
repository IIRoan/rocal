"use client";

import { useState, type ComponentProps } from "react";
import { createDraftCalendarEvent } from "@/lib/calendar-event-drafts";
import { EventEditor } from "../event-editor";

type PaletteNewEventEditorProps = Omit<
  ComponentProps<typeof EventEditor>,
  "eventToEdit"
> & {
  defaultCalendarId?: string | null;
  fallbackCalendarId?: string | null;
};

/** The editor reloads whenever its event changes, so the draft is made once per visit to keep palette re-renders from wiping it. */
export function PaletteNewEventEditor({
  defaultCalendarId,
  fallbackCalendarId,
  ...editorProps
}: PaletteNewEventEditorProps) {
  const [draft] = useState(() =>
    createDraftCalendarEvent({ defaultCalendarId, fallbackCalendarId }),
  );
  return <EventEditor {...editorProps} eventToEdit={draft} />;
}
