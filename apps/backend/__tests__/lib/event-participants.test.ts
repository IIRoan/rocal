import { describe, expect, it } from "@jest/globals";

import {
  mapEventParticipant,
  reconcileOwnedEventParticipantsFromRemote,
} from "../../lib/event-participants";

describe("mapEventParticipant", () => {
  it("sanitizes participant profile image URLs", () => {
    const participant = mapEventParticipant({
      id: "participant-1",
      eventId: "event-1",
      userId: "user-1",
      email: "alice@example.com",
      displayName: "Alice",
      role: "attendee",
      status: "pending",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      user: {
        id: "user-1",
        email: "alice@example.com",
        name: "Alice",
        image: "https://cdn.example.com/alice.png",
      },
    });

    expect(participant.image).toBe(
      "/api/profiles/avatar?email=alice%40example.com",
    );
  });

  it("drops unsafe participant profile image URLs", () => {
    const participant = mapEventParticipant({
      id: "participant-1",
      eventId: "event-1",
      userId: "user-1",
      email: "alice@example.com",
      displayName: "Alice",
      role: "attendee",
      status: "pending",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      user: {
        id: "user-1",
        email: "alice@example.com",
        name: "Alice",
        image: "http://127.0.0.1/tracker.png",
      },
    });

    expect(participant.image).toBeNull();
  });
});

describe("reconcileOwnedEventParticipantsFromRemote", () => {
  it("never adopts Stalwart-invented admin principals as invitees", () => {
    const reconciled = reconcileOwnedEventParticipantsFromRemote({
      owner: {
        email: "testingproduction15@solace.onl",
        name: "Tester",
      },
      localParticipants: [
        {
          email: "testingproduction15@solace.onl",
          role: "organizer",
          status: "accepted",
        },
      ],
      remoteParticipants: [
        {
          email: "admin@solace.onl",
          role: "organizer",
          status: "accepted",
        },
        {
          email: "testingproduction15@solace.onl",
          role: "attendee",
          status: "accepted",
        },
      ],
    });

    expect(reconciled).toEqual([
      {
        email: "testingproduction15@solace.onl",
        displayName: "Tester",
        role: "organizer",
        status: "accepted",
      },
    ]);
  });

  it("refreshes RSVP status for already-invited attendees only", () => {
    const reconciled = reconcileOwnedEventParticipantsFromRemote({
      owner: { email: "owner@solace.onl", name: "Owner" },
      localParticipants: [
        {
          email: "owner@solace.onl",
          role: "organizer",
          status: "accepted",
        },
        {
          email: "guest@example.com",
          displayName: "Guest",
          role: "attendee",
          status: "pending",
        },
      ],
      remoteParticipants: [
        {
          email: "admin@solace.onl",
          role: "organizer",
          status: "accepted",
        },
        {
          email: "guest@example.com",
          role: "attendee",
          status: "accepted",
        },
        {
          email: "stranger@example.com",
          role: "attendee",
          status: "pending",
        },
      ],
    });

    expect(reconciled).toEqual([
      {
        email: "owner@solace.onl",
        displayName: "Owner",
        role: "organizer",
        status: "accepted",
      },
      {
        email: "guest@example.com",
        displayName: "Guest",
        role: "attendee",
        status: "accepted",
      },
    ]);
  });
});
