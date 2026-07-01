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
    Check: Icon,
    ChevronDown: Icon,
    Download: Icon,
    Edit3: Icon,
    Loader2: Icon,
    Save: Icon,
    Trash2: Icon,
  };
});

jest.mock("@workspace/ui/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

jest.mock("@workspace/ui/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuItem: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  DropdownMenuSeparator: () => null,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

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
                externalId: "uid-123@google.com",
                userId: "user-1",
                participants: [
                  {
                    userId: "user-1",
                    email: "user@example.com",
                    role: "attendee",
                    status: "pending",
                  },
                ],
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

    expect(buttonTexts.some((text) => text.includes("Accept"))).toBe(true);
    expect(buttonTexts.some((text) => text.includes("Maybe"))).toBe(true);
    expect(buttonTexts.some((text) => text.includes("Decline"))).toBe(true);
    expect(buttonTexts.some((text) => text.includes("Delete"))).toBe(false);
  });

  it("shows delete for accepted attendee invitations but not pending ghosts", async () => {
    await act(async () => {
      root.render(
        <EventEditorFooter
          canEditEvent={false}
          eventForm={
            {
              eventCalendarId: "calendar-1",
              eventSaving: false,
              eventTitle: "Accepted invite",
              selectedEvent: {
                id: "event-1",
                isSynced: false,
                externalId: "uid-123@google.com",
                userId: "user-1",
                participants: [
                  {
                    userId: "user-1",
                    role: "attendee",
                    status: "accepted",
                  },
                ],
              },
              setEventViewMode: jest.fn(),
              setShowRecurringDeleteModal: jest.fn(),
            } as any
          }
          handleEventDelete={() => {}}
          handleEventDownloadIcs={() => {}}
          handleEventSave={() => {}}
          invitationResponsePending={null}
          invitationStatus="accepted"
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

    expect(buttonTexts.some((text) => text.includes("Delete"))).toBe(true);
  });

  it("shows remove action instead of RSVP controls for cancelled attendee invite events", async () => {
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
                isCancelled: true,
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
          invitationStatus={"accepted"}
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

    expect(buttonTexts.some((text) => text.includes("Remove from calendar"))).toBe(
      true,
    );
    expect(buttonTexts.some((text) => text.includes("Accept"))).toBe(false);
    expect(buttonTexts.some((text) => text.includes("Maybe"))).toBe(false);
    expect(buttonTexts.some((text) => text.includes("Decline"))).toBe(false);
  });
});
