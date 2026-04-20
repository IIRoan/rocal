import { Elysia, t } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import type { AuthenticatedUser } from "../lib/auth-utils";
import { authenticatedRouteDetail } from "../lib/openapi";
import { resolveRouteUser } from "../lib/request-user";
import { strictObject } from "../lib/validation";
import { prisma } from "../lib/prisma";
import { SettingsService } from "../services/settings.service";

const settingsService = new SettingsService(prisma);

export const settingsRoutes = new Elysia({
  prefix: "/settings",
  normalize: false,
})
  .use(requireAuth)
  .guard(authenticatedRouteDetail("Settings"), (app) =>
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
          return settingsService.get(user.id);
        },
        {
          detail: {
            summary: "Get user settings",
            description:
              "Fetches the authenticated user's settings, creating defaults if none exist",
          },
        },
      )

      .put(
        "/",
        async ({
          body,
          authenticatedUser,
          request,
        }: {
          body: {
            theme?: "light" | "dark" | "system";
            defaultView?: "month" | "week" | "day" | "agenda";
            weekStartDay?: number;
            timezone?: string;
            timeFormat?: "12h" | "24h";
            workingHoursStart?: number;
            workingHoursEnd?: number;
            workingDays?: string;
            emailNotifications?: boolean;
            browserNotifications?: boolean;
            reminderSound?: boolean;
            defaultReminder?: number | null;
            defaultEventDuration?: number;
            defaultCalendarId?: string | null;
            compactView?: boolean;
            showWeekNumbers?: boolean;
            showDeclinedEvents?: boolean;
          };
          authenticatedUser?: AuthenticatedUser;
          request: Request;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          return settingsService.update({
            userId: user.id,
            ...body,
          });
        },
        {
          body: strictObject({
            theme: t.Optional(
              t.Union([
                t.Literal("light"),
                t.Literal("dark"),
                t.Literal("system"),
              ]),
            ),
            defaultView: t.Optional(
              t.Union([
                t.Literal("month"),
                t.Literal("week"),
                t.Literal("day"),
                t.Literal("agenda"),
              ]),
            ),
            weekStartDay: t.Optional(t.Number({ minimum: 0, maximum: 6 })),
            timezone: t.Optional(t.String()),
            timeFormat: t.Optional(
              t.Union([t.Literal("12h"), t.Literal("24h")]),
            ),
            workingHoursStart: t.Optional(
              t.Number({ minimum: 0, maximum: 1440 }),
            ),
            workingHoursEnd: t.Optional(
              t.Number({ minimum: 0, maximum: 1440 }),
            ),
            workingDays: t.Optional(t.String()),
            emailNotifications: t.Optional(t.Boolean()),
            browserNotifications: t.Optional(t.Boolean()),
            reminderSound: t.Optional(t.Boolean()),
            defaultReminder: t.Optional(
              t.Union([t.Number({ minimum: 1 }), t.Null()]),
            ),
            defaultEventDuration: t.Optional(t.Number({ minimum: 1 })),
            defaultCalendarId: t.Optional(t.Union([t.String(), t.Null()])),
            compactView: t.Optional(t.Boolean()),
            showWeekNumbers: t.Optional(t.Boolean()),
            showDeclinedEvents: t.Optional(t.Boolean()),
          }),
          detail: {
            summary: "Update user settings",
            description:
              "Updates the authenticated user's settings with validation",
          },
        },
      )

      .delete(
        "/",
        async ({
          authenticatedUser,
          request,
        }: {
          authenticatedUser?: AuthenticatedUser;
          request: Request;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          return settingsService.reset(user.id);
        },
        {
          detail: {
            summary: "Reset user settings",
            description: "Resets user settings to defaults",
          },
        },
      ),
  );
