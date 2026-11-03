/** @jest-environment jsdom */

import React, { act } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("@workspace/logger", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  }),
}));

import { useEventDeletePrompt } from "../../hooks/use-event-delete-prompt";
import type { CalendarEvent } from "@workspace/ui/components/calendar";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Prompt = ReturnType<typeof useEventDeletePrompt>;

const single = {
  id: "event-1",
  title: "Planning",
  start: new Date("2026-06-08T09:00:00.000Z"),
  end: new Date("2026-06-08T10:00:00.000Z"),
  calendarId: "calendar-1",
  userId: "user-1",
} as CalendarEvent;

const occurrence = {
  ...single,
  id: "series-1_2026-06-08T09:00:00.000Z",
  title: "Standup",
  parentEventId: "series-1",
  isRecurringInstance: true,
} as CalendarEvent;

let container: HTMLDivElement;
let root: Root;
let prompt: Prompt;
const deleteEvent = jest.fn(async (_id: string) => undefined);
const deleteRecurringEvent = jest.fn(async (_input: unknown) => undefined);

function Harness({ onReady }: { onReady: (value: Prompt) => void }) {
  const value = useEventDeletePrompt({ deleteEvent, deleteRecurringEvent });
  React.useEffect(() => {
    onReady(value);
  }, [value, onReady]);
  return null;
}

function capturePrompt(value: Prompt) {
  prompt = value;
}

describe("useEventDeletePrompt", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<Harness onReady={capturePrompt} />);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("asks for confirmation before deleting a single event", async () => {
    act(() => prompt.requestDelete(single));

    expect(prompt.confirmPrompt.open).toBe(true);
    expect(prompt.confirmPrompt.title).toBe("Delete “Planning”?");
    expect(prompt.scopePrompt.open).toBe(false);
    expect(deleteEvent).not.toHaveBeenCalled();

    await act(async () => prompt.confirmPrompt.onConfirm());

    expect(deleteEvent).toHaveBeenCalledWith("event-1");
    expect(prompt.confirmPrompt.open).toBe(false);
  });

  it("deletes nothing when the confirmation is cancelled", () => {
    act(() => prompt.requestDelete(single));
    act(() => prompt.confirmPrompt.onOpenChange(false));

    expect(prompt.confirmPrompt.open).toBe(false);
    expect(deleteEvent).not.toHaveBeenCalled();
  });

  it("asks which occurrences to delete for a recurring event", async () => {
    act(() => prompt.requestDelete(occurrence));

    expect(prompt.scopePrompt.open).toBe(true);
    expect(prompt.confirmPrompt.open).toBe(false);

    await act(async () => prompt.scopePrompt.onSelect("this_and_future"));

    expect(deleteRecurringEvent).toHaveBeenCalledWith({
      event: occurrence,
      scope: "this_and_future",
    });
    expect(deleteEvent).not.toHaveBeenCalled();
    expect(prompt.scopePrompt.open).toBe(false);
  });
});
