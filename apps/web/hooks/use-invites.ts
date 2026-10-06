"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { INVITES_QUERY_KEY } from "@workspace/calendar-core";
import {
  createInviteMutationOptions,
  invitesQueryOptions,
  revokeInviteMutationOptions,
} from "@workspace/calendar-client/account-query-options";
import { inviteApiService } from "@/lib/api-clients";

export type InviteMessage = {
  kind: "success" | "warning" | "error";
  text: string;
};

export function useInvites() {
  return useQuery(invitesQueryOptions(inviteApiService));
}

export function useCreateInvite(input: {
  onCreated: () => void;
  onFeedback: (message: InviteMessage) => void;
}) {
  const queryClient = useQueryClient();
  return useMutation(
    createInviteMutationOptions(
      inviteApiService,
      {
        onCreated: input.onCreated,
        onFeedback: ({ tone, text }) => input.onFeedback({ kind: tone, text }),
      },
      () => queryClient.invalidateQueries({ queryKey: INVITES_QUERY_KEY }),
    ),
  );
}

export function useRevokeInvite(input: {
  onRevoked: () => void;
  onFeedback: (message: InviteMessage) => void;
}) {
  const queryClient = useQueryClient();
  return useMutation(
    revokeInviteMutationOptions(
      inviteApiService,
      {
        onRevoked: input.onRevoked,
        onFeedback: ({ tone, text }) => input.onFeedback({ kind: tone, text }),
      },
      () => queryClient.invalidateQueries({ queryKey: INVITES_QUERY_KEY }),
    ),
  );
}
