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
            summary: "List user categories",
            description:
              "Returns every category owned by the authenticated user. Categories are lightweight labels that can be attached to events for filtering, grouping, and color-coding in the client.",
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
            name: t.String({
              description: "Human-readable category name shown in the UI.",
              examples: ["Deep work", "Personal", "Travel"],
            }),
            color: t.String({
              description:
                "Display color for the category. Hex values are recommended for predictable rendering.",
              examples: ["#0f766e", "#dc2626", "#2563eb"],
            }),
          }),
          detail: {
            summary: "Create a category",
            description:
              "Creates a new personal category for the authenticated user. Categories can later be assigned to events to improve visual organization and filtering.",
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
          params: strictObject({
            id: t.String({
              description: "Category identifier.",
            }),
          }),
          body: strictObject({
            name: t.Optional(
              t.String({
                description: "Updated category name.",
              }),
            ),
            color: t.Optional(
              t.String({
                description: "Updated category color.",
              }),
            ),
          }),
          detail: {
            summary: "Update a category",
            description:
              "Updates mutable category fields. Omit any field you do not want to change.",
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
          params: strictObject({
            id: t.String({
              description: "Category identifier.",
            }),
          }),
          detail: {
            summary: "Delete a category",
            description:
              "Deletes a category owned by the authenticated user. Existing events that referenced the category are preserved, but the category relationship is removed.",
          },
        },
      ),
  );
