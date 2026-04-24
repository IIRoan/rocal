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

jest.mock("../../components/calendar-data-provider", () => ({
  useSharedCalendarData: jest.fn(),
}));

jest.mock("../../lib/calendar-api-service", () => ({
  calendarApiService: {
    disableCalendarShareLink: jest.fn(),
    enableCalendarShareLink: jest.fn(),
    getCalendarShareLink: jest.fn(),
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
      <button type="button" data-testid={`badge-${item.id ?? item.name ?? "button"}`}>
        badge
      </button>
    );
  },
  getColorSwatchValue: () => "#2563eb",
}));

jest.mock("lucide-react", () => {
  const Icon = () => null;

  return {
    AlertTriangle: Icon,
    ArrowLeft: Icon,
    ChevronRight: Icon,
    Copy: Icon,
    Globe: Icon,
    Link2: Icon,
    Loader2: Icon,
    Plus: Icon,
    RefreshCw: Icon,
    Save: Icon,
    ShieldCheck: Icon,
    Trash2: Icon,
  };
});

import { useSharedCalendarData } from "../../components/calendar-data-provider";
import { CalendarManager } from "../../components/calendar-manager";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockUseSharedCalendarData =
  useSharedCalendarData as jest.MockedFunction<typeof useSharedCalendarData>;

let container: HTMLDivElement;
let root: Root;

describe("CalendarManager", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

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
        <CalendarManager
          currentView="calendars"
          onBack={() => {}}
          onGoToSubscriptions={() => {}}
          onNavigateTo={() => {}}
        />,
      );

      await Promise.resolve();
    });

    const calendarRow = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("Primary"),
    );

    expect(calendarRow).toBeDefined();
    expect(calendarRow?.querySelector("button")).toBeNull();
    expect(container.querySelector('[data-testid="badge-cal-1"]')).not.toBeNull();
  });
});