import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ConflictError } from "../../lib/errors";
import { InviteService } from "../../services/invite.service";

type InviteRow = {
  id: string;
  token: string;
  email: string;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  invitedById: string;
  claimedAt: Date | null;
  claimedForEmail: string | null;
};

function createMockPrisma() {
  return {
    user: {
      findUnique: jest.fn<() => Promise<{ id: string } | null>>(
        async () => null,
      ),
    },
    invite: {
      findFirst: jest.fn<() => Promise<Partial<InviteRow> | null>>(
        async () => null,
      ),
      findUnique: jest.fn<() => Promise<InviteRow | null>>(async () => null),
      create: jest.fn(async () => ({
        id: "invite-1",
        token: "token-1",
        email: "friend@example.com",
        status: "pending",
        expiresAt: new Date("2026-05-22T00:00:00.000Z"),
        createdAt: new Date("2026-05-15T00:00:00.000Z"),
        invitedById: "user-1",
      })),
      update: jest.fn(async () => ({
        id: "invite-1",
      })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
  };
}

describe("InviteService", () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: InviteService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new InviteService(prisma as never);
  });

  it("rejects creating an invite when the email already belongs to an account", async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ id: "user-2" });

    await expect(
      service.createInvite({
        invitedById: "user-1",
        email: "friend@example.com",
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(prisma.invite.create).not.toHaveBeenCalled();
  });

  it("rejects creating a duplicate active invite for the same sender and email", async () => {
    prisma.invite.findFirst.mockResolvedValueOnce({ id: "invite-existing" });

    await expect(
      service.createInvite({
        invitedById: "user-1",
        email: "friend@example.com",
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(prisma.invite.create).not.toHaveBeenCalled();
  });

  it("refuses to claim an invite for an email that already has an account", async () => {
    prisma.invite.findUnique.mockResolvedValueOnce({
      id: "invite-1",
      token: "token-1",
      email: "friend@example.com",
      status: "pending",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date("2026-05-15T00:00:00.000Z"),
      invitedById: "user-1",
      claimedAt: null,
      claimedForEmail: null,
    });
    prisma.user.findUnique.mockResolvedValueOnce({ id: "user-2" });

    await expect(
      service.claimInviteToken({
        token: "token-1",
        chosenEmail: "friend@solace.onl",
      }),
    ).resolves.toEqual({
      success: false,
      reason: "That email address already has an account.",
    });

    expect(prisma.invite.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to claim an invite that has already been claimed", async () => {
    prisma.invite.findUnique.mockResolvedValueOnce({
      id: "invite-1",
      token: "token-1",
      email: "friend@example.com",
      status: "claimed",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date("2026-05-15T00:00:00.000Z"),
      invitedById: "user-1",
      claimedAt: new Date("2026-05-15T01:00:00.000Z"),
      claimedForEmail: "other@solace.onl",
    });

    await expect(
      service.claimInviteToken({
        token: "token-1",
        chosenEmail: "friend@solace.onl",
      }),
    ).resolves.toEqual({
      success: false,
      reason: "This invite has already been claimed.",
    });

    expect(prisma.invite.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to claim when a concurrent claim wins the race", async () => {
    prisma.invite.findUnique.mockResolvedValueOnce({
      id: "invite-1",
      token: "token-1",
      email: "friend@example.com",
      status: "pending",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date("2026-05-15T00:00:00.000Z"),
      invitedById: "user-1",
      claimedAt: null,
      claimedForEmail: null,
    });
    prisma.invite.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.claimInviteToken({
        token: "token-1",
        chosenEmail: "friend@solace.onl",
      }),
    ).resolves.toEqual({
      success: false,
      reason: "This invite is no longer available.",
    });
  });

  it("claims a pending invite successfully", async () => {
    prisma.invite.findUnique.mockResolvedValueOnce({
      id: "invite-1",
      token: "token-1",
      email: "friend@example.com",
      status: "pending",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date("2026-05-15T00:00:00.000Z"),
      invitedById: "user-1",
      claimedAt: null,
      claimedForEmail: null,
    });
    prisma.invite.updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      service.claimInviteToken({
        token: "token-1",
        chosenEmail: "friend@solace.onl",
      }),
    ).resolves.toEqual({
      success: true,
      inviteId: "invite-1",
    });

    expect(prisma.invite.updateMany).toHaveBeenCalledWith({
      where: { id: "invite-1", status: "pending" },
      data: expect.objectContaining({
        status: "claimed",
        claimedForEmail: "friend@solace.onl",
      }),
    });
  });
});
