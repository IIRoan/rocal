import { Elysia, t } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import type { AuthenticatedUser } from "../lib/auth-utils";
import { strictObject } from "../lib/validation";
import { authenticatedRouteDetail } from "../lib/openapi";
import { resolveRouteUser } from "../lib/request-user";
import { prisma } from "../lib/prisma";
import { CategoryService } from "../services/category.service";

const categoryService = new CategoryService(prisma);

export const categoriesRoutes = new Elysia({
  prefix: "/categories",
  normalize: false,
})
  .use(requireAuth)
  .guard(authenticatedRouteDetail("Categories"), (app) =>
    app
      .get(
        "/",
        async ({
          authenticatedUser,
          request,
        }: {
          authenticatedUser?: AuthenticatedUser;
          request: Request;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          return categoryService.list(user.id);
        },
        {
          detail: {
            summary: "Get user categories",
          },
        },
      )

      .post(
        "/",
        async ({
          body,
          authenticatedUser,
          request,
        }: {
          body: { name: string; color: string };
          authenticatedUser?: AuthenticatedUser;
          request: Request;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          return categoryService.create({
            userId: user.id,
            name: body.name,
            color: body.color,
          });
        },
        {
          body: strictObject({
            name: t.String(),
            color: t.String(),
          }),
          detail: {
            summary: "Create a category",
          },
        },
      )

      .put(
        "/:id",
        async ({
          params,
          body,
          authenticatedUser,
          request,
        }: {
          params: { id: string };
          body: { name?: string; color?: string };
          authenticatedUser?: AuthenticatedUser;
          request: Request;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          return categoryService.update({
            userId: user.id,
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
          detail: {
            summary: "Update a category",
          },
        },
      )

      .delete(
        "/:id",
        async ({
          params,
          authenticatedUser,
          request,
        }: {
          params: { id: string };
          authenticatedUser?: AuthenticatedUser;
          request: Request;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          return categoryService.delete({
            userId: user.id,
            categoryId: params.id,
          });
        },
        {
          params: strictObject({ id: t.String() }),
          detail: {
            summary: "Delete a category",
          },
        },
      ),
  );
