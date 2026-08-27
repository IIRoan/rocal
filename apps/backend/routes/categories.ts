import { Elysia } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { authenticatedRouteDetail } from "../lib/openapi";
import { prisma } from "../lib/prisma";
import { CategoryService } from "../services/category.service";
import { RouteModel, routeModels } from "../contracts";

const categoryService = new CategoryService(prisma);

export const categoriesRoutes = new Elysia({
  prefix: "/categories",
  normalize: false,
})
  .use(routeModels)
  .use(requireAuth)
  .guard(authenticatedRouteDetail("Categories"), (app) =>
    app
      .get("/", {
        detail: {
          summary: "List user categories",
          description:
            "Returns every category owned by the authenticated user. Categories are lightweight labels that can be attached to events for filtering, grouping, and color-coding in the client.",
        },
      }, async ({ routeUser }) => {
        return categoryService.list(routeUser.id);
      })

      .post("/", {
        body: RouteModel.category.createBody,
        detail: {
          summary: "Create a category",
          description:
            "Creates a new event category for the authenticated user. Category names must be unique per user.",
        },
      }, async ({ body, routeUser }) => {
        return categoryService.create({
          userId: routeUser.id,
          name: body.name,
          color: body.color,
          encryptedName: body.encryptedName,
          blindIndexTokens: body.blindIndexTokens,
          encryptionState: body.encryptionState,
          encryptionKeyVersion: body.encryptionKeyVersion,
        });
      })

      .put("/:id", {
        params: RouteModel.category.idParams,
        body: RouteModel.category.updateBody,
        detail: {
          summary: "Update a category",
          description:
            "Updates an existing category. Name changes must remain unique within the user's categories.",
        },
      }, async ({ params, body, routeUser }) => {
        return categoryService.update({
          userId: routeUser.id,
          categoryId: params.id,
          name: body.name,
          color: body.color,
          encryptedName: body.encryptedName,
          blindIndexTokens: body.blindIndexTokens,
          encryptionState: body.encryptionState,
          encryptionKeyVersion: body.encryptionKeyVersion,
        });
      })

      .delete("/:id", {
        params: RouteModel.category.idParams,
        detail: {
          summary: "Delete a category",
          description:
            "Soft-deletes a category and clears category references from the user's events.",
        },
      }, async ({ params, routeUser }) => {
        return categoryService.delete({
          userId: routeUser.id,
          categoryId: params.id,
        });
      }),
  );
