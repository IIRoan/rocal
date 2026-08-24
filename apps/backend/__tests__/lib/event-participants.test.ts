import { describe, expect, it } from "@jest/globals";

import { mapEventParticipant } from "../../lib/event-participants";

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
