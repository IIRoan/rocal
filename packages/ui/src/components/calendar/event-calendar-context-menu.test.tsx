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

jest.mock("./encryption-status", () => ({
  EncryptionStatusBadge: () => null,
}));

import { CalendarProvider } from "./calendar-context";
import { EventCalendar } from "./event-calendar";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function eventFixture() {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  return {
    id: "event-1",
    title: "Planning",
    start,
    end: new Date(start.getTime() + 30 * 60 * 1000),
    allDay: false,
    calendarId: "calendar-1",
    userId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    color: "blue",
    timezone: "UTC",
  };
}

describe("EventCalendar right-click menu", () => {
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
    document.body.innerHTML = "";
  });

  it("hands Delete to the app's confirmation instead of deleting", async () => {
    const onEventDeleteRequest = jest.fn();
    act(() => {
      root.render(
        <CalendarProvider defaultView="agenda">
          <EventCalendar
            events={[eventFixture()]}
            timeFormat="24h"
            timezone="UTC"
            onEventDeleteRequest={onEventDeleteRequest}
          />
        </CalendarProvider>,
      );
    });

    const eventButton = container.querySelector("[data-event-id='event-1']");
    expect(eventButton).not.toBeNull();
    act(() => {
      eventButton?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 8, clientY: 8 }),
      );
    });
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    const deleteItem = Array.from(
      document.querySelectorAll<HTMLElement>("[role='menuitem']"),
    ).find((item) => item.textContent?.trim() === "Delete");
    expect(deleteItem).toBeDefined();
    act(() => {
      deleteItem?.click();
    });

    expect(onEventDeleteRequest).toHaveBeenCalledTimes(1);
    expect(onEventDeleteRequest).toHaveBeenCalledWith(
      expect.objectContaining({ id: "event-1", title: "Planning" }),
    );
  });
});
