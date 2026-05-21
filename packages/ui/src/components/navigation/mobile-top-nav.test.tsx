/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";

jest.mock("lucide-react", () => {
  const Icon = () => null;
  return {
    Calendar: Icon,
    CalendarDays: Icon,
    Check: Icon,
    CheckIcon: Icon,
    ChevronLeft: Icon,
    ChevronRight: Icon,
    ChevronRightIcon: Icon,
    CircleIcon: Icon,
    Columns3: Icon,
    Grid3X3: Icon,
    LayoutGrid: Icon,
    Menu: Icon,
    MoreHorizontal: Icon,
    Plus: Icon,
  };
});

import { MobileTopNav } from "./mobile-top-nav";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("MobileTopNav", () => {
  let container: HTMLDivElement;
  let root: Root;

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

  it("renders the compact mobile calendar shell and wires primary actions", () => {
    const onOpenSidebar = jest.fn();
    const onOpenAddEvent = jest.fn();
    const onOpenQuickNav = jest.fn();
    const onPrevious = jest.fn();
    const onNext = jest.fn();

    act(() => {
      root.render(
        <MobileTopNav
          currentDate={new Date("2026-05-21T12:00:00.000Z")}
          currentView="week"
          onOpenSidebar={onOpenSidebar}
          onOpenAddEvent={onOpenAddEvent}
          onOpenQuickNav={onOpenQuickNav}
          onPrevious={onPrevious}
          onNext={onNext}
          appSwitcher={<div>App switcher</div>}
        />,
      );
    });

    const sidebarButton = document.querySelector(
      '[aria-label="Open calendar sidebar"]',
    ) as HTMLButtonElement | null;
    const addButton = document.querySelector(
      '[aria-label="Add new event"]',
    ) as HTMLButtonElement | null;
    const quickNavButton = document.querySelector(
      '[aria-label="Open calendar quick navigation"]',
    ) as HTMLButtonElement | null;
    const previousButton = document.querySelector(
      '[aria-label="Previous period"]',
    ) as HTMLButtonElement | null;
    const nextButton = document.querySelector(
      '[aria-label="Next period"]',
    ) as HTMLButtonElement | null;
    const actionsButton = document.querySelector(
      '[aria-label="Open calendar actions"]',
    ) as HTMLButtonElement | null;
    const header = container.firstElementChild as HTMLDivElement | null;

    expect(document.body.textContent).toContain("App switcher");
    expect(document.body.textContent).toContain("May 18 - May 24, 2026");
    expect(document.body.textContent).toContain("Week 21");
    expect(actionsButton?.textContent).toContain("Week");
    expect(header?.className).toContain("z-[45]");

    act(() => {
      sidebarButton?.click();
      addButton?.click();
      quickNavButton?.click();
      previousButton?.click();
      nextButton?.click();
    });

    expect(onOpenSidebar).toHaveBeenCalledTimes(1);
    expect(onOpenAddEvent).toHaveBeenCalledTimes(1);
    expect(onOpenQuickNav).toHaveBeenCalledTimes(1);
    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
