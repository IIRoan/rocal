import { describe, expect, it, jest } from "@jest/globals";
import type { CalendarEvent } from "@workspace/calendar-core";
import { respondToMailInvitation } from "../mail-invitation-response";

const imported = { id: "evt-1", title: "Lunch" } as CalendarEvent;
const synced = { ...imported, stalwartEventId: "jmap-1" } as CalendarEvent;

function fakeApi(overrides: Record<string, unknown> = {}) {
  return {
    declineInvitationIcs: jest.fn(async () => ({ declined: true })),
    deleteEvent: jest.fn(async () => ({ success: true })),
    importInvitationIcs: jest.fn(async () => ({ errors: [] as string[] })),
    getInvitationByExternalId: jest.fn(async () => imported),
    respondToInvitation: jest.fn(async () => synced),
    sealImportedInvitationIfNeeded: jest.fn(async (event: CalendarEvent) => ({ ...event, sealed: true })),
    ...overrides,
  };
}

const respond = (api: ReturnType<typeof fakeApi>, input: Partial<Parameters<typeof respondToMailInvitation>[1]>) =>
  respondToMailInvitation(api as never, {
    status: "accepted",
    inviteUid: "uid-1",
    icsContent: "BEGIN:VCALENDAR",
    event: null,
    ...input,
  });

describe("respondToMailInvitation", () => {
  it("imports, loads and seals an invitation accepted over ICS", async () => {
    const api = fakeApi();
    await expect(respond(api, {})).resolves.toEqual({
      event: { ...imported, sealed: true },
      declined: false,
      message: "Invitation accepted.",
    });
    expect(api.importInvitationIcs).toHaveBeenCalledWith("BEGIN:VCALENDAR", { status: "accepted" });
    expect(api.getInvitationByExternalId).toHaveBeenCalledWith("uid-1", { syncRemote: false });
  });

  it("declines over ICS and removes an unsynced local copy", async () => {
    const api = fakeApi();
    await expect(respond(api, { status: "declined", event: imported })).resolves.toEqual({
      event: null,
      declined: true,
      message: "Invitation declined.",
    });
    expect(api.deleteEvent).toHaveBeenCalledWith("evt-1");
    expect(api.respondToInvitation).not.toHaveBeenCalled();
  });

  it("answers a synced copy through the API, which seals what it returns", async () => {
    const api = fakeApi();
    await expect(respond(api, { status: "tentative", event: synced, icsContent: null })).resolves.toEqual({
      event: synced,
      declined: false,
      message: "Marked as tentative.",
    });
    expect(api.respondToInvitation).toHaveBeenCalledWith("evt-1", "tentative");
    expect(api.importInvitationIcs).not.toHaveBeenCalled();
  });

  it("reports a synced decline that removed the event", async () => {
    const api = fakeApi({ respondToInvitation: jest.fn(async () => ({ deleted: true })) });
    await expect(respond(api, { status: "declined", event: synced })).resolves.toEqual({
      event: null,
      declined: true,
      message: "Invitation declined and removed from your calendar.",
    });
  });

  it.each([
    ["the ICS is missing", { icsContent: null }, fakeApi(), "Invitation details are unavailable."],
    ["the import reports an error", {}, fakeApi({ importInvitationIcs: jest.fn(async () => ({ errors: ["Calendar is read-only."] })) }), "Calendar is read-only."],
    ["the imported copy cannot be loaded", {}, fakeApi({ getInvitationByExternalId: jest.fn(async () => null) }), "Invitation was accepted but could not be loaded."],
  ])("rejects when %s", async (_label, input, api, message) => {
    await expect(respond(api, input)).rejects.toThrow(message);
  });
});
