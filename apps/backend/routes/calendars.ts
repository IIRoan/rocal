import { Elysia } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { authenticatedRouteDetail } from "../lib/openapi";
import { prisma } from "../lib/prisma";
import { CalendarService } from "../services/calendar.service";
import { createStalwartCalendarClient } from "../lib/stalwart-calendar";
import { RouteModel, routeModels } from "../contracts";

const calendarService = new CalendarService(
  prisma,
  createStalwartCalendarClient(),
);

export const calendarsRoutes = new Elysia({
  prefix: "/calendars",
  normalize: false,
})
  .use(routeModels)
  .use(requireAuth)
  .guard(authenticatedRouteDetail("Calendars"), (app) =>
    app
      .get("/", {
        detail: {
          summary: "Get user's calendars",
          description:
            "Fetches all calendars belonging to the authenticated user",
        },
      }, async ({ routeUser }) => {
        return calendarService.list(routeUser.id);
      })

      .post("/", {
        body: RouteModel.calendar.createBody,
        detail: {
          summary: "Create a new calendar",
          description: "Creates a new calendar for the authenticated user",
        },
      }, async ({ body, routeUser }) => {
        return calendarService.create({
          userId: routeUser.id,
          name: body.name,
          color: body.color,
          isDefault: body.isDefault,
          encryptedName: body.encryptedName,
          blindIndexTokens: body.blindIndexTokens,
          encryptionState: body.encryptionState,
          encryptionKeyVersion: body.encryptionKeyVersion,
          forceFullEncryption: body.forceFullEncryption,
        });
      })

      .put("/:id", {
        params: RouteModel.calendar.idParams,
        body: RouteModel.calendar.updateBody,
        detail: {
          summary: "Update an existing calendar",
          description:
            "Updates an existing calendar with ownership verification",
        },
      }, async ({ params, body, routeUser }) => {
        return calendarService.update({
          userId: routeUser.id,
          calendarId: params.id,
          name: body.name,
          color: body.color,
          isVisible: body.isVisible,
          isDefault: body.isDefault,
          encryptedName: body.encryptedName,
          blindIndexTokens: body.blindIndexTokens,
          encryptionState: body.encryptionState,
          encryptionKeyVersion: body.encryptionKeyVersion,
          forceFullEncryption: body.forceFullEncryption,
        });
      })

      .delete("/:id", {
        parse: "none",
        params: RouteModel.calendar.idParams,
        query: RouteModel.calendar.deleteQuery,
        detail: {
          summary: "Delete a calendar with event handling options",
          description: `Deletes a calendar with options for handling existing events:
      - delete_events: (default) Delete calendar and all its events
      - move_events: Move all events to another calendar (requires targetCalendarId)`,
        },
      }, async ({ params, query, routeUser }) => {
        return calendarService.delete({
          userId: routeUser.id,
          calendarId: params.id,
          action: query.action,
          targetCalendarId: query.targetCalendarId,
        });
      }),
  );
