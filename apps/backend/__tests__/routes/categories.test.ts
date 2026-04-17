import { describe, expect, it, jest } from "@jest/globals";
import { Elysia } from "elysia";

jest.mock("../../lib/prisma", () => ({
  prisma: {
    eventCategory: {
      findMany: jest.fn(async (): Promise<any> => []),
      findFirst: jest.fn(async (): Promise<any> => null),
      create: jest.fn(async (): Promise<any> => null),
      update: jest.fn(async (): Promise<any> => null),
      delete: jest.fn(async (): Promise<any> => null),
    },
    calendarEvent: {
      updateMany: jest.fn(async (): Promise<any> => ({ count: 0 })),
    },
  },
}));

jest.mock("../../lib/auth-utils", () => ({
  ensureAuthenticatedUser: jest.fn(async (): Promise<any> => ({
    id: "user-1",
  })),
}));

jest.mock("../../lib/auth", () => ({
  auth: { api: { getSession: jest.fn() } },
}));

jest.mock("../../lib/auth-guard", () => {
  const { Elysia: LocalElysia } =
    jest.requireActual<typeof import("elysia")>("elysia");
  return {
    requireAuth: new LocalElysia({ name: "require-auth-test" }),
  };
});

import { errorHandler } from "../../lib/errors";
import { ensureAuthenticatedUser } from "../../lib/auth-utils";
import { prisma } from "../../lib/prisma";
import { categoriesRoutes } from "../../routes/categories";

const mockEnsureAuthenticatedUser =
  ensureAuthenticatedUser as jest.MockedFunction<typeof ensureAuthenticatedUser>;
const mockPrisma = prisma as unknown as {
  eventCategory: {
    findMany: jest.Mock<() => Promise<any>>;
    findFirst: jest.Mock<() => Promise<any>>;
    create: jest.Mock<() => Promise<any>>;
    update: jest.Mock<() => Promise<any>>;
    delete: jest.Mock<() => Promise<any>>;
  };
  calendarEvent: {
    updateMany: jest.Mock<() => Promise<any>>;
  };
};

function createApp() {
  return new Elysia().use(errorHandler).use(categoriesRoutes);
}

async function readJson(response: Response) {
  return response.json();
}

async function readText(response: Response) {
  return response.text();
}

describe("categoriesRoutes", () => {
  it("lists active categories and exposes usageCount", async () => {
    mockEnsureAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockPrisma.eventCategory.findMany.mockResolvedValue([
      {
        id: "category-1",
        name: "Work",
        color: "blue",
        isActive: true,
        userId: "user-1",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-02T00:00:00.000Z"),
        _count: { events: 4 },
      },
    ]);

    const response = await createApp().handle(
      new Request("http://localhost/categories/"),
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      categories: [
        {
          id: "category-1",
          name: "Work",
          color: "blue",
          isActive: true,
          userId: "user-1",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-02T00:00:00.000Z",
          usageCount: 4,
        },
      ],
    });
  });

  it("creates a category with trimmed names", async () => {
    const created = {
      id: "category-1",
      name: "Work",
      color: "#123456",
      userId: "user-1",
    };
    mockEnsureAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockPrisma.eventCategory.findFirst.mockResolvedValue(null);
    mockPrisma.eventCategory.create.mockResolvedValue(created);

    const response = await createApp().handle(
      new Request("http://localhost/categories/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "  Work  ",
          color: "#123456",
        }),
      }),
    );

    expect(mockPrisma.eventCategory.create).toHaveBeenCalledWith({
      data: {
        name: "Work",
        color: "#123456",
        userId: "user-1",
      },
    });
    await expect(readJson(response)).resolves.toEqual(created);
  });

  it("rejects invalid category colors", async () => {
    mockEnsureAuthenticatedUser.mockResolvedValue({ id: "user-1" });

    const response = await createApp().handle(
      new Request("http://localhost/categories/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Work",
          color: "teal",
        }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(readText(response)).resolves.toContain("Color must be one of:");
    expect(mockPrisma.eventCategory.create).not.toHaveBeenCalled();
  });

  it("rejects missing required category fields", async () => {
    mockEnsureAuthenticatedUser.mockResolvedValue({ id: "user-1" });

    const response = await createApp().handle(
      new Request("http://localhost/categories/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "",
          color: "",
        }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(readText(response)).resolves.toBe(
      "Name and color are required fields",
    );
  });

  it("rejects duplicate category names on create", async () => {
    mockEnsureAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockPrisma.eventCategory.findFirst.mockResolvedValue({
      id: "category-1",
      name: "Work",
      color: "blue",
      userId: "user-1",
    });

    const response = await createApp().handle(
      new Request("http://localhost/categories/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Work",
          color: "blue",
        }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(readText(response)).resolves.toBe(
      "A category with this name already exists",
    );
  });

  it("updates a category after checking ownership and duplicate names", async () => {
    const existingCategory = {
      id: "category-1",
      name: "Work",
      color: "blue",
      userId: "user-1",
    };
    const updatedCategory = {
      ...existingCategory,
      name: "Focus",
      color: "emerald",
    };

    mockEnsureAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockPrisma.eventCategory.findFirst
      .mockResolvedValueOnce(existingCategory)
      .mockResolvedValueOnce(null);
    mockPrisma.eventCategory.update.mockResolvedValue(updatedCategory);

    const response = await createApp().handle(
      new Request("http://localhost/categories/category-1", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "  Focus  ",
          color: "emerald",
        }),
      }),
    );

    expect(mockPrisma.eventCategory.update).toHaveBeenCalledWith({
      where: { id: "category-1" },
      data: {
        name: "Focus",
        color: "emerald",
      },
    });
    await expect(readJson(response)).resolves.toEqual(updatedCategory);
  });

  it("rejects missing or inaccessible categories during update", async () => {
    mockEnsureAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockPrisma.eventCategory.findFirst.mockResolvedValue(null);

    const response = await createApp().handle(
      new Request("http://localhost/categories/category-missing", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Focus",
        }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(readText(response)).resolves.toBe(
      "Category not found or access denied",
    );
  });

  it("rejects invalid colors and duplicate names during update", async () => {
    const existingCategory = {
      id: "category-1",
      name: "Work",
      color: "blue",
      userId: "user-1",
    };
    mockEnsureAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockPrisma.eventCategory.findFirst
      .mockResolvedValueOnce(existingCategory)
      .mockResolvedValueOnce(existingCategory)
      .mockResolvedValueOnce(existingCategory);

    const invalidColorResponse = await createApp().handle(
      new Request("http://localhost/categories/category-1", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          color: "teal",
        }),
      }),
    );

    expect(invalidColorResponse.status).toBe(500);
    await expect(readText(invalidColorResponse)).resolves.toContain(
      "Color must be one of:",
    );

    const duplicateNameResponse = await createApp().handle(
      new Request("http://localhost/categories/category-1", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Personal",
        }),
      }),
    );

    expect(duplicateNameResponse.status).toBe(500);
    await expect(readText(duplicateNameResponse)).resolves.toBe(
      "A category with this name already exists",
    );
  });

  it("deletes a category after detaching orphaned events", async () => {
    mockEnsureAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockPrisma.eventCategory.findFirst.mockResolvedValue({
      id: "category-1",
      userId: "user-1",
    });
    mockPrisma.calendarEvent.updateMany.mockResolvedValue({ count: 2 });
    mockPrisma.eventCategory.delete.mockResolvedValue({ id: "category-1" });

    const response = await createApp().handle(
      new Request("http://localhost/categories/category-1", {
        method: "DELETE",
      }),
    );

    expect(mockPrisma.calendarEvent.updateMany).toHaveBeenCalledWith({
      where: {
        categoryId: "category-1",
        userId: "user-1",
      },
      data: {
        categoryId: null,
      },
    });
    expect(mockPrisma.eventCategory.delete).toHaveBeenCalledWith({
      where: { id: "category-1" },
    });
    await expect(readJson(response)).resolves.toEqual({
      success: true,
      message: "Category deleted successfully",
    });
  });

  it("rejects delete requests for categories the user does not own", async () => {
    mockEnsureAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockPrisma.eventCategory.findFirst.mockResolvedValue(null);

    const response = await createApp().handle(
      new Request("http://localhost/categories/category-missing", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(500);
    await expect(readText(response)).resolves.toBe(
      "Category not found or access denied",
    );
  });
});
