import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { INVITES_QUERY_KEY } from "@workspace/calendar-core";
import {
  createInviteMutationOptions,
  invitesQueryOptions,
  revokeInviteMutationOptions,
  type InviteFeedback,
} from "@workspace/calendar-client/account-query-options";
import { inviteApiService } from "../lib/api";
import { useToast } from "../providers/ToastProvider";

export type { InviteFeedback } from "@workspace/calendar-client/account-query-options";

export function useInvites() {
  return useQuery(invitesQueryOptions(inviteApiService));
}

export function useCreateInvite(input: {
  onCreated: () => void;
  onFeedback: (feedback: InviteFeedback) => void;
}) {
  const queryClient = useQueryClient();
  return useMutation(
    createInviteMutationOptions(
      inviteApiService,
      input,
      () => queryClient.invalidateQueries({ queryKey: INVITES_QUERY_KEY }),
    ),
  );
}

export function useRevokeInvite(input: {
  onRevoked: () => void;
  onFeedback: (feedback: InviteFeedback) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation(
    revokeInviteMutationOptions(
      inviteApiService,
      { ...input, onSuccess: () => toast("Invite revoked") },
      () => queryClient.invalidateQueries({ queryKey: INVITES_QUERY_KEY }),
    ),
  );
}
