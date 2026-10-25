/** @jest-environment jsdom */

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { EventParticipantInput } from "@workspace/calendar-core";
import { useEventFormParticipants } from "./use-event-form-participants";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Participants = ReturnType<typeof useEventFormParticipants>;

function Harness({
  participants,
  onRender,
}: {
  participants: EventParticipantInput[];
  onRender: (result: Participants) => void;
}) {
  const result = useEventFormParticipants(participants, jest.fn(), jest.fn());
  useEffect(() => onRender(result));
  return null;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
});

function render(participants: EventParticipantInput[]): Participants {
  let latest: Participants | null = null;
  act(() =>
    root.render(
      <Harness
        participants={participants}
        onRender={(result) => {
          latest = result;
        }}
      />,
    ),
  );
  if (!latest) throw new Error("Harness has not rendered");
  return latest;
}

describe("useEventFormParticipants", () => {
  it("renders a new event's empty participant list", () => {
    expect(render([]).sortedParticipants).toEqual([]);
  });

  it("lists the organizer first, then attendees by name, without reordering the form's list", () => {
    const participants: EventParticipantInput[] = [
      { email: "zed@example.com", role: "attendee" },
      { email: "amy@example.com", displayName: "bea", role: "attendee" },
      { email: "host@example.com", role: "organizer" },
    ];

    const { sortedParticipants } = render(participants);

    expect(sortedParticipants.map((participant) => participant.email)).toEqual([
      "host@example.com",
      "amy@example.com",
      "zed@example.com",
    ]);
    expect(participants[0].email).toBe("zed@example.com");
  });
});
