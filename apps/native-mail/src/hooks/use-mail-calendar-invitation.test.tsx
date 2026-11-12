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
import type { CalendarEvent } from "@workspace/calendar-core";
import { useMailCalendarInvitation } from "./use-mail-calendar-invitation";

const mockInvalidate = jest.fn(async () => undefined);
const mockQueryClient = { invalidateQueries: mockInvalidate };
const mockRefetch = jest.fn(async () => undefined);
let mockExisting: CalendarEvent | null;
let mockFirstResolution: Promise<CalendarEvent>;
const mockSeal = jest.fn((event: CalendarEvent) =>
  event.id === "a" ? mockFirstResolution : Promise.resolve(event),
);

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => mockQueryClient,
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => ({
    data: queryKey[0] === "invitations" ? mockExisting : undefined,
    isFetching: false,
    refetch: mockRefetch,
  }),
}));
jest.mock("@workspace/native-core/lib/api", () => ({
  calendarApiService: {
    sealImportedInvitationIfNeeded: (event: CalendarEvent) => mockSeal(event),
    getInvitationByExternalId: async () => mockEvent("a"),
  },
}));
jest.mock("../lib/mail/calendar-invite", () => ({
  extractMailCalendarInvite: ({
    message,
  }: {
    message?: { id: string } | null;
  }) => (message ? { uid: message.id, method: "REQUEST" } : null),
  hasCalendarInvitationMetadata: () => true,
  listCalendarAttachmentCandidates: () => [],
}));

function mockEvent(id: string): CalendarEvent {
  const date = new Date("2026-11-11T12:00:00Z");
  return {
    id,
    title: id,
    calendarId: "calendar",
    userId: "owner",
    start: date,
    end: date,
    createdAt: date,
    updatedAt: date,
  };
}

function Reader({ id }: { id: string }) {
  const { currentCalendarInviteEvent } = useMailCalendarInvitation({
    message: { id },
    plaintext: null,
    attachments: [],
    runtime: null,
    userId: "owner",
  });
  return <output>{currentCalendarInviteEvent?.event?.id ?? "loading"}</output>;
}

describe("mail invitation sealing lifetime", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  it.each([false, true])(
    "keeps the new invitation when the old seal finishes late (imported=%s)",
    async (imported) => {
      let finishFirst: ((value: CalendarEvent) => void) | undefined;
      mockFirstResolution = new Promise((resolve) => {
        finishFirst = resolve;
      });
      mockExisting = imported ? null : mockEvent("a");
      await act(async () => root.render(<Reader id="a" />));
      expect(mockSeal).toHaveBeenCalledWith(
        expect.objectContaining({ id: "a" }),
      );
      mockExisting = mockEvent("b");
      await act(async () => root.render(<Reader id="b" />));
      expect(container.textContent).toBe("b");
      const invalidations = mockInvalidate.mock.calls.length;
      await act(async () => finishFirst?.(mockEvent("a")));
      expect(container.textContent).toBe("b");
      expect(mockInvalidate).toHaveBeenCalledTimes(invalidations + 1);
    },
  );
});
