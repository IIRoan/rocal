import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
export const categoriesRoutes = new Elysia({ prefix: "/categories" })
    .get("/", async ({ user }) => {
    // Fetch user's active categories with usage count
    const categories = await prisma.eventCategory.findMany({
        where: {
            userId: user.id,
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
}, {
    auth: true,
})
    .post("/", async ({ body, user }) => {
    const { name, color } = body;
    // Validate required fields
    if (!name || !color) {
        throw new Error("Name and color are required fields");
    }
    // Validate color against allowed values (allow predefined colors or hex colors)
    const allowedColors = ["blue", "orange", "violet", "rose", "emerald"];
    const isHexColor = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
    if (!allowedColors.includes(color) && !isHexColor) {
        throw new Error(`Color must be one of: ${allowedColors.join(", ")} or a valid hex color (e.g., #FF0000)`);
    }
    // Check for name uniqueness per user
    const existingCategory = await prisma.eventCategory.findFirst({
        where: {
            userId: user.id,
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
            userId: user.id,
        },
    });
    return category;
}, {
    auth: true,
    body: t.Object({
        name: t.String(),
        color: t.String(),
    }),
})
    .put("/:id", async ({ params, body, user }) => {
    const { id } = params;
    const updates = body;
    // Verify category ownership
    const existingCategory = await prisma.eventCategory.findFirst({
        where: {
            id,
            userId: user.id,
        },
    });
    if (!existingCategory) {
        throw new Error("Category not found or access denied");
    }
    // Validate color if provided (allow predefined colors or hex colors)
    if (updates.color) {
        const allowedColors = ["blue", "orange", "violet", "rose", "emerald"];
        const isHexColor = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(updates.color);
        if (!allowedColors.includes(updates.color) && !isHexColor) {
            throw new Error(`Color must be one of: ${allowedColors.join(", ")} or a valid hex color (e.g., #FF0000)`);
        }
    }
    // Check for name uniqueness if name is being updated
    if (updates.name && updates.name.trim() !== existingCategory.name) {
        const duplicateCategory = await prisma.eventCategory.findFirst({
            where: {
                userId: user.id,
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
}, {
    auth: true,
    params: t.Object({
        id: t.String(),
    }),
    body: t.Object({
        name: t.Optional(t.String()),
        color: t.Optional(t.String()),
    }),
})
    .delete("/:id", async ({ params, user }) => {
    const { id } = params;
    // Verify category ownership
    const existingCategory = await prisma.eventCategory.findFirst({
        where: {
            id,
            userId: user.id,
        },
    });
    if (!existingCategory) {
        throw new Error("Category not found or access denied");
    }
    // Handle orphaned events by setting their categoryId to null
    await prisma.calendarEvent.updateMany({
        where: {
            categoryId: id,
            userId: user.id,
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
}, {
    auth: true,
    params: t.Object({
        id: t.String(),
    }),
});
