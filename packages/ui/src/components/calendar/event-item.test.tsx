/** @jest-environment jsdom */

import React, { act } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";

jest.mock("./encryption-status", () => ({
  EncryptionStatusBadge: () => <span aria-label="End-to-end encrypted" />,
}));

import { EventItem } from "./event-item";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function eventFixture() {
  return {
    id: "event-1",
    title: "Planning",
    start: new Date("2026-05-19T09:00:00.000Z"),
    end: new Date("2026-05-19T10:00:00.000Z"),
    calendarId: "calendar-1",
    userId: "user-1",
    createdAt: new Date("2026-05-18T09:00:00.000Z"),
    updatedAt: new Date("2026-05-18T09:00:00.000Z"),
    color: "blue",
  };
}

describe("EventItem", () => {
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

  it("shows a pointer cursor and hover ring for clickable calendar events", () => {
    act(() => {
      root.render(
        <EventItem
          event={eventFixture()}
          view="month"
          timeFormat="24h"
          onClick={() => undefined}
        />,
      );
    });

    const button = container.querySelector<HTMLButtonElement>(
      "button[data-event-id='event-1']",
    );

    expect(button).not.toBeNull();
    expect(button?.className).toContain("cursor-pointer");
    expect(button?.className).toContain("hover:ring-1");
    expect(button?.className).toContain("hover:ring-black/10");
  });

  it("names month chips with title and time even when the segment shows no text", () => {
    act(() => {
      root.render(
        <EventItem
          event={{ ...eventFixture(), isCancelled: true }}
          view="month"
          timeFormat="24h"
          timezone="UTC"
          onClick={() => undefined}
        >
          <div className="invisible" aria-hidden />
        </EventItem>,
      );
    });

    const button = container.querySelector("button");
    expect(button?.getAttribute("aria-label")).toBe(
      "Planning, Tuesday, May 19, 09:00 – 10:00, cancelled",
    );
    expect(button?.hasAttribute("aria-roledescription")).toBe(false);
    expect(button?.hasAttribute("aria-describedby")).toBe(false);
  });

  it("names all-day and multi-day events by their dates", () => {
    act(() => {
      root.render(
        <EventItem
          event={{
            ...eventFixture(),
            title: "",
            start: new Date("2026-05-19T22:00:00.000Z"),
            end: new Date("2026-05-21T08:30:00.000Z"),
          }}
          view="week"
          height={60}
          showTime
          timeFormat="12h"
          timezone="UTC"
        />,
      );
    });

    expect(container.querySelector("button")?.getAttribute("aria-label")).toBe(
      "Untitled event, May 19, 10:00 PM – May 21, 8:30 AM",
    );
  });

  it.each([
    { view: "month", height: undefined, showTime: false },
    { view: "week", height: 60, showTime: true },
    { view: "week", height: 28, showTime: true },
    { view: "week", height: 18, showTime: true },
    { view: "day", height: 60, showTime: true },
    { view: "agenda", height: undefined, showTime: true },
  ] as const)(
    "keeps encryption icons out of $view events at height $height",
    (props) => {
      act(() => {
        root.render(
          <EventItem
            {...props}
            event={{ ...eventFixture(), encryptionState: "encrypted" }}
            timeFormat="24h"
            timezone="UTC"
            onClick={() => undefined}
          />,
        );
      });

      expect(container.textContent).toContain("Planning");
      expect(
        container.querySelector('[aria-label="End-to-end encrypted"]'),
      ).toBeNull();
    },
  );
});
