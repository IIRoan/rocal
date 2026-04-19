import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../lib/auth-guard";
import { strictObject } from "../lib/validation";
import {
  ALLOWED_CALENDAR_COLORS,
  isValidCalendarColor,
} from "../lib/colors";

import { ensureAuthenticatedUser } from "../lib/auth-utils";

type CategoriesContext<TParams = Record<string, never>, TBody = unknown> = {
  params: TParams;
  body: TBody;
  request: Request;
  user?: unknown;
};

export const categoriesRoutes = new Elysia({
  prefix: "/categories",
  normalize: false,
})
  .use(requireAuth)
  .get(
    "/",
    async ({ user, request }: CategoriesContext) => {
      const authenticatedUser = await ensureAuthenticatedUser(user, request);
      // Fetch user's active categories with usage count
      const categories = await prisma.eventCategory.findMany({
        where: {
          userId: authenticatedUser.id,
          isActive: true,
        },
        include: {
          _count: {
            select: {
              events: true,
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      });

      // Transform to include usage count
      const categoriesWithCount = categories.map((category) => ({
        ...category,
        usageCount: category._count.events,
        _count: undefined,
      }));

      return { categories: categoriesWithCount };
    },
    {},
  )

  .post(
    "/",
    async ({
      body,
      user,
      request,
    }: CategoriesContext<Record<string, never>, { name: string; color: string }>) => {
      // Robust user check with fallback
      const authenticatedUser = await ensureAuthenticatedUser(user, request);

      const { name, color } = body;

      // Validate required fields
      if (!name || !color) {
        throw new Error("Name and color are required fields");
      }

      // Validate color against allowed values (allow predefined colors or hex colors)
      if (!isValidCalendarColor(color)) {
        throw new Error(
          `Color must be one of: ${ALLOWED_CALENDAR_COLORS.join(", ")} or a valid hex color (e.g., #FF0000)`,
        );
      }

      // Check for name uniqueness per user
      const existingCategory = await prisma.eventCategory.findFirst({
        where: {
          userId: authenticatedUser.id,
          name: name.trim(),
        },
      });

      if (existingCategory) {
        throw new Error("A category with this name already exists");
      }

      // Create the category
      const category = await prisma.eventCategory.create({
        data: {
          name: name.trim(),
          color,
          userId: authenticatedUser.id,
        },
      });

      return category;
    },
    {
      body: strictObject({
        name: t.String(),
        color: t.String(),
      }),
    },
  )

  .put(
    "/:id",
    async ({
      params,
      body,
      user,
      request,
    }: CategoriesContext<{ id: string }, { name?: string; color?: string }>) => {
      // Robust user check with fallback
      const authenticatedUser = await ensureAuthenticatedUser(user, request);

      const { id } = params;
      const updates = body;

      // Verify category ownership
      const existingCategory = await prisma.eventCategory.findFirst({
        where: {
          id,
          userId: authenticatedUser.id,
        },
      });

      if (!existingCategory) {
        throw new Error("Category not found or access denied");
      }

      // Validate color if provided (allow predefined colors or hex colors)
      if (updates.color && !isValidCalendarColor(updates.color)) {
        throw new Error(
          `Color must be one of: ${ALLOWED_CALENDAR_COLORS.join(", ")} or a valid hex color (e.g., #FF0000)`,
        );
      }

      // Check for name uniqueness if name is being updated
      if (updates.name && updates.name.trim() !== existingCategory.name) {
        const duplicateCategory = await prisma.eventCategory.findFirst({
          where: {
            userId: authenticatedUser.id,
            name: updates.name.trim(),
            id: { not: id },
          },
        });

        if (duplicateCategory) {
          throw new Error("A category with this name already exists");
        }
      }

      // Update the category
      const updatedCategory = await prisma.eventCategory.update({
        where: { id },
        data: {
          ...updates,
          name: updates.name ? updates.name.trim() : undefined,
        },
      });

      return updatedCategory;
    },
    {
      params: strictObject({
        id: t.String(),
      }),
      body: strictObject({
        name: t.Optional(t.String()),
        color: t.Optional(t.String()),
      }),
    },
  )

  .delete(
    "/:id",
    async ({ params, user, request }: CategoriesContext<{ id: string }>) => {
      // Robust user check with fallback
      const authenticatedUser = await ensureAuthenticatedUser(user, request);

      const { id } = params;

      // Verify category ownership
      const existingCategory = await prisma.eventCategory.findFirst({
        where: {
          id,
          userId: authenticatedUser.id,
        },
      });

      if (!existingCategory) {
        throw new Error("Category not found or access denied");
      }

      // Handle orphaned events by setting their categoryId to null
      await prisma.calendarEvent.updateMany({
        where: {
          categoryId: id,
          userId: authenticatedUser.id,
        },
        data: {
          categoryId: null,
        },
      });

      // Delete the category
      await prisma.eventCategory.delete({
        where: { id },
      });

      return { success: true, message: "Category deleted successfully" };
    },
    {
      params: strictObject({
        id: t.String(),
      }),
    },
  );
