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

jest.mock("../../components/calendar-data-provider", () => ({
  useSharedCalendarData: jest.fn(),
}));

jest.mock("../../components/command-palette/recurring-delete-modal", () => ({
  RecurringDeleteModal: () => null,
}));

jest.mock("../../components/event-editor/event-editor-body", () => ({
  EventEditorBody: () => <div data-testid="event-editor-body" />,
}));

jest.mock("../../components/event-editor/event-editor-footer", () => ({
  EventEditorFooter: () => <div data-testid="event-editor-footer" />,
}));

jest.mock("../../components/event-editor/event-editor-header", () => ({
  EventEditorDesktopHeader: ({ dialogTitle }: { dialogTitle: string }) => (
    <div data-testid="event-editor-header">{dialogTitle}</div>
  ),
}));

jest.mock("../../components/event-editor/event-editor-popover", () => ({
  EventEditorPopover: () => <div data-testid="event-editor-popover" />,
}));

jest.mock("../../lib/calendar-api-service", () => ({
  calendarApiService: {
    deleteRecurringEvent: jest.fn(),
    downloadEventICS: jest.fn(),
    getEventNotifications: jest.fn(),
    updateEventNotifications: jest.fn(),
    validateRecurrence: jest.fn(),
  },
}));

jest.mock("@/lib/e2ee-session", () => ({
  getActiveE2eeSession: () => null,
  hasActiveE2eeSession: () => false,
}));

jest.mock("@workspace/logger", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  }),
}));

jest.mock("@workspace/ui/components/calendar", () => ({
  EncryptionStatusBadge: () => <div data-testid="encryption-status-badge" />,
}));

jest.mock("@workspace/ui/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("@workspace/ui/components/ui/drawer", () => ({
  Drawer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DrawerContent: ({
    children,
    className,
    style,
    responsive,
    responsiveHeight,
  }: {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
    responsive?: boolean;
    responsiveHeight?: string;
  }) => (
    <div
      data-testid="drawer-content"
      data-responsive={responsive ? "true" : "false"}
      data-responsive-height={responsiveHeight}
      className={className}
      style={style}
    >
      {children}
    </div>
  ),
  DrawerShell: ({
    children,
    header,
    footer,
  }: {
    children: React.ReactNode;
    header?: React.ReactNode;
    footer?: React.ReactNode;
  }) => (
    <div data-testid="drawer-shell">
      <div data-testid="drawer-shell-header">{header}</div>
      <div data-testid="drawer-shell-body">{children}</div>
      <div data-testid="drawer-shell-footer">{footer}</div>
    </div>
  ),
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DrawerClose: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

jest.mock("@workspace/ui/components/ui/visually-hidden", () => ({
  VisuallyHidden: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock("@workspace/ui/hooks/use-mobile", () => ({
  useIsMobile: jest.fn(() => false),
}));

jest.mock("lucide-react", () => {
  const Icon = () => null;

  return {
    ArrowLeft: Icon,
    Plus: Icon,
    X: Icon,
  };
});

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
  },
}));

import { useSharedCalendarData } from "../../components/calendar-data-provider";
import { EventEditor } from "../../components/event-editor";
import { calendarApiService } from "../../lib/calendar-api-service";
import { useIsMobile } from "@workspace/ui/hooks/use-mobile";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockUseSharedCalendarData = useSharedCalendarData as jest.MockedFunction<
  typeof useSharedCalendarData
>;
const mockUseIsMobile = useIsMobile as jest.MockedFunction<typeof useIsMobile>;
const mockGetEventNotifications =
  calendarApiService.getEventNotifications as jest.MockedFunction<
    typeof calendarApiService.getEventNotifications
  >;

const calendars = [
  {
    color: "blue",
    createdAt: new Date("2026-04-24T10:00:00.000Z"),
    id: "cal-1",
    isDefault: true,
    isPublic: false,
    isSyncOnly: false,
    isVisible: true,
    kind: "owned",
    name: "Primary",
    updatedAt: new Date("2026-04-24T10:00:00.000Z"),
    userId: "user-1",
  },
] as const;

const localSettings = {
  browserNotifications: false,
  compactView: false,
  createdAt: new Date("2026-04-24T10:00:00.000Z"),
  defaultCalendarId: "cal-1",
  defaultEventDuration: 60,
  defaultView: "month",
  emailNotifications: true,
  eventEncryptionMode: "hybrid",
  id: "settings-1",
  reminderSound: true,
  showDeclinedEvents: false,
  showWeekNumbers: false,
  theme: "system",
  timeFormat: "24h",
  timezone: "UTC",
  updatedAt: new Date("2026-04-24T10:00:00.000Z"),
  userId: "user-1",
  weekStartDay: 1,
  workingDays: "[1,2,3,4,5]",
  workingHoursEnd: 1020,
  workingHoursStart: 540,
} as const;

const existingEvent = {
  allDay: false,
  calendarId: "cal-1",
  createdAt: new Date("2026-04-24T09:00:00.000Z"),
  description: null,
  end: new Date("2026-04-24T11:00:00.000Z"),
  id: "event-1",
  start: new Date("2026-04-24T10:00:00.000Z"),
  title: "Planning",
  updatedAt: new Date("2026-04-24T09:00:00.000Z"),
  userId: "user-1",
} as const;

let container: HTMLDivElement;
let queryClient: QueryClient;
let root: Root;
let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

describe("EventEditor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    container = document.createElement("div");
    document.body.appendChild(container);
    queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    root = createRoot(container);

    mockUseSharedCalendarData.mockReturnValue({
      calendars: [...calendars],
    } as any);
    mockUseIsMobile.mockReturnValue(false);
    mockGetEventNotifications.mockResolvedValue({
      data: { notifications: [] },
      success: true,
    } as any);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    queryClient.clear();
    container.remove();
    consoleErrorSpy.mockRestore();
  });

  it("loads an existing event without triggering a maximum update depth loop", async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <EventEditor
            open={true}
            onOpenChange={() => {}}
            eventToEdit={existingEvent as any}
            onBack={() => {}}
            localSettings={localSettings as any}
            initialEventViewMode="edit"
          />
        </QueryClientProvider>,
      );

      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockGetEventNotifications).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Edit Event");
    expect(
      consoleErrorSpy.mock.calls
        .flat()
        .join(" ")
        .includes("Maximum update depth exceeded"),
    ).toBe(false);
  });

  it("uses a bounded mobile drawer height so the footer can stay visible", async () => {
    mockUseIsMobile.mockReturnValue(true);

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <EventEditor
            open={true}
            onOpenChange={() => {}}
            eventToEdit={existingEvent as any}
            onBack={() => {}}
            localSettings={localSettings as any}
            initialEventViewMode="edit"
          />
        </QueryClientProvider>,
      );

      await Promise.resolve();
      await Promise.resolve();
    });

    const drawerContent = container.querySelector(
      '[data-testid="drawer-content"]',
    ) as HTMLDivElement | null;
    const drawerShell = container.querySelector(
      '[data-testid="drawer-shell"]',
    ) as HTMLDivElement | null;
    const drawerMain = container.querySelector(
      '[data-testid="drawer-shell-body"]',
    ) as HTMLDivElement | null;

    expect(drawerContent).not.toBeNull();
    expect(drawerShell).not.toBeNull();
    expect(drawerMain).not.toBeNull();
    expect(drawerContent?.dataset.responsive).toBe("true");
    expect(drawerContent?.dataset.responsiveHeight).toBe("92dvh");
    expect(drawerContent?.textContent).toContain("Edit Event");
  });
});
