import {
  authAccountsQueryKey,
  extractLinkedAuthAccounts,
  getErrorMessage,
  getInviteCreateFeedback,
  INVITES_QUERY_KEY,
  PUSH_DEVICES_QUERY_KEY,
} from "@workspace/calendar-core";
import type { CalendarApiService } from "./calendar-api-service";
import type { CreateInviteResponse, InviteApiService } from "./invite-api-service";

export type InviteFeedback = {
  tone: "success" | "warning" | "error";
  text: string;
};

export function invitesQueryOptions(api: Pick<InviteApiService, "listInvites">) {
  return {
    queryKey: INVITES_QUERY_KEY,
    queryFn: () => api.listInvites(),
    staleTime: 30_000,
  };
}

export function createInviteMutationOptions(
  api: Pick<InviteApiService, "createInvite">,
  input: {
    onCreated: () => void;
    onFeedback: (feedback: InviteFeedback) => void;
  },
  invalidateInvites: () => Promise<unknown>,
) {
  return {
    mutationFn: (emailAddress: string) => api.createInvite(emailAddress),
    onSuccess: (data: CreateInviteResponse, emailAddress: string) => {
      input.onCreated();
      input.onFeedback(getInviteCreateFeedback(emailAddress, data));
      return invalidateInvites();
    },
    onError: (error: unknown) => {
      input.onFeedback({
        tone: "error",
        text: getErrorMessage(error, "Failed to create invite."),
      });
    },
  };
}

export function revokeInviteMutationOptions(
  api: Pick<InviteApiService, "revokeInvite">,
  input: {
    onRevoked: () => void;
    onFeedback: (feedback: InviteFeedback) => void;
    onSuccess?: () => void;
  },
  invalidateInvites: () => Promise<unknown>,
) {
  return {
    mutationFn: (id: string) => api.revokeInvite(id),
    onSuccess: () => {
      input.onRevoked();
      input.onSuccess?.();
      return invalidateInvites();
    },
    onError: (error: unknown) => {
      input.onRevoked();
      input.onFeedback({
        tone: "error",
        text: getErrorMessage(error, "Failed to revoke invite."),
      });
    },
  };
}

export function linkedAuthAccountsQueryOptions(
  client: { listAccounts?: () => Promise<unknown> },
  userId: string | null,
) {
  return {
    queryKey: authAccountsQueryKey(userId),
    queryFn: async () => {
      if (typeof client.listAccounts !== "function") return [];
      return extractLinkedAuthAccounts(await client.listAccounts());
    },
    enabled: Boolean(userId) && typeof client.listAccounts === "function",
    staleTime: 5 * 60 * 1000,
  };
}

export function pushDevicesQueryOptions(
  api: Pick<CalendarApiService, "listPushDevices">,
  enabled: boolean,
) {
  return {
    queryKey: PUSH_DEVICES_QUERY_KEY,
    queryFn: () => api.listPushDevices(),
    staleTime: 30_000,
    enabled,
  };
}
