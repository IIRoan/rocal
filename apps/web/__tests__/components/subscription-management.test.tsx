/** @jest-environment jsdom */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { NATIONAL_HOLIDAY_CALENDARS } from "@workspace/calendar-ics";
import { SubscriptionManagement } from "@/components/subscription-management";
import type { CalendarSubscription } from "@/lib/types/calendar";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockSync = jest.fn();
const mockBack = jest.fn();
const mockNavigate = jest.fn();
const mockToastError = jest.fn();
const mockRefetch = jest.fn(async () => undefined);
let mockSubscriptions: CalendarSubscription[] = [];
let mockQueryError: Error | null = null;

jest.mock("@/hooks/use-calendar-data", () => ({
  useCalendarData: () => ({ calendars: [], refetchCalendars: mockRefetch }),
}));
jest.mock("@/hooks/use-subscriptions", () => ({
  useSubscriptions: () => ({
    data: mockSubscriptions,
    isLoading: false,
    error: mockQueryError,
    refetch: mockRefetch,
  }),
  useCreateSubscriptionMutation: () => ({
    mutate: mockCreate,
    isPending: false,
  }),
  useUpdateSubscriptionMutation: () => ({
    mutate: mockUpdate,
    isPending: false,
  }),
  useDeleteSubscriptionMutation: () => ({
    mutate: mockDelete,
    isPending: false,
  }),
  useSyncSubscriptionMutation: () => ({ mutate: mockSync, isPending: false }),
}));
jest.mock("@workspace/ui/components/calendar", () => ({
  useCalendarContext: () => ({
    isCalendarVisible: () => true,
    toggleCalendarVisibility: jest.fn(),
  }),
  getColorSwatchValue: () => "transparent",
}));
jest.mock("@workspace/ui/lib/toast", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: jest.fn(),
  },
}));
jest.mock("@workspace/ui/components/ui/tooltip", () => ({
  SimpleTooltip: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock(
  "lucide-react",
  () =>
    new Proxy(
      {},
      { get: (_target, name) => (name === "__esModule" ? true : () => null) },
    ),
);
jest.mock("@/components/ics-import-panel", () => ({
  IcsImportPanel: () => <div>ICS import</div>,
}));

function subscription(id: string, name: string): CalendarSubscription {
  return {
    id,
    name,
    url: `https://example.test/${id}.ics`,
    isActive: true,
    syncIntervalMinutes: 15,
    lastSyncStatus: "success",
    calendar: {
      id: `calendar-${id}`,
      name,
      color: "indigo",
      kind: "subscribed",
    },
    _count: { syncLogs: 0 },
  };
}

function changeValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("subscription management views", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    jest.clearAllMocks();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (media: string) => ({
        matches: false,
        media,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: () => false,
      }),
    });
    mockSubscriptions = [
      subscription("first", "First feed"),
      subscription("second", "Second feed"),
    ];
    mockQueryError = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function renderView(
    currentView: React.ComponentProps<
      typeof SubscriptionManagement
    >["currentView"],
    calendarId?: string,
  ) {
    await act(async () =>
      root.render(
        <SubscriptionManagement
          open
          currentView={currentView}
          onBack={mockBack}
          onNavigateTo={mockNavigate}
          initialEditCalendarId={calendarId}
        />,
      ),
    );
  }
  function input(id: string) {
    const element = container.querySelector<HTMLInputElement>(`#${id}`);
    if (!element) throw new Error(`Missing input ${id}`);
    return element;
  }
  function button(text: string) {
    const element = Array.from(container.querySelectorAll("button")).find(
      (entry) => entry.textContent?.trim() === text,
    );
    if (!element) throw new Error(`Missing button ${text}`);
    return element;
  }

  it("validates a feed before creating it and sends trimmed input", async () => {
    await renderView("subscriptions-add-feed");
    await act(async () => button("Add feed").click());
    expect(mockCreate).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Calendar name is required");
    await act(async () => {
      changeValue(input("subscription-name"), "  Team calendar  ");
      changeValue(input("subscription-url"), "https://example.test/team.ics");
    });
    await act(async () => button("Add feed").click());
    expect(mockCreate.mock.calls[0]?.[0]).toEqual({
      name: "Team calendar",
      url: "https://example.test/team.ics",
      color: "indigo",
    });
  });

  it("renders the selected feed immediately and keeps a typed name across query updates", async () => {
    await renderView("subscriptions-edit", "calendar-first");
    expect(input("edit-subscription-name").value).toBe("First feed");
    await act(async () =>
      changeValue(input("edit-subscription-name"), "My edited name"),
    );
    mockSubscriptions = [
      subscription("first", "Server rename"),
      subscription("second", "Second feed"),
    ];
    await renderView("subscriptions-edit", "calendar-first");
    expect(input("edit-subscription-name").value).toBe("My edited name");
    await act(async () => button("Save").click());
    expect(mockUpdate).toHaveBeenCalledWith({
      id: "first",
      request: { name: "My edited name", color: "indigo" },
    });
  });

  it("does not carry validation errors into a different edit target", async () => {
    await renderView("subscriptions-edit", "calendar-first");
    await act(async () => changeValue(input("edit-subscription-name"), ""));
    await act(async () => button("Save").click());
    expect(container.textContent).toContain("Calendar name is required");
    await renderView("subscriptions-edit", "calendar-second");
    expect(input("edit-subscription-name").value).toBe("Second feed");
    expect(container.textContent).not.toContain("Calendar name is required");
  });

  it("renders a retryable load error without effect-driven toasts", async () => {
    mockQueryError = new Error("Subscriptions are temporarily unavailable");
    await renderView("subscriptions");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Subscriptions are temporarily unavailable",
    );
    expect(mockToastError).not.toHaveBeenCalled();
    await act(async () => button("Retry").click());
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("filters holidays, adds a feed, and confirms removal of an existing one", async () => {
    const holiday = NATIONAL_HOLIDAY_CALENDARS.find(
      (entry) => entry.id === "thunderbird-albania",
    );
    if (!holiday) throw new Error("Missing holiday fixture");
    await renderView("subscriptions-holidays");
    const search = container.querySelector<HTMLInputElement>(
      '[aria-label="Search holiday calendars"]',
    );
    if (!search) throw new Error("Missing holiday search");
    await act(async () => changeValue(search, "Albania"));
    await act(async () => button("Add").click());
    expect(mockCreate).toHaveBeenCalledWith({
      name: holiday.label,
      url: holiday.url,
      color: holiday.defaultColor,
    });
    const existing = subscription("holiday", holiday.label);
    mockSubscriptions = [
      {
        ...existing,
        url: holiday.url,
        calendar: { ...existing.calendar, kind: "public_holiday" },
      },
    ];
    await renderView("subscriptions-holidays");
    expect(container.textContent).toContain("Added");
    await act(async () => button("Remove").click());
    expect(mockDelete).not.toHaveBeenCalled();
    const confirm = Array.from(document.querySelectorAll("button")).find(
      (entry) => entry.textContent?.trim() === "Remove subscription",
    );
    if (!confirm) throw new Error("Missing removal confirmation");
    await act(async () => confirm.click());
    expect(mockDelete).toHaveBeenCalledWith("holiday");
  });

  it("keeps ICS import as its own view", async () => {
    await renderView("subscriptions-import-ics");
    expect(container.textContent).toContain("ICS import");
    expect(container.querySelector("#subscription-name")).toBeNull();
  });
});
