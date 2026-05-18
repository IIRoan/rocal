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

jest.mock("../../components/command-palette/index", () => ({
  PRESET_COLORS: ["blue", "red"],
  resetCalendarForm: jest.fn(),
  validateCalendarForm: jest.fn(() => ({})),
  handleCalendarCreate: jest.fn(),
  handleCalendarUpdate: jest.fn(),
  handleCalendarDelete: jest.fn(),
  SettingToggleRow: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ToggleIndicator: () => <span />,
}));

jest.mock("../../lib/calendar-api-service", () => ({
  calendarApiService: {
    disableCalendarShareLink: jest.fn(),
    enableCalendarShareLink: jest.fn(),
    getCalendarShareLink: jest.fn(),
    getSubscriptions: jest.fn(async () => []),
  },
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

jest.mock("@workspace/ui/components/calendar", () => ({
  EncryptionStatusBadge: ({
    asIcon,
    item,
  }: {
    asIcon?: boolean;
    item: { id?: string; name?: string };
  }) => {
    if (asIcon) {
      return <span data-testid={`badge-${item.id ?? item.name ?? "icon"}`} />;
    }

    return (
      <button
        type="button"
        data-testid={`badge-${item.id ?? item.name ?? "button"}`}
      >
        badge
      </button>
    );
  },
  getColorSwatchValue: () => "#2563eb",
  useCalendarContext: () => ({
    toggleCalendarVisibility: jest.fn(),
    isCalendarVisible: () => true,
  }),
}));

jest.mock("lucide-react", () => {
  const Icon = () => null;

  return {
    AlertTriangle: Icon,
    ArrowLeft: Icon,
    ChevronRight: Icon,
    Copy: Icon,
    Eye: Icon,
    EyeOff: Icon,
    Globe: Icon,
    Link2: Icon,
    Loader2: Icon,
    Plus: Icon,
    RefreshCw: Icon,
    Save: Icon,
    ShieldCheck: Icon,
    Star: Icon,
    Trash2: Icon,
  };
});

import { useSharedCalendarData } from "../../components/calendar-data-provider";
import { calendarApiService } from "../../lib/calendar-api-service";
import { CalendarManager } from "../../components/calendar-manager";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockUseSharedCalendarData = useSharedCalendarData as jest.MockedFunction<
  typeof useSharedCalendarData
>;

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

const mockCalendarApiService = jest.mocked(calendarApiService);

describe("CalendarManager", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    mockUseSharedCalendarData.mockReturnValue({
      calendars: [
        {
          color: "blue",
          forceFullEncryption: true,
          id: "cal-1",
          isDefault: true,
          isSyncOnly: false,
          kind: "owned",
          name: "Primary",
        },
      ],
    } as any);
    mockCalendarApiService.getSubscriptions.mockResolvedValue([]);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.clearAllMocks();
  });

  it("renders non-interactive encryption badges inside calendar row buttons", async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <CalendarManager
            currentView="calendars"
            onBack={() => {}}
            onGoToSubscriptions={() => {}}
            onNavigateTo={() => {}}
          />
        </QueryClientProvider>,
      );

      await Promise.resolve();
    });

    const calendarRow = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("Primary"),
    );

    expect(calendarRow).toBeDefined();
    expect(calendarRow?.querySelector("button")).toBeNull();
    expect(
      container.querySelector('[data-testid="badge-cal-1"]'),
    ).not.toBeNull();
  });
});
