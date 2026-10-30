/** @jest-environment jsdom */

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { storedEventId as mockStoredEventId, type CalendarEvent } from "@workspace/calendar-core";
import { useEventReminders } from "./use-event-reminders";
import { useUpdateEventMutation } from "./use-event-sheet-mutations";

const SERIES_ID = "series-1";
const OCCURRENCE_A = `${SERIES_ID}_2026-11-03T09:00:00.000Z`;
const OCCURRENCE_B = `${SERIES_ID}_2026-11-10T09:00:00.000Z`;

const mockSeries = {
  id: SERIES_ID,
  title: "Standup",
  calendarId: "cal-1",
  userId: "user-1",
  recurrence: '{"frequency":"weekly","interval":1}',
  start: new Date("2026-10-06T09:00:00.000Z"),
  end: new Date("2026-10-06T09:30:00.000Z"),
} as CalendarEvent;

const occurrenceA = {
  ...mockSeries,
  id: OCCURRENCE_A,
  parentEventId: SERIES_ID,
  isRecurringInstance: true,
  start: new Date("2026-11-03T09:00:00.000Z"),
  end: new Date("2026-11-03T09:30:00.000Z"),
} as CalendarEvent;

// Stands in for the server: reminders live on the stored row, which an occurrence id resolves to.
const mockServerReminders: Record<string, number[]> = {};

jest.mock("@workspace/native-core/lib/api", () => ({
  calendarApiService: {
    getEventNotifications: async (id: string) => ({
      success: true,
      data: {
        notifications: (mockServerReminders[mockStoredEventId(id)] ?? []).map(
          (minutesBefore) => ({
            notificationType: "email",
            minutesBefore,
            isEnabled: true,
          }),
        ),
      },
    }),
    updateEventNotifications: async (
      id: string,
      notifications: { minutesBefore: number }[],
    ) => {
      mockServerReminders[id] = notifications.map((n) => n.minutesBefore);
      return { success: true };
    },
    getEvent: async () => mockSeries,
    editRecurringEvent: async () => mockSeries,
  },
}));

jest.mock("@workspace/native-core/providers/ToastProvider", () => ({
  useToast: () => ({ toast: () => undefined }),
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type UpdateMutation = ReturnType<typeof useUpdateEventMutation>;

function Probe({
  onReminders,
  onMutation,
}: {
  onReminders: (reminders: number[]) => void;
  onMutation: (mutation: UpdateMutation) => void;
}) {
  const { reminders } = useEventReminders(OCCURRENCE_B, null);
  const mutation = useUpdateEventMutation({
    event: occurrenceA,
    editScope: "all",
    userEmail: "owner@solace.test",
    encryptReminderTitle: async () => undefined,
    recordUsage: () => undefined,
    onDismiss: () => undefined,
    onServerErrors: () => undefined,
  });
  useEffect(() => onReminders(reminders));
  useEffect(() => onMutation(mutation));
  return null;
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

let root: Root;
let queryClient: QueryClient;

beforeEach(() => {
  mockServerReminders[SERIES_ID] = [10];
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  root = createRoot(document.createElement("div"));
});

afterEach(() => {
  act(() => root.unmount());
  queryClient.clear();
});

describe("useEventReminders", () => {
  it("shows another occurrence the reminders saved through a series edit", async () => {
    let reminders: number[] = [];
    let mutation: UpdateMutation | undefined;
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Probe
            onReminders={(next) => {
              reminders = next;
            }}
            onMutation={(next) => {
              mutation = next;
            }}
          />
        </QueryClientProvider>,
      );
    });
    await settle();
    expect(reminders).toEqual([10]);

    await act(async () => {
      await mutation?.mutateAsync({
        request: {
          title: "Standup",
          start: occurrenceA.start.toISOString(),
          end: occurrenceA.end.toISOString(),
          calendarId: "cal-1",
        },
        reminders: [10, 60],
      });
    });
    await settle();

    expect(mockServerReminders[SERIES_ID]).toEqual([10, 60]);
    expect(reminders).toEqual([10, 60]);
  });
});
