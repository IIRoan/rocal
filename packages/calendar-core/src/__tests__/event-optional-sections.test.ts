import { describe, expect, it } from "@jest/globals";
import {
  applyHiddenEventOptionalSections,
  clearedFieldsForDisabledEventSection,
  hasOptionalEventParticipants,
  organizerOnlyParticipants,
} from "../event-optional-sections";

describe("hasOptionalEventParticipants", () => {
  it("treats a solo organizer as the participants option unused", () => {
    expect(
      hasOptionalEventParticipants([
        { email: "me@example.com", role: "organizer" },
      ]),
    ).toBe(false);
  });

  it("treats an empty or single participant list as unused", () => {
    expect(hasOptionalEventParticipants(undefined)).toBe(false);
    expect(hasOptionalEventParticipants([])).toBe(false);
    expect(
      hasOptionalEventParticipants([{ email: "ada@example.com" }]),
    ).toBe(false);
  });

  it("treats organizer plus the same person as attendee as unused", () => {
    expect(
      hasOptionalEventParticipants([
        { email: "me@example.com", role: "organizer" },
        { email: "me@example.com", role: "attendee" },
      ]),
    ).toBe(false);
  });

  it("uses the participants option when there is at least one other invitee", () => {
    expect(
      hasOptionalEventParticipants([
        { email: "me@example.com", role: "organizer" },
        { email: "ada@example.com", role: "attendee" },
      ]),
    ).toBe(true);
  });
});

describe("organizerOnlyParticipants", () => {
  it("keeps the organizer when invitees are cleared", () => {
    expect(
      organizerOnlyParticipants([
        { email: "me@example.com", role: "organizer" },
        { email: "ada@example.com", role: "attendee" },
      ]),
    ).toEqual([{ email: "me@example.com", role: "organizer" }]);
  });
});

describe("clearedFieldsForDisabledEventSection", () => {
  it("clears the matching optional field for each event editor toggle", () => {
    expect(clearedFieldsForDisabledEventSection("location")).toEqual({
      location: "",
    });
    expect(clearedFieldsForDisabledEventSection("description")).toEqual({
      description: "",
    });
    expect(clearedFieldsForDisabledEventSection("recurrence")).toEqual({
      recurrence: null,
    });
    expect(clearedFieldsForDisabledEventSection("notifications")).toEqual({
      reminder: 0,
    });
    expect(clearedFieldsForDisabledEventSection("participants")).toEqual({
      participants: [],
    });
  });
});

describe("applyHiddenEventOptionalSections", () => {
  const filled = {
    description: "Agenda",
    location: "Office",
    participants: [{ email: "ada@example.com" }],
    recurrence: "FREQ=WEEKLY",
    reminder: 15,
    title: "Planning",
  };

  it("keeps selected values while those options stay enabled", () => {
    expect(
      applyHiddenEventOptionalSections(filled, {
        description: true,
        location: true,
        notifications: true,
        participants: true,
        recurrence: true,
      }),
    ).toEqual(filled);
  });

  it("drops selected values for disabled options so they are not saved", () => {
    expect(
      applyHiddenEventOptionalSections(filled, {
        description: false,
        location: false,
        notifications: false,
        participants: false,
        recurrence: false,
      }),
    ).toEqual({
      description: "",
      location: "",
      participants: [],
      recurrence: null,
      reminder: 0,
      title: "Planning",
    });
  });

  it("keeps the organizer when the participants option is disabled", () => {
    expect(
      applyHiddenEventOptionalSections(
        {
          ...filled,
          participants: [
            { email: "me@example.com", role: "organizer" },
            { email: "ada@example.com", role: "attendee" },
          ],
        },
        { participants: false },
      ).participants,
    ).toEqual([{ email: "me@example.com", role: "organizer" }]);
  });
});
