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
      findUnique: jest.fn<() => Promise<{ id: string } | null>>(async () => ({
        id: "user-1",
      })),
      delete: tx.user.delete,
    },
    mailDirectoryEntry: {
      findUnique: jest.fn<() => Promise<{ id: string } | null>>(
        async () => null,
      ),
    },
    calendarSharing: tx.calendarSharing,
    notificationLog: tx.notificationLog,
    $transaction: jest.fn(
      async (callback: (db: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };

  return { prisma, tx };
}

describe("AccountService", () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockMailService: {
    deleteMailboxForUser: jest.Mock<() => Promise<void>>;
  };
  let service: AccountService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockMailService = {
      deleteMailboxForUser: jest.fn<() => Promise<void>>(async () => undefined),
    };
    service = new AccountService(
      mockPrisma.prisma as never,
      {
        defaultEmailDomain: "solace.onl",
      },
      mockMailService,
    );
  });

  it("returns the configured signup domain", () => {
    expect(service.getSignupConfig()).toEqual({
      defaultEmailDomain: "solace.onl",
    });
  });

  it("returns availability details for a valid unused sign-up handle", async () => {
    mockPrisma.prisma.user.findUnique.mockResolvedValueOnce(null);
    mockPrisma.prisma.mailDirectoryEntry.findUnique.mockResolvedValueOnce(null);

    const result = await service.checkEmailAvailability({
      email: "  Roan  ",
    });

    expect(mockPrisma.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "roan@solace.onl" },
      select: { id: true },
    });
    expect(
      mockPrisma.prisma.mailDirectoryEntry.findUnique,
    ).toHaveBeenCalledWith({
      where: { email: "roan@solace.onl" },
      select: { id: true },
    });
    expect(result).toEqual({
      email: "  Roan  ",
      localPart: "roan",
      domain: "solace.onl",
      normalizedEmail: "roan@solace.onl",
      available: true,
      code: "available",
      message: "That email address is available.",
    });
  });

  it("rejects invalid sign-up handles without querying the database", async () => {
    const result = await service.checkEmailAvailability({
      email: "not an email",
    });

    expect(mockPrisma.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(
      mockPrisma.prisma.mailDirectoryEntry.findUnique,
    ).not.toHaveBeenCalled();
    expect(result).toEqual({
      email: "not an email",
      localPart: "not an email",
      domain: "solace.onl",
      normalizedEmail: "not an email",
      available: false,
      code: "invalid_email",
      message:
        "Use only lowercase letters, numbers, dots, underscores, and hyphens in your Solace email.",
    });
  });

  it("reports the address as unavailable when an account already exists", async () => {
    mockPrisma.prisma.user.findUnique.mockResolvedValueOnce({ id: "user-2" });

    const result = await service.checkEmailAvailability({
      email: "roan@solace.onl",
    });

    expect(result).toEqual({
      email: "roan@solace.onl",
      localPart: "roan",
      domain: "solace.onl",
      normalizedEmail: "roan@solace.onl",
      available: false,
      code: "already_in_use",
      message: "That email address is already in use.",
    });
  });

  it("deletes non-cascading user references before removing the user", async () => {
    const result = await service.deleteAccount({ userId: "user-1" });

    expect(mockMailService.deleteMailboxForUser).toHaveBeenCalledWith({
      userId: "user-1",
    });
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
