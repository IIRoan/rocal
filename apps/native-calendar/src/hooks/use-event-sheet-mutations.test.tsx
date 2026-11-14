/** @jest-environment jsdom */

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CalendarEvent } from "@workspace/calendar-core";
import type { ToastOptions } from "@workspace/native-core/providers/ToastProvider";
import { useDeleteEventMutation } from "./use-event-sheet-mutations";

const mockToast = jest.fn<void, [string, string?, ToastOptions?]>();
const mockApi = {
  deleteEvent: jest.fn<Promise<{ success: boolean; message: string; trashId?: string }>, [string]>(),
  restoreTrashedEvent: jest.fn<Promise<CalendarEvent>, [string]>(),
};

jest.mock("@workspace/native-core/lib/api", () => ({
  get calendarApiService() {
    return mockApi;
  },
}));
jest.mock("@workspace/native-core/providers/ToastProvider", () => ({
  useToast: () => ({ toast: mockToast }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const event = {
  id: "event-1",
  title: "Dentist",
  calendarId: "cal-1",
  userId: "user-1",
  start: new Date("2099-03-02T08:00:00.000Z"),
  end: new Date("2099-03-02T09:00:00.000Z"),
} as CalendarEvent;

let root: Root;
let remove: ReturnType<typeof useDeleteEventMutation>;

function Probe({ onReady }: { onReady: (value: typeof remove) => void }) {
  const value = useDeleteEventMutation({ event, onDismiss: () => {} });
  useEffect(() => onReady(value));
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  root = createRoot(document.createElement("div"));
  act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <Probe
          onReady={(value) => {
            remove = value;
          }}
        />
      </QueryClientProvider>,
    );
  });
});

afterEach(() => act(() => root.unmount()));

describe("useDeleteEventMutation", () => {
  it("offers Undo for an event that went to the trash and restores it from the toast", async () => {
    mockApi.deleteEvent.mockResolvedValue({ success: true, message: "", trashId: "trash-1" });
    mockApi.restoreTrashedEvent.mockResolvedValue({ ...event });

    await act(async () => remove.mutateAsync({}));
    const [message, variant, options] = mockToast.mock.calls.at(-1) ?? [];
    expect([message, variant, options?.action?.label]).toEqual(["Event moved to Trash", "success", "Undo"]);

    await act(async () => options?.action?.onPress());
    expect(mockApi.restoreTrashedEvent).toHaveBeenCalledWith("trash-1");
    expect(mockToast).toHaveBeenLastCalledWith("Event restored");
  });

  it("only confirms a delete that left nothing to restore", async () => {
    mockApi.deleteEvent.mockResolvedValue({ success: true, message: "" });

    await act(async () => remove.mutateAsync({}));

    expect(mockToast).toHaveBeenLastCalledWith("Event deleted");
  });
});
