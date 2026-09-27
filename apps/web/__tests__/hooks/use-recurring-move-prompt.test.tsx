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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";

jest.mock("../../lib/calendar-api-service", () => ({
  calendarApiService: {},
}));

jest.mock("../../lib/e2ee-notification-title", () => ({
  encryptReminderTitle: jest.fn(),
}));

jest.mock("@workspace/logger", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  }),
}));

import { useRecurringMovePrompt } from "../../hooks/use-recurring-move-prompt";
import type { CalendarEvent } from "../../lib/types/calendar";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Prompt = ReturnType<typeof useRecurringMovePrompt>;

const cachedOccurrence = {
  id: "series-1_2026-06-08T09:00:00.000Z",
  parentEventId: "series-1",
  isRecurringInstance: true,
  title: "Standup",
  start: new Date("2026-06-08T09:00:00.000Z"),
  end: new Date("2026-06-08T09:30:00.000Z"),
} as CalendarEvent;

const update = {
  start: "2026-06-09T09:00:00.000Z",
  end: "2026-06-09T09:30:00.000Z",
  allDay: false,
  timezone: "UTC",
};

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
let prompt: Prompt;
const editRecurringEvent = jest.fn(async () => undefined);

function Harness({ onReady }: { onReady: (value: Prompt) => void }) {
  const value = useRecurringMovePrompt(editRecurringEvent);
  React.useEffect(() => {
    onReady(value);
  }, [value, onReady]);
  return null;
}

function capturePrompt(value: Prompt) {
  prompt = value;
}

describe("useRecurringMovePrompt", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient();
    queryClient.setQueryData(["events", "2026-06"], [cachedOccurrence]);
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Harness onReady={capturePrompt} />
        </QueryClientProvider>,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    queryClient.clear();
    container.remove();
  });

  it("edits the cached pre-drag event with the chosen scope", async () => {
    let moved: Promise<boolean> | undefined;
    act(() => {
      moved = prompt.moveRecurringEvent(
        { id: cachedOccurrence.id, title: "Standup" } as never,
        update,
      );
    });

    expect(prompt.scopePrompt.open).toBe(true);
    expect(prompt.scopePrompt.eventTitle).toBe("Standup");

    await act(async () => {
      prompt.scopePrompt.onSelect("this_and_future");
    });

    await expect(moved).resolves.toBe(true);
    expect(prompt.scopePrompt.open).toBe(false);
    expect(editRecurringEvent).toHaveBeenCalledWith({
      event: cachedOccurrence,
      scope: "this_and_future",
      updates: update,
    });
  });

  it("resolves false without saving when the prompt is dismissed", async () => {
    let moved: Promise<boolean> | undefined;
    act(() => {
      moved = prompt.moveRecurringEvent(
        { id: cachedOccurrence.id, title: "Standup" } as never,
        update,
      );
    });

    await act(async () => {
      prompt.scopePrompt.onOpenChange(false);
    });

    await expect(moved).resolves.toBe(false);
    expect(editRecurringEvent).not.toHaveBeenCalled();
  });
});
