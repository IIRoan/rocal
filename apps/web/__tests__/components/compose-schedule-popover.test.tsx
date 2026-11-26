/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";
import { parseScheduledSendInput } from "@workspace/calendar-core";

jest.mock("lucide-react", () => new Proxy({}, { get: () => () => null }));

import {
  ComposeSchedulePopover,
  type ComposeScheduling,
} from "../../components/mail/compose-schedule-popover";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const scheduling: ComposeScheduling = {
  maxDelayedSendSeconds: 7 * 86_400,
  internalDomain: "solace.onl",
  timezone: "Europe/Amsterdam",
  timeFormat: "24h",
  weekStartsOn: 1,
};

describe("ComposeSchedulePopover", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-11-26T10:00:00Z"), doNotFake: ["requestAnimationFrame"] });
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
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    jest.useRealTimers();
  });

  const byLabel = (prefix: string) =>
    Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((item) =>
      item.getAttribute("aria-label")?.startsWith(prefix),
    );

  it("picks the day from the shared calendar, keeps it inside the send window and schedules that day and time", () => {
    const onSchedule = jest.fn();
    act(() =>
      root.render(
        <ComposeSchedulePopover
          scheduling={scheduling}
          recipients={["sam@solace.onl"]}
          disabled={false}
          scheduledSendAt={null}
          onSchedule={onSchedule}
          onClear={jest.fn()}
        />,
      ),
    );
    act(() => byLabel("Schedule send")?.click());
    expect(document.querySelector('input[type="date"], input[type="time"]')).toBeNull();
    const presetTimes = Array.from(document.querySelectorAll("button span.tabular-nums")).map(
      (item) => item.textContent,
    );
    expect(presetTimes[0]).toBe("Nov 27, 08:00");
    expect(presetTimes.join(" ")).not.toContain("2026");
    expect(byLabel("Time")?.getAttribute("aria-label")).toBe("Time, 09:00");

    act(() => byLabel("Day")?.click());
    const dayButton = (key: string) =>
      document.querySelector<HTMLButtonElement>(`td[data-day="${key}"] button`);
    expect(dayButton("2026-11-25")?.disabled).toBe(true);
    expect(dayButton("2026-12-04")?.disabled).toBe(true);
    act(() => dayButton("2026-11-28")?.click());
    expect(byLabel("Day")?.getAttribute("aria-label")).toBe("Day, Sat, Nov 28");

    const schedule = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      (item) => item.textContent?.trim() === "Set time",
    );
    act(() => schedule?.click());
    expect(onSchedule).toHaveBeenCalledWith(
      parseScheduledSendInput("2026-11-28", "09:00", scheduling.timezone),
    );
  });

  it("shows the armed time on its trigger and offers to clear it", () => {
    const onClear = jest.fn();
    act(() =>
      root.render(
        <ComposeSchedulePopover
          scheduling={scheduling}
          recipients={[]}
          disabled={false}
          scheduledSendAt="2026-11-27T07:00:00Z"
          onSchedule={jest.fn()}
          onClear={onClear}
        />,
      ),
    );
    const trigger = byLabel("Scheduled for ");
    expect(trigger?.getAttribute("aria-label")).toBe("Scheduled for Nov 27, 08:00, change schedule");
    act(() => trigger?.click());
    const clear = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((item) =>
      item.textContent?.includes("Don't schedule"),
    );
    act(() => clear?.click());
    expect(onClear).toHaveBeenCalled();
  });
});
