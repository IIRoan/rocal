import { Elysia, t } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { ensureAuthenticatedUser } from "../lib/auth-utils";
import { strictObject } from "../lib/validation";
import { prisma } from "../lib/prisma";
import { SettingsService } from "../services/settings.service";

const settingsService = new SettingsService(prisma);

export const settingsRoutes = new Elysia({
  prefix: "/settings",
  normalize: false,
})
  .use(requireAuth)
  .get(
    "/",
    async ({ user, request }: { user?: unknown; request: Request }) => {
      const { id: userId } = await ensureAuthenticatedUser(user, request);
      return settingsService.get(userId);
    },
    {
      detail: {
        tags: ["Settings"],
        summary: "Get user settings",
        description:
          "Fetches the authenticated user's settings, creating defaults if none exist",
        security: [{ bearerAuth: [] }],
      },
    },
  )

  .put(
    "/",
    async ({ body, user, request }: { body: Record<string, unknown>; user?: unknown; request: Request }) => {
      const { id: userId } = await ensureAuthenticatedUser(user, request);
      return settingsService.update({ userId, ...body } as any);
    },
    {
      body: strictObject({
        theme: t.Optional(
          t.Union([t.Literal("light"), t.Literal("dark"), t.Literal("system")]),
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
        timeFormat: t.Optional(t.Union([t.Literal("12h"), t.Literal("24h")])),
        workingHoursStart: t.Optional(t.Number({ minimum: 0, maximum: 1440 })),
        workingHoursEnd: t.Optional(t.Number({ minimum: 0, maximum: 1440 })),
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
        tags: ["Settings"],
        summary: "Update user settings",
        description:
          "Updates the authenticated user's settings with validation",
        security: [{ bearerAuth: [] }],
      },
    },
  )

  .delete(
    "/",
    async ({ user, request }: { user?: unknown; request: Request }) => {
      const { id: userId } = await ensureAuthenticatedUser(user, request);
      return settingsService.reset(userId);
    },
    {
      detail: {
        tags: ["Settings"],
        summary: "Reset user settings",
        description: "Resets user settings to defaults",
        security: [{ bearerAuth: [] }],
      },
    },
  );
