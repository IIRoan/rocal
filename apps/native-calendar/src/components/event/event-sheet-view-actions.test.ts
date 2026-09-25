import type { CalendarEvent } from "@workspace/calendar-core";
import { resolveEventSheetViewActions } from "./event-sheet-view-actions";

function makeEvent(overrides: Record<string, unknown> = {}): CalendarEvent {
  return {
    id: "evt-1",
    title: "Test Event",
    start: new Date(2025, 0, 15, 9, 0).toISOString(),
    end: new Date(2025, 0, 15, 10, 0).toISOString(),
    allDay: false,
    calendarId: "cal-1",
    userId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as CalendarEvent;
}

describe("resolveEventSheetViewActions", () => {
  it("puts delete and edit in the view toolbar for an owned event", () => {
    expect(resolveEventSheetViewActions(makeEvent())).toEqual({
      showDelete: true,
      showEdit: true,
      deleteLabel: "Delete",
      showInvitationActions: false,
      invitationStatus: null,
    });
  });

  it("hides both actions when the event has no id", () => {
    expect(
      resolveEventSheetViewActions(makeEvent({ id: "" })),
    ).toEqual({
      showDelete: false,
      showEdit: false,
      deleteLabel: "Delete",
      showInvitationActions: false,
      invitationStatus: null,
    });
  });

  it("hides edit and delete for synced calendar events", () => {
    expect(
      resolveEventSheetViewActions(makeEvent({ isSynced: true })),
    ).toEqual({
      showDelete: false,
      showEdit: false,
      deleteLabel: "Delete",
      showInvitationActions: false,
      invitationStatus: null,
    });
  });

  it("shows delete without edit for an accepted attendee invitation", () => {
    expect(
      resolveEventSheetViewActions(
        makeEvent({
          externalId: "invite-1",
          participants: [
            {
              id: "p-1",
              userId: "user-1",
              email: "me@example.com",
              role: "attendee",
              status: "accepted",
            },
          ],
        }),
      ),
    ).toEqual({
      showDelete: true,
      showEdit: false,
      deleteLabel: "Delete",
      showInvitationActions: true,
      invitationStatus: "accepted",
    });
  });

  it("labels cancelled attendee invitations as remove", () => {
    expect(
      resolveEventSheetViewActions(
        makeEvent({
          externalId: "invite-1",
          isCancelled: true,
          participants: [
            {
              id: "p-1",
              userId: "user-1",
              email: "me@example.com",
              role: "attendee",
              status: "accepted",
            },
          ],
        }),
      ),
    ).toEqual({
      showDelete: true,
      showEdit: false,
      deleteLabel: "Remove",
      showInvitationActions: false,
      invitationStatus: "accepted",
    });
  });
});
