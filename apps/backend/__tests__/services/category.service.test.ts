import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { ValidationError } from "../../lib/errors";
import { CategoryService } from "../../services/category.service";

type CategoryFixtureInput = Partial<{
  id: string;
  name: string;
  color: string;
  userId: string;
  isActive: boolean;
  encryptedName: string | null;
  blindIndexTokens: string | null;
  encryptionState: "plaintext" | "shadow_write" | "encrypted";
  encryptionKeyVersion: number | null;
}>;

function categoryFixture(overrides: CategoryFixtureInput = {}) {
  return {
    id: "category-1",
    name: "Work",
    color: "blue",
    userId: "user-1",
    isActive: true,
    encryptedName: null,
    blindIndexTokens: null,
    encryptionState: "plaintext" as const,
    encryptionKeyVersion: 1,
    createdAt: new Date("2026-04-24T10:00:00.000Z"),
    updatedAt: new Date("2026-04-24T10:00:00.000Z"),
    ...overrides,
  };
}

function createMockPrisma() {
  return {
    eventCategory: {
      findMany: jest.fn<() => Promise<any[]>>(async () => []),
      findFirst: jest.fn<() => Promise<any | null>>(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
        categoryFixture(data),
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => categoryFixture({ id: where.id, ...data }),
      ),
      delete: jest.fn(async () => categoryFixture()),
    },
    calendarEvent: {
      updateMany: jest.fn(async () => ({ count: 2 })),
    },
  };
}

describe("CategoryService", () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let service: CategoryService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new CategoryService(mockPrisma as never);
  });

  it("creates categories with normalized names and encrypted metadata", async () => {
    const created = await service.create({
      userId: "user-1",
      name: "  Focus  ",
      color: "#123456",
      encryptedName: "ciphertext",
      blindIndexTokens: ["idx-1", "idx-2"],
      encryptionState: "shadow_write",
      encryptionKeyVersion: 2,
    });

    expect(mockPrisma.eventCategory.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", name: "Focus" },
    });
    expect(mockPrisma.eventCategory.create).toHaveBeenCalledWith({
      data: {
        name: "Focus",
        color: "#123456",
        userId: "user-1",
        encryptedName: "ciphertext",
        blindIndexTokens: JSON.stringify(["idx-1", "idx-2"]),
        encryptionState: "shadow_write",
        encryptionKeyVersion: 2,
      },
    });
    expect(created).toEqual(
      expect.objectContaining({
        name: "Focus",
        color: "#123456",
      }),
    );
  });

  it.each([
    ["  ", "Category name is required and cannot be empty"],
    ["x".repeat(101), "Category name cannot exceed 100 characters"],
  ])("rejects invalid category names: %s", async (name, message) => {
    await expect(
      service.create({
        userId: "user-1",
        name,
        color: "blue",
      }),
    ).rejects.toMatchObject({
      name: "ValidationError",
      field: "name",
      message,
    } as Partial<ValidationError>);
  });

  it("rejects invalid colors during update", async () => {
    mockPrisma.eventCategory.findFirst.mockResolvedValueOnce(categoryFixture());

    await expect(
      service.update({
        userId: "user-1",
        categoryId: "category-1",
        color: "chartreuse",
      }),
    ).rejects.toMatchObject({
      name: "ValidationError",
      field: "color",
    } as Partial<ValidationError>);
  });

  it("rejects duplicate names during update", async () => {
    mockPrisma.eventCategory.findFirst
      .mockResolvedValueOnce(categoryFixture())
      .mockResolvedValueOnce(
        categoryFixture({ id: "category-2", name: "Personal" }),
      );

    await expect(
      service.update({
        userId: "user-1",
        categoryId: "category-1",
        name: "  Personal  ",
      }),
    ).rejects.toMatchObject({
      name: "ValidationError",
      field: "name",
      message: "A category with this name already exists",
    } as Partial<ValidationError>);
  });

  it("detaches linked events before deleting a category", async () => {
    mockPrisma.eventCategory.findFirst.mockResolvedValue(categoryFixture());

    const result = await service.delete({
      userId: "user-1",
      categoryId: "category-1",
    });

    expect(mockPrisma.calendarEvent.updateMany).toHaveBeenCalledWith({
      where: { categoryId: "category-1", userId: "user-1" },
      data: { categoryId: null },
    });
    expect(mockPrisma.eventCategory.delete).toHaveBeenCalledWith({
      where: { id: "category-1" },
    });
    expect(result).toEqual({
      success: true,
      message: "Category deleted successfully",
    });
  });
});
