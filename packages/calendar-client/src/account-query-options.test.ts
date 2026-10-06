import { describe, expect, it, jest } from "@jest/globals";
import { INVITES_QUERY_KEY, PUSH_DEVICES_QUERY_KEY } from "@workspace/calendar-core";
import type { CreateInviteResponse } from "./invite-api-service";
import {
  createInviteMutationOptions,
  invitesQueryOptions,
  linkedAuthAccountsQueryOptions,
  pushDevicesQueryOptions,
  revokeInviteMutationOptions,
} from "./account-query-options";

const invite: CreateInviteResponse = {
  id: "invite-1", token: "token", email: "friend@example.com", status: "pending",
  expiresAt: "2099-01-01T00:00:00Z", createdAt: "2026-10-06T00:00:00Z", invitedById: "user-1",
};

describe("shared account query options", () => {
  it("lists invites and push devices under their shared cache keys", async () => {
    const listInvites = jest.fn(async () => ({ invites: [invite] }));
    const invites = invitesQueryOptions({ listInvites });
    expect(invites.queryKey).toEqual(INVITES_QUERY_KEY);
    await expect(invites.queryFn()).resolves.toEqual({ invites: [invite] });

    const listPushDevices = jest.fn(async () => ({ devices: [] }));
    const push = pushDevicesQueryOptions({ listPushDevices }, false);
    expect(push.queryKey).toEqual(PUSH_DEVICES_QUERY_KEY);
    expect(push.enabled).toBe(false);
    await expect(push.queryFn()).resolves.toEqual({ devices: [] });
  });

  it("scopes linked accounts by session and handles clients without listAccounts", async () => {
    const client = { listAccounts: jest.fn(async () => ({ data: [{ providerId: "credential" }] })) };
    const signedIn = linkedAuthAccountsQueryOptions(client, "user-1");
    const nextUser = linkedAuthAccountsQueryOptions(client, "user-2");
    expect(signedIn.queryKey).not.toEqual(nextUser.queryKey);
    expect(signedIn.enabled).toBe(true);
    await expect(signedIn.queryFn()).resolves.toEqual([{ providerId: "credential" }]);
    expect(linkedAuthAccountsQueryOptions(client, null).enabled).toBe(false);
    const unavailable = linkedAuthAccountsQueryOptions({}, "user-1");
    expect(unavailable.enabled).toBe(false);
    await expect(unavailable.queryFn()).resolves.toEqual([]);
  });

  it("keeps create-invite warnings visible and waits for cache refresh", async () => {
    const createInvite = jest.fn(async () => invite);
    const onCreated = jest.fn();
    const onFeedback = jest.fn();
    const refreshed = Promise.resolve();
    const invalidate = jest.fn(() => refreshed);
    const options = createInviteMutationOptions({ createInvite }, { onCreated, onFeedback }, invalidate);

    await options.mutationFn(invite.email);
    expect(createInvite).toHaveBeenCalledWith(invite.email);
    expect(options.onSuccess({ ...invite, warnings: [{ code: "INVITE_EMAIL_DELIVERY_FAILED", message: "Delivery delayed." }] }, invite.email)).toBe(refreshed);
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onFeedback).toHaveBeenCalledWith({ tone: "warning", text: `Invite created for ${invite.email}. Delivery delayed.` });
    expect(invalidate).toHaveBeenCalledTimes(1);
    options.onError(new Error("Failed to send"));
    expect(onFeedback).toHaveBeenLastCalledWith({ tone: "error", text: "Failed to send" });
  });

  it("keeps revocation feedback platform-specific and reports errors without invalidation", async () => {
    const revokeInvite = jest.fn(async () => ({ success: true }));
    const onRevoked = jest.fn();
    const onFeedback = jest.fn();
    const onSuccess = jest.fn();
    const invalidate = jest.fn(async () => undefined);
    const options = revokeInviteMutationOptions({ revokeInvite }, { onRevoked, onFeedback, onSuccess }, invalidate);

    await options.mutationFn(invite.id);
    expect(revokeInvite).toHaveBeenCalledWith(invite.id);
    await options.onSuccess();
    expect(onRevoked).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
    options.onError({});
    expect(onRevoked).toHaveBeenCalledTimes(2);
    expect(onFeedback).toHaveBeenCalledWith({ tone: "error", text: "Failed to revoke invite." });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});
