import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { NotFoundError } from "../../lib/errors";
import { AccountService } from "../../services/account.service";

function createMockPrisma() {
  const tx = {
    calendarSharing: {
      deleteMany: jest.fn(async () => ({ count: 2 })),
    },
    notificationLog: {
      deleteMany: jest.fn(async () => ({ count: 3 })),
    },
    user: {
      delete: jest.fn(async () => ({ id: "user-1" })),
    },
  };

  const prisma = {
    user: {
      findUnique: jest.fn<() => Promise<{ id: string } | null>>(
        async () => ({ id: "user-1" }),
      ),
      delete: tx.user.delete,
    },
    calendarSharing: tx.calendarSharing,
    notificationLog: tx.notificationLog,
    $transaction: jest.fn(async (callback: (db: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };

  return { prisma, tx };
}

describe("AccountService", () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let service: AccountService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new AccountService(mockPrisma.prisma as never);
  });

  it("deletes non-cascading user references before removing the user", async () => {
    const result = await service.deleteAccount({ userId: "user-1" });

    expect(mockPrisma.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { id: true },
    });
    expect(mockPrisma.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.tx.calendarSharing.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{ sharedWith: "user-1" }, { sharedBy: "user-1" }],
      },
    });
    expect(mockPrisma.tx.notificationLog.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
    expect(mockPrisma.tx.user.delete).toHaveBeenCalledWith({
      where: { id: "user-1" },
    });
    expect(result).toEqual({
      success: true,
      message: "Account deleted successfully",
      deletedUserId: "user-1",
    });
  });

  it("fails when the account no longer exists", async () => {
    mockPrisma.prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.deleteAccount({ userId: "user-1" }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mockPrisma.prisma.$transaction).not.toHaveBeenCalled();
  });
});
