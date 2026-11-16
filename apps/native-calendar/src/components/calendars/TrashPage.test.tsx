/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Alert, type AlertButton } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CalendarEvent, TrashedCalendarEvent } from "@workspace/calendar-core";
import { TrashPage } from "./TrashPage";

const mockToast = jest.fn();
const mockApi = {
  listTrashedEvents: jest.fn<Promise<TrashedCalendarEvent[]>, []>(),
  restoreTrashedEvent: jest.fn<Promise<CalendarEvent>, [string]>(),
  deleteTrashedEvent: jest.fn<Promise<unknown>, [string]>(),
  emptyEventTrash: jest.fn<Promise<unknown>, []>(),
};

jest.mock("react-native", () => ({ Alert: { alert: jest.fn() } }));
jest.mock("@workspace/native-core/lib/api", () => ({
  get calendarApiService() {
    return mockApi;
  },
}));
jest.mock("@workspace/native-core/hooks/use-user-timezone", () => ({
  useUserTimezone: () => "Europe/Amsterdam",
}));
jest.mock("@workspace/native-core/providers/ToastProvider", () => ({
  useToast: () => ({ toast: mockToast }),
}));
jest.mock("@workspace/native-core/components/sheet/SheetSections", () => {
  const Slot = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    SheetScroll: Slot,
    SheetSection: Slot,
    SheetGroup: Slot,
    SheetCenteredState: ({ message }: { message: string }) => <p>{message}</p>,
    SheetItem: ({ label, detail, onPress }: { label: string; detail?: string; onPress?: () => void }) => (
      <button onClick={onPress}>
        {label}
        {detail ? ` — ${detail}` : ""}
      </button>
    ),
  };
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const entry: TrashedCalendarEvent = {
  id: "trash-1",
  eventId: "event-1",
  calendarId: "gone",
  calendarMissing: true,
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
let queryClient: QueryClient;
const alert = Alert.alert as jest.Mock;

async function settle(action: () => unknown) {
  await act(async () => {
    await action();
  });
  for (let index = 0; index < 3; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function renderPage() {
  await settle(() =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <TrashPage />
      </QueryClientProvider>,
    ),
  );
}

function button(text: string) {
  const found = Array.from(container.querySelectorAll("button")).find((node) =>
    node.textContent?.startsWith(text),
  );
  if (!found) throw new Error(`No button ${text}`);
  return found;
}

async function choose(label: string) {
  const buttons: AlertButton[] = alert.mock.calls.at(-1)?.[2] ?? [];
  await settle(() => buttons.find((entryButton) => entryButton.text === label)?.onPress?.());
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(["calendars"], [{ id: "personal", name: "Personal" }]);
  jest.clearAllMocks();
  mockApi.listTrashedEvents.mockResolvedValue([entry]);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("TrashPage", () => {
  it("lists deleted events with when they go for good", async () => {
    await renderPage();
    expect(button("Dentist").textContent).toContain("Mon 2 Mar 2099 · Deleted 14 Nov · removed 14 Dec");
  });

  it("restores from the row's menu and names the calendar a restore fell back to", async () => {
    mockApi.restoreTrashedEvent.mockResolvedValue({ id: "event-1", calendarId: "personal" } as CalendarEvent);
    await renderPage();

    await settle(() => button("Dentist").click());
    await choose("Restore");

    expect(mockApi.restoreTrashedEvent).toHaveBeenCalledWith("trash-1");
    expect(mockToast).toHaveBeenCalledWith("Restored to Personal", "success");
  });

  it("deletes one event forever and empties the trash after a confirm", async () => {
    mockApi.deleteTrashedEvent.mockResolvedValue({ success: true });
    mockApi.emptyEventTrash.mockResolvedValue({ success: true });
    await renderPage();

    await settle(() => button("Dentist").click());
    await choose("Delete forever");
    expect(mockApi.deleteTrashedEvent).toHaveBeenCalledWith("trash-1");

    mockApi.listTrashedEvents.mockResolvedValue([{ ...entry, id: "trash-2" }]);
    await settle(() => queryClient.invalidateQueries());
    await settle(() => button("Empty trash").click());
    expect(mockApi.emptyEventTrash).not.toHaveBeenCalled();
    await choose("Empty trash");
    expect(mockApi.emptyEventTrash).toHaveBeenCalled();
  });

  it("says the trash is empty, and shows a load failure", async () => {
    mockApi.listTrashedEvents.mockResolvedValue([]);
    await renderPage();
    expect(container.textContent).toContain("Trash is empty. Deleted events stay here for 30 days.");

    mockApi.listTrashedEvents.mockRejectedValue(new Error("Failed to load deleted events"));
    await settle(() => queryClient.resetQueries());
    expect(container.textContent).toContain("Failed to load deleted events");
  });
});
