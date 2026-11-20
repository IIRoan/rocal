import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { VacationResponse, VacationResponseUpdate } from "@workspace/calendar-core";

/** A platform's JMAP client and session, as the auto-reply needs them. */
export type VacationResponseConnection<Session> = {
  client: {
    getVacationResponse: (session: Session) => Promise<VacationResponse | null>;
    setVacationResponse: (session: Session, update: VacationResponseUpdate) => Promise<void>;
  };
  session: Session;
};

function requireConnection<Session>(connection: VacationResponseConnection<Session> | null) {
  if (!connection) throw new Error("Mail is not ready yet.");
  return connection;
}

export function vacationResponseQueryOptions<Session>(
  queryKey: QueryKey,
  connection: VacationResponseConnection<Session> | null,
) {
  return {
    queryKey,
    queryFn: () => {
      const { client, session } = requireConnection(connection);
      return client.getVacationResponse(session);
    },
  };
}

/** The form holds the draft, so a failed save leaves the cache alone and keeps what was typed; a saved one is read back. */
export function saveVacationResponseMutationOptions<Session>(
  queryKey: QueryKey,
  connection: VacationResponseConnection<Session> | null,
  queryClient: QueryClient,
) {
  return {
    mutationFn: (update: VacationResponseUpdate) => {
      const { client, session } = requireConnection(connection);
      return client.setVacationResponse(session, update);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey, exact: true }),
  };
}
