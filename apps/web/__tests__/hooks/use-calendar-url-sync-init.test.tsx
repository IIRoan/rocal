/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";

jest.mock("next/navigation", () => ({
  usePathname: () => "/calendar",
  useSearchParams: () => new URLSearchParams(globalThis.location.search),
}));

let mockSettingsLoading = false;
const mockCalendar: { setCurrentDate?: (date: Date) => void } = {};

jest.mock("@/hooks/use-settings", () => ({
  useSettings: () => ({
    loading: mockSettingsLoading,
    settings: { timezone: "Pacific/Kiritimati" },
  }),
}));

// The bootstrap date sits on another account-zone day than the URL, like a browser-local noon does in Kiritimati.
jest.mock("@workspace/ui/components/calendar", () => {
  const { useState } = jest.requireActual<typeof import("react")>("react");
  return {
    CALENDAR_VIEWS: ["month", "week", "3day", "day", "agenda"],
    useCalendarContext: () => {
      const [currentDate, setCurrentDate] = useState(
        new Date("2026-03-10T00:00:00.000Z"),
      );
      const [currentView, setCurrentView] = useState("week");
      mockCalendar.setCurrentDate = setCurrentDate;
      return { currentDate, currentView, setCurrentDate, setCurrentView };
    },
  };
});

import { useCalendarUrlSync } from "@/hooks/use-calendar-url-sync";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function Harness() {
  useCalendarUrlSync();
  return null;
}

describe("useCalendarUrlSync initialisation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.history.replaceState(null, "", "/");
    mockSettingsLoading = false;
  });

  it("writes the first navigation after a URL that changed nothing", async () => {
    window.history.replaceState(null, "", "/calendar?view=week");
    mockSettingsLoading = true;
    await act(async () => {
      root.render(<Harness />);
    });
    mockSettingsLoading = false;
    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      mockCalendar.setCurrentDate?.(new Date("2026-03-20T00:00:00.000Z"));
    });

    expect(new URLSearchParams(window.location.search).get("date")).toBe(
      "2026-03-20",
    );
  });

  it("keeps the opened day instead of saving the pre-URL date", async () => {
    window.history.replaceState(null, "", "/calendar?date=2026-03-01&view=day");

    await act(async () => {
      root.render(<Harness />);
    });

    const params = new URLSearchParams(window.location.search);
    expect(params.get("date")).toBe("2026-03-01");
    expect(params.get("view")).toBe("day");
  });

  it("writes the current day when the URL has none", async () => {
    window.history.replaceState(null, "", "/calendar");

    await act(async () => {
      root.render(<Harness />);
    });

    expect(new URLSearchParams(window.location.search).get("date")).toBe(
      "2026-03-10",
    );
  });
});
