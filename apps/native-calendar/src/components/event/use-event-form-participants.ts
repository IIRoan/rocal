import { useCallback, useMemo } from "react";
import {
  isReservedSystemEmail,
  type EventParticipantInput,
} from "@workspace/calendar-core";
import type { UpdateFields, UpdateUi } from "./use-event-form-state";

export function useEventFormParticipants(
  participants: EventParticipantInput[],
  updateFields: UpdateFields,
  updateUi: UpdateUi,
) {
  const setParticipantError = useCallback(
    (message: string | null) =>
      updateUi((ui) => {
        const fieldErrors = { ...ui.fieldErrors };
        if (message) fieldErrors.participants = message;
        else delete fieldErrors.participants;
        return { fieldErrors };
      }),
    [updateUi],
  );

  const inviteParticipant = useCallback(
    (rawEmail: string, displayName?: string) => {
      const email = rawEmail
        .trim()
        .replace(/^mailto:/i, "")
        .toLowerCase();

      if (!email) {
        setParticipantError("Enter an email address first.");
        return false;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setParticipantError("Enter a valid email address.");
        return false;
      }
      if (isReservedSystemEmail(email)) {
        setParticipantError(
          "Cannot invite system or administrative addresses.",
        );
        return false;
      }
      if (participants.some((participant) => participant.email === email)) {
        setParticipantError("That participant is already invited.");
        return false;
      }

      setParticipantError(null);
      updateFields((fields) => ({
        participants: [
          ...fields.participants,
          {
            email,
            ...(displayName ? { displayName } : {}),
            role: "attendee",
            status: "pending",
          },
        ],
      }));
      return true;
    },
    [participants, setParticipantError, updateFields],
  );

  const clearParticipantError = useCallback(
    () => setParticipantError(null),
    [setParticipantError],
  );

  const removeParticipant = useCallback(
    (email: string) =>
      updateFields((fields) => ({
        participants: fields.participants.filter(
          (participant) => participant.email !== email,
        ),
      })),
    [updateFields],
  );

  const sortedParticipants = useMemo(
    () =>
      [...participants].sort((left, right) => {
        const roleDiff =
          (left.role === "organizer" ? 0 : 1) -
          (right.role === "organizer" ? 0 : 1);
        if (roleDiff !== 0) return roleDiff;
        return (left.displayName || left.email).localeCompare(
          right.displayName || right.email,
          undefined,
          { sensitivity: "base" },
        );
      }),
    [participants],
  );

  return {
    sortedParticipants,
    inviteParticipant,
    clearParticipantError,
    removeParticipant,
  };
}
