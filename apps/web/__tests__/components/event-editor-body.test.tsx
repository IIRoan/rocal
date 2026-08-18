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

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@workspace/ui/components/calendar", () => ({
  NotificationManager: () => null,
  formatEventDescription: (value: string) => value,
  getColorSwatchValue: () => "#3b82f6",
}));

jest.mock("@workspace/ui/components/ui/avatar", () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarImage: ({ alt }: { alt?: string }) => <div aria-label={alt} />,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));
jest.mock("@workspace/ui/components/ui/alert", () => ({
  Alert: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock("@workspace/ui/components/ui/calendar", () => ({
  Calendar: () => null,
}));
jest.mock("@workspace/ui/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
jest.mock("@workspace/ui/components/ui/checkbox", () => ({
  Checkbox: () => null,
}));
jest.mock("@workspace/ui/components/ui/drawer", () => ({
  Drawer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DrawerContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DrawerTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@workspace/ui/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));
jest.mock("@workspace/ui/components/ui/label", () => ({
  Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));
jest.mock("@workspace/ui/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@workspace/ui/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
}));
jest.mock("@workspace/ui/components/ui/switch", () => ({
  Switch: () => null,
}));
jest.mock("@workspace/ui/components/ui/textarea", () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
}));
jest.mock("@workspace/ui/components/ui/autocompletetimepicker", () => ({
  ShadcnAutocomleteTimePicker: () => null,
}));
jest.mock("lucide-react", () => new Proxy({}, { get: () => () => null }));

jest.mock("../../components/command-palette/recurring-event-form", () => ({
  RecurringEventForm: () => null,
}));
jest.mock("../../components/event-editor/event-editor-field-toggles", () => ({
  EventEditorFieldToggles: () => null,
}));
jest.mock("../../lib/event-propagation", () => ({
  stopEventPropagation: () => undefined,
}));
jest.mock("../../lib/event-editor-view-model", () => ({
  formatReminderMinutes: (value: number) => `${value} minutes`,
  getEnabledEmailReminderMinutes: () => [],
  getEventDateDisplay: () => ({
    isSameDay: true,
    label: "Tue, May 27",
    startLabel: "Tue, May 27",
    endLabel: "Tue, May 27",
  }),
  getRecurringRuleSummary: () => "Every week",
}));

import { EventEditorBody } from "../../components/event-editor/event-editor-body";

let container: HTMLDivElement;
let root: Root;

describe("EventEditorBody", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders event participants in view mode", async () => {
    await act(async () => {
      root.render(
        <EventEditorBody
          calendars={[
            {
              id: "cal-1",
              name: "Primary",
              color: "blue",
              kind: "owned",
              isPublic: false,
              isVisible: true,
              isDefault: true,
              isSyncOnly: false,
              userId: "user-1",
              createdAt: new Date("2026-05-27T09:00:00.000Z"),
              updatedAt: new Date("2026-05-27T09:00:00.000Z"),
            },
          ]}
          desktop={true}
          isViewMode={true}
          localSettings={{ timeFormat: "24h" } as any}
          setShowDescription={() => {}}
          setShowLocation={() => {}}
          setShowParticipants={() => {}}
          visibleSections={{
            description: true,
            location: true,
            participants: true,
          }}
          eventForm={
            {
              eventAllDay: false,
              eventCalendarId: "cal-1",
              eventDescription: "",
              eventEndDate: new Date("2026-05-27T11:00:00.000Z"),
              eventEndTime: "11:00",
              eventLocation: "",
              eventNotifications: [],
              eventParticipants: [
                {
                  email: "owner@example.com",
                  displayName: "Owner",
                  role: "organizer",
                  status: "accepted",
                },
                {
                  email: "teammate@example.com",
                  displayName: "Teammate",
                  role: "attendee",
                  status: "pending",
                },
              ],
              eventStartDate: new Date("2026-05-27T10:00:00.000Z"),
              eventStartTime: "10:00",
              eventTitle: "Planning sync",
              eventViewMode: "view",
              isRecurring: false,
              notificationsLoading: false,
              recurrenceRule: null,
              selectedEvent: {
                id: "event-1",
                calendarId: "cal-1",
                title: "Planning sync",
                start: new Date("2026-05-27T10:00:00.000Z"),
                end: new Date("2026-05-27T11:00:00.000Z"),
                userId: "user-1",
                createdAt: new Date("2026-05-27T09:00:00.000Z"),
                updatedAt: new Date("2026-05-27T09:00:00.000Z"),
                participants: [
                  {
                    id: "participant-1",
                    eventId: "event-1",
                    email: "owner@example.com",
                    displayName: "Owner",
                    role: "organizer",
                    status: "accepted",
                    image: "https://example.com/owner.png",
                  },
                  {
                    id: "participant-2",
                    eventId: "event-1",
                    email: "teammate@example.com",
                    displayName: "Teammate",
                    role: "attendee",
                    status: "pending",
                  },
                ],
              },
              showNotifications: false,
            } as any
          }
        />,
      );
    });

    expect(container.textContent).toContain("Owner");
    expect(container.textContent).toContain("Organizer");
    expect(container.textContent).toContain("Teammate");
    expect(container.textContent).toContain("Invited");
    expect(
      container.querySelector('div[aria-label="owner@example.com"]'),
    ).not.toBeNull();
  });

  it("shows a cancelled banner for cancelled events in view mode", async () => {
    await act(async () => {
      root.render(
        <EventEditorBody
          calendars={[
            {
              id: "cal-1",
              name: "Primary",
              color: "blue",
              kind: "owned",
              isPublic: false,
              isVisible: true,
              isDefault: true,
              isSyncOnly: false,
              userId: "user-1",
              createdAt: new Date("2026-05-27T09:00:00.000Z"),
              updatedAt: new Date("2026-05-27T09:00:00.000Z"),
            },
          ]}
          desktop={true}
          isViewMode={true}
          localSettings={{ timeFormat: "24h" } as any}
          setShowDescription={() => {}}
          setShowLocation={() => {}}
          setShowParticipants={() => {}}
          visibleSections={{
            description: true,
            location: true,
            participants: true,
          }}
          eventForm={
            {
              eventAllDay: false,
              eventCalendarId: "cal-1",
              eventDescription: "",
              eventEndDate: new Date("2026-05-27T11:00:00.000Z"),
              eventEndTime: "11:00",
              eventLocation: "",
              eventNotifications: [],
              eventParticipants: [],
              eventStartDate: new Date("2026-05-27T10:00:00.000Z"),
              eventStartTime: "10:00",
              eventTitle: "Planning sync",
              eventViewMode: "view",
              isRecurring: false,
              notificationsLoading: false,
              recurrenceRule: null,
              selectedEvent: {
                id: "event-1",
                calendarId: "cal-1",
                title: "Planning sync",
                start: new Date("2026-05-27T10:00:00.000Z"),
                end: new Date("2026-05-27T11:00:00.000Z"),
                userId: "user-1",
                isCancelled: true,
                createdAt: new Date("2026-05-27T09:00:00.000Z"),
                updatedAt: new Date("2026-05-27T09:00:00.000Z"),
              },
              showNotifications: false,
            } as any
          }
        />,
      );
    });

    expect(container.textContent).toContain("Cancelled event");
    expect(container.textContent).toContain(
      "It stays on your calendar until you remove it.",
    );
  });
});
