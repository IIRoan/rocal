import { Elysia } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { authenticatedRouteDetail } from "../lib/openapi";
import { prisma } from "../lib/prisma";
import { RecurringService } from "../services/recurring.service";
import { RouteModel, routeModels } from "../contracts";

const recurringService = new RecurringService(prisma);

export const recurringRoutes = new Elysia({
  prefix: "/recurring",
  normalize: false,
})
  .use(routeModels)
  .use(requireAuth)
  .guard(authenticatedRouteDetail("Recurring"), (app) =>
    app
      .post("/validate", {
        body: RouteModel.recurring.validateBody,
        detail: {
          summary: "Validate a recurrence rule",
          description:
            "Validates a recurrence rule and returns a human-readable description",
        },
      }, ({ body }) => {
        return recurringService.validate(body.rule);
      })

      .post("/preview", {
        body: RouteModel.recurring.previewBody,
        detail: {
          summary: "Preview recurring event instances",
          description:
            "Generate a preview of recurring event instances for the specified period",
        },
      }, ({ body }) => {
        return recurringService.preview({
          eventStart: body.eventStart,
          eventEnd: body.eventEnd,
          recurrenceRule: body.recurrenceRule,
          previewDays: body.previewDays,
        });
      })

      .put("/event/:id", {
        params: RouteModel.recurring.eventIdParams,
        body: RouteModel.recurring.editBody,
        detail: {
          summary: "Edit recurring event series",
          description:
            "Edit a recurring event with options for scope: single occurrence, this and future, or entire series",
        },
      }, async ({ params, body, routeUser }) => {
        return recurringService.editSeries({
          userId: routeUser.id,
          eventId: params.id,
          editScope: body.editScope,
          occurrenceDate: body.occurrenceDate,
          updates: body.updates,
        });
      })

      .delete("/event/:id", {
        params: RouteModel.recurring.eventIdParams,
        query: RouteModel.recurring.deleteQuery,
        detail: {
          summary: "Delete recurring event series",
          description:
            "Delete a recurring event with options for scope: single occurrence, this and future, or entire series",
        },
      }, async ({ params, query, routeUser }) => {
        return recurringService.deleteSeries({
          userId: routeUser.id,
          eventId: params.id,
          deleteScope: query.deleteScope,
          occurrenceDate: query.occurrenceDate,
        });
      })

      .get("/patterns", {
        detail: {
          summary: "Get common recurrence patterns",
          description: "Returns pre-defined common recurrence patterns",
        },
      }, () => {
        return recurringService.getCommonPatterns();
      }),
  );
