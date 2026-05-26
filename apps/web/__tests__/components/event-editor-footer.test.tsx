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

jest.mock("lucide-react", () => {
  const Icon = () => null;
  return {
    Download: Icon,
    Edit3: Icon,
    Loader2: Icon,
    Save: Icon,
    Trash2: Icon,
  };
});

import { EventEditorFooter } from "../../components/event-editor/event-editor-footer";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

describe("EventEditorFooter", () => {
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

  it("shows RSVP actions for read-only attendee invite events", async () => {
    await act(async () => {
      root.render(
        <EventEditorFooter
          canEditEvent={false}
          eventForm={
            {
              eventCalendarId: "calendar-1",
              eventSaving: false,
              eventTitle: "Ghost event",
              selectedEvent: {
                id: "event-1",
                isSynced: false,
              },
              setEventViewMode: jest.fn(),
              setShowRecurringDeleteModal: jest.fn(),
            } as any
          }
          handleEventDelete={() => {}}
          handleEventDownloadIcs={() => {}}
          handleEventSave={() => {}}
          invitationResponsePending={null}
          invitationStatus={null}
          isViewMode={true}
          onBack={() => {}}
          onClose={() => {}}
          onInvitationResponse={() => {}}
        />,
      );

      await Promise.resolve();
    });

    const buttonTexts = Array.from(container.querySelectorAll("button")).map(
      (button) => button.textContent ?? "",
    );

    expect(container.textContent).toContain("RSVP:");
    expect(buttonTexts.some((text) => text.includes("Accept"))).toBe(true);
    expect(buttonTexts.some((text) => text.includes("Maybe"))).toBe(true);
    expect(buttonTexts.some((text) => text.includes("Decline"))).toBe(true);
  });
});
