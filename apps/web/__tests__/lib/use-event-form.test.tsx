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
  calendarApiService: {
    deleteRecurringEvent: jest.fn(),
    getEventNotifications: jest.fn(),
    updateEventNotifications: jest.fn(),
    validateRecurrence: jest.fn(),
  },
}));

jest.mock("@workspace/logger", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  }),
}));

import { calendarApiService } from "../../lib/calendar-api-service";
import { useEventForm } from "../../hooks/use-event-form";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockGetEventNotifications =
  calendarApiService.getEventNotifications as jest.MockedFunction<
    typeof calendarApiService.getEventNotifications
  >;

const calendars = [
  {
    color: "blue",
    id: "cal-1",
    isSyncOnly: false,
    name: "Primary",
  },
] as any;

const localSettings = {
  timezone: "UTC",
} as any;

const baseEvent = {
  allDay: false,
  calendarId: "cal-1",
  createdAt: new Date("2026-04-23T09:00:00.000Z"),
  end: new Date("2026-04-23T11:00:00.000Z"),
  id: "event-1",
  start: new Date("2026-04-23T10:00:00.000Z"),
  title: "Encrypted event",
  updatedAt: new Date("2026-04-23T09:00:00.000Z"),
  userId: "user-1",
} as any;

let container: HTMLDivElement;
let queryClient: QueryClient;
let root: Root;
let latestForm: ReturnType<typeof useEventForm> | null;

function Harness() {
  latestForm = useEventForm({
    calendars,
    localSettings,
    onClose: () => {},
  });

  return null;
}

describe("useEventForm reminder hydration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    latestForm = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    root = createRoot(container);

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Harness />
        </QueryClientProvider>,
      );
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    queryClient.clear();
    container.remove();
  });

  it("auto-enables the reminder section when notification rows are loaded", async () => {
    mockGetEventNotifications.mockResolvedValue({
      data: {
        notifications: [
          {
            id: "notif-1",
            isEnabled: true,
            minutesBefore: 45,
            notificationType: "email",
          },
        ],
      },
      success: true,
    } as any);

    await act(async () => {
      await (latestForm!.loadEventData as any)(baseEvent);
    });

    expect(mockGetEventNotifications).toHaveBeenCalledWith("event-1");
    expect(latestForm?.eventNotifications).toEqual([
      {
        id: "notif-1",
        isEnabled: true,
        minutesBefore: 45,
        notificationType: "email",
      },
    ]);
    expect(latestForm?.showNotifications).toBe(true);
  });

  it("falls back to the legacy reminder when no notification rows exist", async () => {
    mockGetEventNotifications.mockResolvedValue({
      data: { notifications: [] },
      success: true,
    } as any);

    await act(async () => {
      await (latestForm!.loadEventData as any)({
        ...baseEvent,
        reminder: 30,
      });
    });

    expect(latestForm?.eventNotifications).toEqual([
      {
        isEnabled: true,
        minutesBefore: 30,
        notificationType: "email",
      },
    ]);
    expect(latestForm?.showNotifications).toBe(true);
  });

  it("keeps the reminder section collapsed when no reminders exist", async () => {
    mockGetEventNotifications.mockResolvedValue({
      data: { notifications: [] },
      success: true,
    } as any);

    await act(async () => {
      await (latestForm!.loadEventData as any)(baseEvent);
    });

    expect(latestForm?.eventNotifications).toEqual([]);
    expect(latestForm?.showNotifications).toBe(false);
  });
});