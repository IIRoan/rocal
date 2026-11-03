/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";

import { CalendarProvider, useCalendarContext } from "./calendar-context";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const MARCH_1 = new Date("2026-03-01T12:00:00.000Z");

function DateControls() {
  const { currentDate, setCurrentDate, clearSavedDate } = useCalendarContext();
  return (
    <>
      <output>{currentDate.toISOString()}</output>
      <button type="button" onClick={() => setCurrentDate(MARCH_1)}>
        Move
      </button>
      <button type="button" onClick={clearSavedDate}>
        Today
      </button>
    </>
  );
}

describe("CalendarProvider onCurrentDateChange", () => {
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

  it("reports every date the calendar moves to", () => {
    const onCurrentDateChange = jest.fn();
    act(() => {
      root.render(
        <CalendarProvider onCurrentDateChange={onCurrentDateChange}>
          <DateControls />
        </CalendarProvider>,
      );
    });
    const click = (label: string) =>
      act(() => {
        Array.from(container.querySelectorAll("button"))
          .find((button) => button.textContent === label)
          ?.click();
      });

    click("Move");
    expect(onCurrentDateChange).toHaveBeenLastCalledWith(MARCH_1);
    expect(container.querySelector("output")?.textContent).toBe(
      MARCH_1.toISOString(),
    );

    click("Today");
    expect(onCurrentDateChange).toHaveBeenCalledTimes(2);
    expect(onCurrentDateChange.mock.calls[1]?.[0]).not.toEqual(MARCH_1);
  });
});
