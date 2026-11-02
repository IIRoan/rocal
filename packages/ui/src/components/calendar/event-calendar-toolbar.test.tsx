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

jest.mock("../layout/theme-toggle", () => ({
  ThemeToggle: () => null,
}));

import { EventCalendarToolbar } from "./event-calendar-toolbar";
import { MobileEventCalendarToolbar } from "./mobile-event-calendar-toolbar";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => {};
const sharedProps = {
  currentDate: new Date("2026-06-08T09:00:00.000Z"),
  onNext: noop,
  onPrevious: noop,
  onToday: noop,
  onViewChange: noop,
  timezone: "UTC",
  view: "week" as const,
  weekStartDay: 1,
};

const toolbars = [
  [
    "desktop",
    (eventsLoading: boolean) => (
      <EventCalendarToolbar {...sharedProps} eventsLoading={eventsLoading} />
    ),
  ],
  [
    "mobile",
    (eventsLoading: boolean) => (
      <MobileEventCalendarToolbar
        {...sharedProps}
        eventsLoading={eventsLoading}
        onNewEvent={noop}
      />
    ),
  ],
] as const;

describe("calendar toolbar loading status", () => {
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
  });

  it.each(toolbars)(
    "keeps one %s status region mounted and fills it while events load",
    (_name, renderToolbar) => {
      act(() => root.render(renderToolbar(false)));
      const status = container.querySelector("output");
      expect(status).not.toBeNull();
      expect(status?.textContent).toBe("");

      act(() => root.render(renderToolbar(true)));
      expect(container.querySelectorAll("output")).toHaveLength(1);
      expect(container.querySelector("output")).toBe(status);
      expect(status?.textContent).toBe("Loading events…");

      act(() => root.render(renderToolbar(false)));
      expect(status?.textContent).toBe("");
    },
  );
});
