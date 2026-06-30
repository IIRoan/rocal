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

jest.mock("@/lib/auth-client", () => ({
  useSession: jest.fn(() => ({
    data: { user: { id: "user-1", email: "alice@example.com" } },
    isPending: false,
  })),
  signOut: jest.fn(),
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
const mockUpdateEventNotifications =
  calendarApiService.updateEventNotifications as jest.MockedFunction<
    typeof calendarApiService.updateEventNotifications
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
let latestFormRef: { current: ReturnType<typeof useEventForm> | null };

function Harness({
  onReady,
}: {
  onReady: (form: ReturnType<typeof useEventForm>) => void;
}) {
  const form = useEventForm({
    calendars,
    localSettings,
    onClose: () => {},
  });

  React.useEffect(() => {
    onReady(form);
  }, [form, onReady]);

  return null;
}

describe("useEventForm reminder hydration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateEventNotifications.mockResolvedValue({
      message: "ok",
      success: true,
    } as any);
    latestFormRef = { current: null };
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
          <Harness
            onReady={(form) => {
              latestFormRef.current = form;
            }}
          />
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
      await (latestFormRef.current!.loadEventData as any)(baseEvent);
    });

    expect(mockGetEventNotifications).toHaveBeenCalledWith("event-1");
    expect(latestFormRef.current?.eventNotifications).toEqual([
      {
        id: "notif-1",
        isEnabled: true,
        minutesBefore: 45,
        notificationType: "email",
      },
    ]);
    expect(latestFormRef.current?.showNotifications).toBe(true);
  });

  it("falls back to the legacy reminder when no notification rows exist", async () => {
    mockGetEventNotifications.mockResolvedValue({
      data: { notifications: [] },
      success: true,
    } as any);

    await act(async () => {
      await (latestFormRef.current!.loadEventData as any)({
        ...baseEvent,
        reminder: 30,
      });
    });

    expect(latestFormRef.current?.eventNotifications).toEqual([
      {
        isEnabled: true,
        minutesBefore: 30,
        notificationType: "email",
      },
    ]);
    expect(latestFormRef.current?.showNotifications).toBe(true);
  });

  it("keeps the reminder section collapsed when no reminders exist", async () => {
    mockGetEventNotifications.mockResolvedValue({
      data: { notifications: [] },
      success: true,
    } as any);

    await act(async () => {
      await (latestFormRef.current!.loadEventData as any)(baseEvent);
    });

    expect(latestFormRef.current?.eventNotifications).toEqual([]);
    expect(latestFormRef.current?.showNotifications).toBe(false);
  });

  it("does not re-add the removed minimum reminder when a later reminder remains", async () => {
    const futureEvent = {
      ...baseEvent,
      end: new Date("2099-04-24T17:30:00.000Z"),
      reminder: 15,
      start: new Date("2099-04-24T16:45:00.000Z"),
      title: "Reminder reshuffle",
    };
    const calendarData = {
      updateEvent: jest.fn(async (_eventId: string, event: any) => ({
        ...futureEvent,
        ...event,
        id: "event-1",
        reminder: 30,
        start: new Date(event.start),
        end: new Date(event.end),
        updatedAt: new Date("2099-04-24T12:00:00.000Z"),
      })),
    };

    mockGetEventNotifications.mockResolvedValueOnce({
      data: {
        notifications: [
          {
            id: "notif-15",
            isEnabled: true,
            minutesBefore: 15,
            notificationType: "email",
          },
          {
            id: "notif-30",
            isEnabled: true,
            minutesBefore: 30,
            notificationType: "email",
          },
        ],
      },
      success: true,
    } as any);

    await act(async () => {
      await latestFormRef.current!.loadEventData(futureEvent as any);
    });

    act(() => {
      latestFormRef.current!.handleNotificationChange([
        {
          id: "notif-30",
          isEnabled: true,
          minutesBefore: 30,
          notificationType: "email",
        },
      ]);
    });

    await act(async () => {
      await latestFormRef.current!.handleEventSave(calendarData);
    });

    expect(calendarData.updateEvent).toHaveBeenCalledWith("event-1", {
      title: "Reminder reshuffle",
      description: undefined,
      start: "2099-04-24T16:45:00.000Z",
      end: "2099-04-24T17:30:00.000Z",
      timezone: "UTC",
      allDay: false,
      location: undefined,
      calendarId: "cal-1",
      participants: [],
      reminder: 30,
      recurrence: null,
    });
    expect(mockUpdateEventNotifications).toHaveBeenCalledWith("event-1", [
      {
        isEnabled: true,
        minutesBefore: 30,
        notificationType: "email",
      },
    ]);
  });

  it("clears the last reminder without requiring manual legacy reminder resets", async () => {
    const futureEvent = {
      ...baseEvent,
      end: new Date("2099-04-24T17:30:00.000Z"),
      reminder: 15,
      start: new Date("2099-04-24T16:45:00.000Z"),
      title: "Last reminder removal",
    };
    const calendarData = {
      updateEvent: jest.fn(async (_eventId: string, event: any) => ({
        ...futureEvent,
        ...event,
        id: "event-1",
        reminder: null,
        start: new Date(event.start),
        end: new Date(event.end),
        updatedAt: new Date("2099-04-24T12:00:00.000Z"),
      })),
    };

    mockGetEventNotifications.mockResolvedValueOnce({
      data: {
        notifications: [
          {
            id: "notif-15",
            isEnabled: true,
            minutesBefore: 15,
            notificationType: "email",
          },
        ],
      },
      success: true,
    } as any);

    await act(async () => {
      await latestFormRef.current!.loadEventData(futureEvent as any);
    });

    act(() => {
      latestFormRef.current!.handleNotificationChange([]);
      latestFormRef.current!.setShowNotifications(false);
    });

    await act(async () => {
      await latestFormRef.current!.handleEventSave(calendarData);
    });

    expect(calendarData.updateEvent).toHaveBeenCalledWith("event-1", {
      title: "Last reminder removal",
      description: undefined,
      start: "2099-04-24T16:45:00.000Z",
      end: "2099-04-24T17:30:00.000Z",
      timezone: "UTC",
      allDay: false,
      location: undefined,
      calendarId: "cal-1",
      participants: [],
      reminder: null,
      recurrence: null,
    });
    expect(mockUpdateEventNotifications).toHaveBeenCalledWith("event-1", []);
  });

  it("clears persisted notifications when the last reminder is removed and the event is saved", async () => {
    const futureEvent = {
      ...baseEvent,
      end: new Date("2099-04-24T17:30:00.000Z"),
      reminder: 15,
      start: new Date("2099-04-24T16:45:00.000Z"),
      title: "Manon winkel",
    };
    const eventsQueryKey = [
      "events",
      "2099-04-01T00:00:00.000Z",
      "2099-04-30T23:59:59.999Z",
    ] as const;
    const calendarData = {
      updateEvent: jest.fn(async (_eventId: string, event: any) => ({
        ...futureEvent,
        ...event,
        id: "event-1",
        reminder: null,
        start: new Date(event.start),
        end: new Date(event.end),
        updatedAt: new Date("2099-04-24T12:00:00.000Z"),
      })),
    };

    queryClient.setQueryData(eventsQueryKey, [futureEvent]);

    mockGetEventNotifications.mockResolvedValueOnce({
      data: {
        notifications: [
          {
            id: "notif-15",
            isEnabled: true,
            minutesBefore: 15,
            notificationType: "email",
          },
        ],
      },
      success: true,
    } as any);

    await act(async () => {
      await latestFormRef.current!.loadEventData(futureEvent as any);
    });

    act(() => {
      latestFormRef.current!.handleNotificationChange([]);
      latestFormRef.current!.setShowNotifications(false);
    });

    await act(async () => {
      await latestFormRef.current!.handleEventSave(calendarData);
    });

    expect(calendarData.updateEvent).toHaveBeenCalledWith("event-1", {
      title: "Manon winkel",
      description: undefined,
      start: "2099-04-24T16:45:00.000Z",
      end: "2099-04-24T17:30:00.000Z",
      timezone: "UTC",
      allDay: false,
      location: undefined,
      calendarId: "cal-1",
      participants: [],
      reminder: null,
      recurrence: null,
    });
    expect(mockUpdateEventNotifications).toHaveBeenCalledWith("event-1", []);

    const cachedEvents =
      queryClient.getQueryData<readonly any[]>(eventsQueryKey);
    expect(cachedEvents).toEqual([
      expect.objectContaining({
        id: "event-1",
        reminder: null,
        title: "Manon winkel",
      }),
    ]);

    mockGetEventNotifications.mockResolvedValueOnce({
      data: { notifications: [] },
      success: true,
    } as any);

    await act(async () => {
      await latestFormRef.current!.loadEventData(cachedEvents?.[0] as any);
    });

    expect(latestFormRef.current?.eventReminder).toBeNull();
    expect(latestFormRef.current?.eventNotifications).toEqual([]);
    expect(latestFormRef.current?.showNotifications).toBe(false);
  });
});
