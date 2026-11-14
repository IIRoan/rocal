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

import { CalendarDndProvider } from "./calendar-dnd-context";
import { EventResizeHandles } from "./event-resize-handle";
import { TimeGridSelection } from "./time-grid-selection";
import type { CalendarEvent } from "./types";
import { useTimeGridPointerRange } from "./use-time-grid-pointer-range";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const day = new Date(2026, 5, 8);
const QUARTER_PX = 10;
const event: CalendarEvent = {
  id: "event-1",
  title: "Standup",
  start: new Date("2026-06-08T09:00:00.000Z"),
  end: new Date("2026-06-08T10:00:00.000Z"),
  calendarId: "cal-1",
  userId: "user-1",
  createdAt: new Date("2026-05-01T00:00:00.000Z"),
  updatedAt: new Date("2026-05-01T00:00:00.000Z"),
};

const onCreate = jest.fn<(start: Date, end: Date, anchor: { x: number; y: number }) => void>();
const onCellClick = jest.fn();
const onEventUpdate = jest.fn<(event: CalendarEvent, verb?: string) => void>();

function Grid() {
  const pointer = useTimeGridPointerRange({ timezone: "UTC", onCreate });
  return (
    <div {...pointer.columnProps(day)} data-testid="column">
      {/* repo-rules-allow wcag-keyboard-access: test stand-in for a grid cell */}
      <div data-calendar-cell="true" data-testid="cell" onClick={onCellClick} />
      <EventResizeHandles
        event={event}
        onResizeStart={(pointerEvent, edge) =>
          pointer.startResize(pointerEvent, event, edge, day)
        }
      />
      {pointer.selection ? (
        <TimeGridSelection
          startQuarter={pointer.selection.startQuarter}
          endQuarter={pointer.selection.endQuarter}
        />
      ) : null}
    </div>
  );
}

describe("useTimeGridPointerRange", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    HTMLElement.prototype.setPointerCapture = () => {};
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() =>
      root.render(
        <CalendarDndProvider onEventUpdate={onEventUpdate} timeFormat="24h" timezone="UTC">
          <Grid />
        </CalendarDndProvider>,
      ),
    );
    const column = container.querySelector<HTMLElement>("[data-testid='column']");
    if (column) {
      column.getBoundingClientRect = () =>
        ({ top: 0, height: 96 * QUARTER_PX, left: 0, width: 100 }) as DOMRect;
    }
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
  });

  const element = (selector: string) => {
    const found = container.querySelector<HTMLElement>(selector);
    if (!found) throw new Error(`missing ${selector}`);
    return found;
  };

  const pointer = (target: HTMLElement, type: string, quarter: number) =>
    act(() => {
      target.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          button: 0,
          clientX: 40,
          clientY: quarter * QUARTER_PX + QUARTER_PX / 2,
        }),
      );
    });

  const click = (target: HTMLElement) =>
    act(() => {
      target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

  it("leaves a plain click to the cell, which creates once", () => {
    pointer(element("[data-testid='cell']"), "pointerdown", 36);
    pointer(element("[data-testid='column']"), "pointerup", 36);
    click(element("[data-testid='cell']"));

    expect(onCreate).not.toHaveBeenCalled();
    expect(onCellClick).toHaveBeenCalledTimes(1);
  });

  it("creates the swept range and swallows the click that follows", () => {
    pointer(element("[data-testid='cell']"), "pointerdown", 36);
    pointer(element("[data-testid='column']"), "pointermove", 41);
    expect(element("[data-time-grid-selection]").style.height).toBe(
      "calc(var(--week-cells-height) / 4 * 6)",
    );
    pointer(element("[data-testid='column']"), "pointerup", 41);
    click(element("[data-testid='cell']"));

    expect(onCreate).toHaveBeenCalledWith(
      new Date("2026-06-08T09:00:00.000Z"),
      new Date("2026-06-08T10:30:00.000Z"),
      { x: 40, y: 415 },
    );
    expect(onCellClick).not.toHaveBeenCalled();
    expect(container.querySelector("[data-time-grid-selection]")).toBeNull();
  });

  it("cancels on Escape", () => {
    pointer(element("[data-testid='cell']"), "pointerdown", 36);
    pointer(element("[data-testid='column']"), "pointermove", 41);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(container.querySelector("[data-time-grid-selection]")).toBeNull();
    pointer(element("[data-testid='column']"), "pointerup", 41);
    click(element("[data-testid='cell']"));

    expect(onCreate).not.toHaveBeenCalled();
    expect(onCellClick).not.toHaveBeenCalled();
  });

  it("resizes the end and saves it as a resize", () => {
    pointer(element("[data-resize-edge='end']"), "pointerdown", 39);
    pointer(element("[data-testid='column']"), "pointermove", 45);
    pointer(element("[data-testid='column']"), "pointerup", 45);

    expect(onCreate).not.toHaveBeenCalled();
    expect(onEventUpdate).toHaveBeenCalledWith(
      {
        ...event,
        start: new Date("2026-06-08T09:00:00.000Z"),
        end: new Date("2026-06-08T11:30:00.000Z"),
      },
      "resized",
    );
  });

  it("keeps at least 15 minutes when the start is pulled past the end", () => {
    pointer(element("[data-resize-edge='start']"), "pointerdown", 36);
    pointer(element("[data-testid='column']"), "pointermove", 50);
    pointer(element("[data-testid='column']"), "pointerup", 50);

    expect(onEventUpdate.mock.calls[0]?.[0].start).toEqual(
      new Date("2026-06-08T09:45:00.000Z"),
    );
  });
});
