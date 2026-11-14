/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import type { TrashedCalendarEvent } from "@workspace/calendar-core";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("lucide-react", () => {
  const Icon = () => null;
  return { ChevronLeft: Icon, Loader2: Icon, RotateCcw: Icon, Trash2: Icon };
});

jest.mock("../../hooks/use-settings", () => ({
  useSettings: () => ({ settings: { timezone: "Europe/Amsterdam" } }),
}));

jest.mock("../../lib/calendar-api-service", () => ({
  calendarApiService: {
    listTrashedEvents: jest.fn(),
    restoreTrashedEvent: jest.fn(),
    deleteTrashedEvent: jest.fn(),
    emptyEventTrash: jest.fn(),
  },
}));

jest.mock("../../components/event-editor/event-confirm-dialog", () => ({
  EventConfirmDialog: ({
    title,
    confirmLabel,
    onConfirm,
  }: {
    title: string;
    confirmLabel: string;
    onConfirm: () => void;
  }) => (
    <div role="dialog" aria-label={title}>
      <button type="button" onClick={onConfirm}>
        Confirm {confirmLabel}
      </button>
    </div>
  ),
}));

import { EventTrashView } from "../../components/calendar-manager/event-trash-view";
import { calendarApiService } from "../../lib/calendar-api-service";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const api = jest.mocked(calendarApiService);

const entry: TrashedCalendarEvent = {
  id: "trash-1",
  eventId: "event-1",
  calendarId: "cal-1",
  calendarMissing: false,
  title: "Dentist",
  start: new Date("2099-03-02T08:00:00.000Z"),
  end: new Date("2099-03-02T09:00:00.000Z"),
  allDay: false,
  timezone: "Europe/Amsterdam",
  recurrence: null,
  trashedAt: new Date("2026-11-14T12:00:00.000Z"),
  purgeAt: new Date("2026-12-14T12:00:00.000Z"),
};

let container: HTMLDivElement;
let root: Root;

async function renderView() {
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <EventTrashView onBack={() => {}} />
      </QueryClientProvider>,
    );
  });
  for (let index = 0; index < 3; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function button(text: string) {
  const found = Array.from(container.querySelectorAll("button")).find(
    (node) => node.textContent?.trim() === text,
  );
  if (!found) throw new Error(`No button ${text}`);
  return found;
}

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("EventTrashView", () => {
  it("lists deleted events with their dates and restores one", async () => {
    api.listTrashedEvents.mockResolvedValue([entry]);
    api.restoreTrashedEvent.mockResolvedValue({ ...entry, id: "event-1" } as never);
    await renderView();

    expect(container.textContent).toContain("Dentist");
    expect(container.textContent).toContain("Mon 2 Mar 2099 · Deleted 14 Nov · removed 14 Dec");
    expect(button("Restore").getAttribute("aria-describedby")).toBeTruthy();

    await act(async () => button("Restore").click());
    expect(api.restoreTrashedEvent).toHaveBeenCalledWith("trash-1");
  });

  it("asks before deleting one event forever or emptying the trash", async () => {
    api.listTrashedEvents.mockResolvedValue([entry]);
    api.deleteTrashedEvent.mockResolvedValue({ success: true, message: "" });
    api.emptyEventTrash.mockResolvedValue({ success: true, message: "" });
    await renderView();

    await act(async () => button("Delete forever").click());
    expect(api.deleteTrashedEvent).not.toHaveBeenCalled();
    expect(container.querySelector("[role=dialog]")?.getAttribute("aria-label")).toBe(
      "Delete “Dentist” forever?",
    );
    await act(async () => button("Confirm Delete forever").click());
    expect(api.deleteTrashedEvent).toHaveBeenCalledWith("trash-1");
  });

  it("empties the trash after a confirm", async () => {
    api.listTrashedEvents.mockResolvedValue([entry]);
    api.emptyEventTrash.mockResolvedValue({ success: true, message: "" });
    await renderView();

    await act(async () => button("Empty trash").click());
    expect(api.emptyEventTrash).not.toHaveBeenCalled();
    await act(async () => button("Confirm Empty trash").click());
    expect(api.emptyEventTrash).toHaveBeenCalled();
  });

  it("says the trash is empty", async () => {
    api.listTrashedEvents.mockResolvedValue([]);
    await renderView();
    expect(container.textContent).toContain("Trash is empty. Deleted events stay here for 30 days.");
    expect(container.textContent).not.toContain("Empty trash");
  });

  it("shows a load failure with a retry", async () => {
    api.listTrashedEvents.mockRejectedValueOnce(new Error("Failed to load deleted events"));
    await renderView();
    expect(container.querySelector("[role=alert]")?.textContent).toBe("Failed to load deleted events");

    api.listTrashedEvents.mockResolvedValue([entry]);
    await act(async () => button("Try again").click());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.textContent).toContain("Dentist");
  });
});
