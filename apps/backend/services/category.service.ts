import type { PrismaClient } from "../generated/prisma/index.js";
import type {
  ICategoryService,
  CategoryCreateInput,
  CategoryUpdateInput,
  CategoryDeleteInput,
  CategoryWithCount,
} from "../contracts/category.contract";
import {
  ALLOWED_CALENDAR_COLORS,
  isValidCalendarColor,
} from "../lib/colors";

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

    if (!name || !color) {
      throw new Error("Name and color are required fields");
    }

    if (!isValidCalendarColor(color)) {
      throw new Error(
        `Color must be one of: ${ALLOWED_CALENDAR_COLORS.join(", ")} or a valid hex color (e.g., #FF0000)`,
      );
    }

    const existingCategory = await this.prisma.eventCategory.findFirst({
      where: { userId, name: name.trim() },
    });

    if (existingCategory) {
      throw new Error("A category with this name already exists");
    }

    return this.prisma.eventCategory.create({
      data: {
        name: name.trim(),
        ...(encryptedName !== undefined ? { encryptedName } : {}),
        ...(blindIndexTokens !== undefined
          ? { blindIndexTokens: JSON.stringify(blindIndexTokens) }
          : {}),
        ...(encryptionState !== undefined ? { encryptionState } : {}),
        ...(encryptionKeyVersion !== undefined
          ? { encryptionKeyVersion }
          : {}),
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

    const existingCategory = await this.prisma.eventCategory.findFirst({
      where: { id: categoryId, userId },
    });

    if (!existingCategory) {
      throw new Error("Category not found or access denied");
    }

    if (color && !isValidCalendarColor(color)) {
      throw new Error(
        `Color must be one of: ${ALLOWED_CALENDAR_COLORS.join(", ")} or a valid hex color (e.g., #FF0000)`,
      );
    }

    if (name && name.trim() !== existingCategory.name) {
      const duplicateCategory = await this.prisma.eventCategory.findFirst({
        where: {
          userId,
          name: name.trim(),
          id: { not: categoryId },
        },
      });

      if (duplicateCategory) {
        throw new Error("A category with this name already exists");
      }
    }

    return this.prisma.eventCategory.update({
      where: { id: categoryId },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(color !== undefined ? { color } : {}),
        ...(encryptedName !== undefined ? { encryptedName } : {}),
        ...(blindIndexTokens !== undefined
          ? { blindIndexTokens: JSON.stringify(blindIndexTokens) }
          : {}),
        ...(encryptionState !== undefined ? { encryptionState } : {}),
        ...(encryptionKeyVersion !== undefined
          ? { encryptionKeyVersion }
          : {}),
      },
    });
  }

  async delete(input: CategoryDeleteInput) {
    const { userId, categoryId } = input;

    const existingCategory = await this.prisma.eventCategory.findFirst({
      where: { id: categoryId, userId },
    });

    if (!existingCategory) {
      throw new Error("Category not found or access denied");
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
