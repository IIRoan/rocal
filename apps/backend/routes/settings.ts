import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { ValidationError } from "../lib/errors";
import { requireAuth } from "../lib/auth-guard";
import { ensureAuthenticatedUser } from "../lib/auth-utils";
import { strictObject } from "../lib/validation";

type SettingsUpdateBody = {
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

type SettingsContext<TBody = unknown> = {
  body: TBody;
  request: Request;
  user?: unknown;
};

export const settingsRoutes = new Elysia({
  prefix: "/settings",
  normalize: false,
})
  .use(requireAuth)
  .get(
    "/",
    async ({ user, request }: SettingsContext) => {
      const authenticatedUser = await ensureAuthenticatedUser(user, request);
      // Get user settings, create default if doesn't exist
      let settings = await prisma.userSettings.findUnique({
        where: {
          userId: authenticatedUser.id,
        },
      });

      // Create default settings if none exist
      if (!settings) {
        settings = await prisma.userSettings.create({
          data: {
            userId: authenticatedUser.id,
          },
        });
      }

      return settings;
    },
    {
      detail: {
        tags: ["Settings"],
        summary: "Get user settings",
        description:
          "Fetches the authenticated user's settings, creating defaults if none exist",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Settings retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    userId: { type: "string" },
                    theme: {
                      type: "string",
                      enum: ["light", "dark", "system"],
                    },
                    defaultView: {
                      type: "string",
                      enum: ["month", "week", "day", "agenda"],
                    },
                    weekStartDay: { type: "number", minimum: 0, maximum: 6 },
                    timezone: { type: "string" },
                    timeFormat: { type: "string", enum: ["12h", "24h"] },
                    workingHoursStart: { type: "number" },
                    workingHoursEnd: { type: "number" },
                    workingDays: { type: "string" },
                    emailNotifications: { type: "boolean" },
                    browserNotifications: { type: "boolean" },
                    reminderSound: { type: "boolean" },
                    defaultReminder: { type: "number", nullable: true },
                    defaultEventDuration: { type: "number" },
                    defaultCalendarId: { type: "string", nullable: true },
                    compactView: { type: "boolean" },
                    showWeekNumbers: { type: "boolean" },
                    showDeclinedEvents: { type: "boolean" },
                  },
                },
              },
            },
          },
          401: {
            description: "Unauthorized",
          },
        },
      },
    },
  )

  .put(
    "/",
    async ({ body, user, request }: SettingsContext<SettingsUpdateBody>) => {
      const authenticatedUser = await ensureAuthenticatedUser(user, request);
      if (body.timezone) {
        try {
          Intl.DateTimeFormat(undefined, { timeZone: body.timezone });
        } catch {
          throw new ValidationError("Invalid timezone identifier", "timezone");
        }
      }

      // Validate working hours
      if (
        body.workingHoursStart !== undefined &&
        body.workingHoursEnd !== undefined
      ) {
        if (body.workingHoursStart >= body.workingHoursEnd) {
          throw new ValidationError(
            "Working hours start must be before working hours end",
            "workingHoursStart",
          );
        }
      }

      // Validate working days JSON format
      if (body.workingDays) {
        try {
          const workingDays = JSON.parse(body.workingDays);
          if (
            !Array.isArray(workingDays) ||
            !workingDays.every(
              (day) => typeof day === "number" && day >= 0 && day <= 6,
            )
          ) {
            throw new ValidationError(
              "Working days must be a JSON array of numbers 0-6",
              "workingDays",
            );
          }
        } catch {
          throw new ValidationError(
            "Invalid working days format - must be valid JSON array",
            "workingDays",
          );
        }
      }

      // Validate default calendar exists and belongs to user
      if (body.defaultCalendarId) {
        const calendar = await prisma.calendar.findFirst({
          where: {
            id: body.defaultCalendarId,
            userId: authenticatedUser.id,
          },
        });

        if (!calendar) {
          throw new ValidationError(
            "Invalid default calendar or calendar does not belong to user",
            "defaultCalendarId",
          );
        }

        if (calendar.kind !== "owned") {
          throw new ValidationError(
            "The default calendar must be one of your editable calendars.",
            "defaultCalendarId",
          );
        }
      }

      // Update or create settings
      const settings = await prisma.userSettings.upsert({
        where: {
          userId: authenticatedUser.id,
        },
        update: {
          ...body,
          updatedAt: new Date(),
        },
        create: {
          userId: authenticatedUser.id,
          ...body,
        },
      });

      return settings;
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
        requestBody: {
          description: "User settings to update",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  theme: { type: "string", enum: ["light", "dark", "system"] },
                  defaultView: {
                    type: "string",
                    enum: ["month", "week", "day", "agenda"],
                  },
                  weekStartDay: { type: "number", minimum: 0, maximum: 6 },
                  timezone: {
                    type: "string",
                    description: "IANA timezone identifier",
                  },
                  timeFormat: { type: "string", enum: ["12h", "24h"] },
                  workingHoursStart: {
                    type: "number",
                    minimum: 0,
                    maximum: 1440,
                    description: "Minutes from midnight",
                  },
                  workingHoursEnd: {
                    type: "number",
                    minimum: 0,
                    maximum: 1440,
                    description: "Minutes from midnight",
                  },
                  workingDays: {
                    type: "string",
                    description: "JSON array of weekdays (0-6)",
                  },
                  emailNotifications: { type: "boolean" },
                  browserNotifications: { type: "boolean" },
                  reminderSound: { type: "boolean" },
                  defaultReminder: {
                    type: "number",
                    minimum: 1,
                    description: "Default reminder in minutes",
                  },
                  defaultEventDuration: {
                    type: "number",
                    minimum: 1,
                    description: "Default event duration in minutes",
                  },
                  defaultCalendarId: { type: "string" },
                  compactView: { type: "boolean" },
                  showWeekNumbers: { type: "boolean" },
                  showDeclinedEvents: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Settings updated successfully",
          },
          400: {
            description: "Validation error",
          },
          401: {
            description: "Unauthorized",
          },
        },
      },
    },
  )

  .delete(
    "/",
    async ({ user, request }: SettingsContext) => {
      const authenticatedUser = await ensureAuthenticatedUser(user, request);

      // Delete user settings (will recreate with defaults on next GET)
      await prisma.userSettings.deleteMany({
        where: {
          userId: authenticatedUser.id,
        },
      });

      return {
        success: true,
        message: "User settings reset to defaults",
      };
    },
    {
      detail: {
        tags: ["Settings"],
        summary: "Reset user settings",
        description: "Resets user settings to defaults",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Settings reset successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
          401: {
            description: "Unauthorized",
          },
        },
      },
    },
  );
