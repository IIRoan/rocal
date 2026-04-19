import { Elysia, t } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { strictObject } from "../lib/validation";
import { ensureAuthenticatedUser } from "../lib/auth-utils";
import { prisma } from "../lib/prisma";
import { CategoryService } from "../services/category.service";

const categoryService = new CategoryService(prisma);

export const categoriesRoutes = new Elysia({
  prefix: "/categories",
  normalize: false,
})
  .use(requireAuth)
  .get(
    "/",
    async ({ user, request }: { user?: unknown; request: Request }) => {
      const { id: userId } = await ensureAuthenticatedUser(user, request);
      return categoryService.list(userId);
    },
    {},
  )

  .post(
    "/",
    async ({
      body,
      user,
      request,
    }: {
      body: { name: string; color: string };
      user?: unknown;
      request: Request;
    }) => {
      const { id: userId } = await ensureAuthenticatedUser(user, request);
      return categoryService.create({ userId, name: body.name, color: body.color });
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
    }: {
      params: { id: string };
      body: { name?: string; color?: string };
      user?: unknown;
      request: Request;
    }) => {
      const { id: userId } = await ensureAuthenticatedUser(user, request);
      return categoryService.update({
        userId,
        categoryId: params.id,
        name: body.name,
        color: body.color,
      });
    },
    {
      params: strictObject({ id: t.String() }),
      body: strictObject({
        name: t.Optional(t.String()),
        color: t.Optional(t.String()),
      }),
    },
  )

  .delete(
    "/:id",
    async ({
      params,
      user,
      request,
    }: {
      params: { id: string };
      user?: unknown;
      request: Request;
    }) => {
      const { id: userId } = await ensureAuthenticatedUser(user, request);
      return categoryService.delete({ userId, categoryId: params.id });
    },
    {
      params: strictObject({ id: t.String() }),
    },
  );
