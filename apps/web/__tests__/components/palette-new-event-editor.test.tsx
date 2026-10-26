/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";
import type { CalendarEvent } from "@workspace/ui/components/calendar";

const mockDrafts: Array<CalendarEvent | null | undefined> = [];

jest.mock("../../components/event-editor", () => ({
  EventEditor: ({ eventToEdit }: { eventToEdit?: CalendarEvent | null }) => {
    mockDrafts.push(eventToEdit);
    return null;
  },
}));

import { PaletteNewEventEditor } from "../../components/command-palette/palette-new-event-editor";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;

beforeEach(() => {
  mockDrafts.length = 0;
  root = createRoot(document.createElement("div"));
});

afterEach(() => {
  act(() => root.unmount());
});

function render(fallbackCalendarId: string) {
  act(() =>
    root.render(
      <PaletteNewEventEditor
        open
        onOpenChange={jest.fn()}
        onBack={jest.fn()}
        localSettings={{ timezone: "UTC" } as never}
        defaultCalendarId={null}
        fallbackCalendarId={fallbackCalendarId}
      />,
    ),
  );
}

it("keeps one draft while the palette re-renders, so typed details are not reset", () => {
  render("cal-1");
  render("cal-2");

  expect(mockDrafts).toHaveLength(2);
  expect(mockDrafts[1]).toBe(mockDrafts[0]);
  expect(mockDrafts[0]).toMatchObject({ calendarId: "cal-1", title: "" });
});

it("starts a fresh draft on the next visit", () => {
  render("cal-1");
  act(() => root.unmount());
  root = createRoot(document.createElement("div"));
  render("cal-1");

  expect(mockDrafts[1]).not.toBe(mockDrafts[0]);
});
