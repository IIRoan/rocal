/** @jest-environment jsdom */

import React, { act } from "react";
import {
  afterEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";
import { UnifiedSearchResults } from "../../components/command-palette/unified-search-results";
import type { UnifiedSearchResult } from "@workspace/calendar-core";
import type { JmapEmailMessage } from "@/lib/mail/types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("lucide-react", () => {
  const Icon = (props: React.SVGProps<SVGSVGElement>) => <svg {...props} />;

  return {
    CalendarIcon: Icon,
    Loader2: Icon,
    Mail: Icon,
    MapPin: Icon,
    Paperclip: Icon,
    Search: Icon,
  };
});

describe("UnifiedSearchResults", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  const results: UnifiedSearchResult<JmapEmailMessage>[] = [
    {
      id: "mail:1",
      source: "mail",
      messageId: "message-1",
      title: "Quarterly update",
      from: "Ada Lovelace",
      snippet: "Budget review and roadmap",
      timestamp: "2026-05-20T10:00:00.000Z",
      score: 10,
      encryptionStatus: "encrypted-indexed",
      matchedFields: ["subject"],
      message: {
        id: "message-1",
        subject: "Quarterly update",
        attachments: [{ name: "roadmap.pdf" }],
        keywords: {},
      },
    },
    {
      id: "calendar:1",
      source: "calendar",
      eventId: "event-1",
      title: "Planning",
      snippet: "Review launch timeline",
      timestamp: "2026-05-21T09:00:00.000Z",
      score: 8,
      encryptionStatus: "plaintext",
      matchedFields: ["title"],
      event: {
        id: "event-1",
        title: "Planning",
        start: new Date("2026-05-21T09:00:00.000Z"),
        end: new Date("2026-05-21T10:00:00.000Z"),
        allDay: false,
        calendarId: "calendar-1",
        userId: "user-1",
        createdAt: new Date("2026-05-01T09:00:00.000Z"),
        updatedAt: new Date("2026-05-01T09:00:00.000Z"),
        location: "Room 2",
      },
    },
  ];

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
      root = null;
    }
    container?.remove();
    container = null;
  });

  it("renders separate mail and calendar sections with the same row treatment", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <UnifiedSearchResults
          results={results}
          isLoading={false}
          selectedIndex={0}
          onSelect={() => {}}
        />,
      );
    });

    const sections = Array.from(
      container.querySelectorAll("[data-source-section]"),
    ).map((element) => element.getAttribute("data-source-section"));

    expect(sections).toEqual(["messages", "calendar"]);
    expect(container.textContent).toContain("Attachment");
    expect(container.textContent).toContain("Location");
    expect(container.innerHTML).not.toContain("group-hover:opacity-100");
  });

  it("calls onSelect when a result row is clicked", () => {
    const onSelect = jest.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <UnifiedSearchResults
          results={results}
          isLoading={false}
          selectedIndex={0}
          onSelect={onSelect}
        />,
      );
    });

    const calendarRow = container.querySelector(
      '[data-source-row="calendar"]',
    ) as HTMLButtonElement | null;

    act(() => {
      calendarRow?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSelect).toHaveBeenCalledWith(results[1]);
  });
});
