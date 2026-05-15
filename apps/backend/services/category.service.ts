import type { PrismaClient } from "../generated/prisma/client.js";
import type {
  ICategoryService,
  CategoryCreateInput,
  CategoryUpdateInput,
  CategoryDeleteInput,
  CategoryWithCount,
} from "../contracts/category.contract";
import { ValidationError } from "../lib/errors";
import { createLogger } from "@workspace/logger";
import {
  assertValidEntityColor,
  buildEncryptedNameFields,
  normalizeEntityName,
} from "../lib/entity-metadata";

const logger = createLogger("backend:category-service");

export class CategoryService implements ICategoryService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: string): Promise<{ categories: CategoryWithCount[] }> {
    const categories = await this.prisma.eventCategory.findMany({
      where: {
        userId,
        isActive: true,
      },
      include: {
        _count: {
          select: { events: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const categoriesWithCount = categories.map((category) => ({
      ...category,
      usageCount: category._count.events,
      _count: undefined,
    }));

    return { categories: categoriesWithCount as CategoryWithCount[] };
  }

  async create(input: CategoryCreateInput) {
    const {
      userId,
      name,
      color,
      encryptedName,
      blindIndexTokens,
      encryptionState,
      encryptionKeyVersion,
    } = input;

    const normalizedName = normalizeEntityName(name, {
      entityLabel: "Category",
    });

    assertValidEntityColor(color);

    const existingCategory = await this.prisma.eventCategory.findFirst({
      where: { userId, name: normalizedName },
    });

    if (existingCategory) {
      throw new ValidationError(
        "A category with this name already exists",
        "name",
      );
    }

    return this.prisma.eventCategory.create({
      data: {
        name: normalizedName,
        ...buildEncryptedNameFields({
          encryptedName,
          blindIndexTokens,
          encryptionState,
          encryptionKeyVersion,
        }),
        color,
        userId,
      },
    });
  }

  async update(input: CategoryUpdateInput) {
    const {
      userId,
      categoryId,
      name,
      color,
      encryptedName,
      blindIndexTokens,
      encryptionState,
      encryptionKeyVersion,
    } = input;

    const normalizedName =
      name !== undefined
        ? normalizeEntityName(name, { entityLabel: "Category" })
        : undefined;

    const existingCategory = await this.prisma.eventCategory.findFirst({
      where: { id: categoryId, userId },
    });

    if (!existingCategory) {
      throw new ValidationError("Category not found or access denied", "categoryId");
    }

    if (color !== undefined) {
      assertValidEntityColor(color);
    }

    if (normalizedName !== undefined && normalizedName !== existingCategory.name) {
      const duplicateCategory = await this.prisma.eventCategory.findFirst({
        where: {
          userId,
          name: normalizedName,
          id: { not: categoryId },
        },
      });

      if (duplicateCategory) {
        throw new ValidationError(
          "A category with this name already exists",
          "name",
        );
      }
    }

    return this.prisma.eventCategory.update({
      where: { id: categoryId },
      data: {
        ...(normalizedName !== undefined ? { name: normalizedName } : {}),
        ...(color !== undefined ? { color } : {}),
        ...buildEncryptedNameFields({
          encryptedName,
          blindIndexTokens,
          encryptionState,
          encryptionKeyVersion,
        }),
      },
    });
  }

  async delete(input: CategoryDeleteInput) {
    const { userId, categoryId } = input;

    const existingCategory = await this.prisma.eventCategory.findFirst({
      where: { id: categoryId, userId },
    });

    if (!existingCategory) {
      throw new ValidationError("Category not found or access denied", "categoryId");
    }

    await this.prisma.calendarEvent.updateMany({
      where: { categoryId, userId },
      data: { categoryId: null },
    });

    await this.prisma.eventCategory.delete({
      where: { id: categoryId },
    });

    return { success: true, message: "Category deleted successfully" };
  }
}
