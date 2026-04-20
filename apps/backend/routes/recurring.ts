import { Elysia, t } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { ensureAuthenticatedUser } from "../lib/auth-utils";
import { strictObject } from "../lib/validation";
import { prisma } from "../lib/prisma";
import { RecurringService } from "../services/recurring.service";

const recurringService = new RecurringService(prisma);

export const recurringRoutes = new Elysia({
  prefix: "/recurring",
  normalize: false,
})
  .use(requireAuth)
  .post(
    "/validate",
    async ({ body }: { body: { rule: string | Record<string, unknown> } }) => {
      return recurringService.validate(body.rule);
    },
    {
      body: strictObject({
        rule: t.Union([
          t.String({ description: "JSON string of recurrence rule" }),
          strictObject({
            frequency: t.Union([
              t.Literal("daily"),
              t.Literal("weekly"),
              t.Literal("monthly"),
              t.Literal("yearly"),
            ]),
            interval: t.Number({ minimum: 1, maximum: 999 }),
            count: t.Optional(t.Number({ minimum: 1 })),
            until: t.Optional(t.String({ description: "ISO date string" })),
            timezone: t.Optional(t.String()),
            byWeekDay: t.Optional(
              t.Array(t.Number({ minimum: 0, maximum: 6 })),
            ),
            byMonthDay: t.Optional(
              t.Array(t.Number({ minimum: 1, maximum: 31 })),
            ),
            byMonth: t.Optional(t.Array(t.Number({ minimum: 1, maximum: 12 }))),
          }),
        ]),
      }),
      detail: {
        tags: ["Recurring"],
        summary: "Validate a recurrence rule",
        description:
          "Validates a recurrence rule and returns a human-readable description",
        security: [{ bearerAuth: [] }],
      },
    },
  )

  .post(
    "/preview",
    async ({
      body,
    }: {
      body: {
        eventStart: string;
        eventEnd: string;
        recurrenceRule: string | Record<string, unknown>;
        previewDays?: number;
      };
    }) => {
      return recurringService.preview({
        eventStart: body.eventStart,
        eventEnd: body.eventEnd,
        recurrenceRule: body.recurrenceRule,
        previewDays: body.previewDays,
      });
    },
    {
      body: strictObject({
        eventStart: t.String({ description: "ISO date string" }),
        eventEnd: t.String({ description: "ISO date string" }),
        recurrenceRule: t.Union([
          t.String({ description: "JSON string of recurrence rule" }),
          strictObject({
            frequency: t.Union([
              t.Literal("daily"),
              t.Literal("weekly"),
              t.Literal("monthly"),
              t.Literal("yearly"),
            ]),
            interval: t.Number({ minimum: 1, maximum: 999 }),
            count: t.Optional(t.Number({ minimum: 1 })),
            until: t.Optional(t.String()),
            timezone: t.Optional(t.String()),
            byWeekDay: t.Optional(
              t.Array(t.Number({ minimum: 0, maximum: 6 })),
            ),
            byMonthDay: t.Optional(
              t.Array(t.Number({ minimum: 1, maximum: 31 })),
            ),
            byMonth: t.Optional(t.Array(t.Number({ minimum: 1, maximum: 12 }))),
          }),
        ]),
        previewDays: t.Optional(
          t.Number({ minimum: 7, maximum: 365, default: 90 }),
        ),
      }),
      detail: {
        tags: ["Recurring"],
        summary: "Preview recurring event instances",
        description:
          "Generate a preview of recurring event instances for the specified period",
        security: [{ bearerAuth: [] }],
      },
    },
  )

  .put(
    "/event/:id",
    async ({
      params,
      body,
      user,
      request,
    }: {
      params: { id: string };
      body: {
        editScope: "this_only" | "this_and_future" | "all";
        occurrenceDate?: string;
        updates: Record<string, unknown>;
      };
      user?: unknown;
      request: Request;
    }) => {
      const { id: userId } = await ensureAuthenticatedUser(user, request);
      return recurringService.editSeries({
        userId,
        eventId: params.id,
        editScope: body.editScope,
        occurrenceDate: body.occurrenceDate,
        updates: body.updates,
      });
    },
    {
      params: strictObject({
        id: t.String({ description: "Recurring event ID" }),
      }),
      body: strictObject({
        editScope: t.Union([
          t.Literal("this_only"),
          t.Literal("this_and_future"),
          t.Literal("all"),
        ]),
        occurrenceDate: t.Optional(
          t.String({
            description:
              "ISO date of the specific occurrence (required for this_only and this_and_future)",
          }),
        ),
        updates: strictObject({
          title: t.Optional(t.String()),
          description: t.Optional(t.String()),
          start: t.Optional(t.String()),
          end: t.Optional(t.String()),
          allDay: t.Optional(t.Boolean()),
          location: t.Optional(t.String()),
          color: t.Optional(t.String()),
          reminder: t.Optional(t.Number()),
          recurrence: t.Optional(t.String()),
          calendarId: t.Optional(t.String()),
          categoryId: t.Optional(t.String()),
        }),
      }),
      detail: {
        tags: ["Recurring"],
        summary: "Edit recurring event series",
        description:
          "Edit a recurring event with options for scope: single occurrence, this and future, or entire series",
        security: [{ bearerAuth: [] }],
      },
    },
  )

  .delete(
    "/event/:id",
    async ({
      params,
      query,
      user,
      request,
    }: {
      params: { id: string };
      query: {
        deleteScope: "this_only" | "this_and_future" | "all";
        occurrenceDate?: string;
      };
      user?: unknown;
      request: Request;
    }) => {
      const { id: userId } = await ensureAuthenticatedUser(user, request);
      return recurringService.deleteSeries({
        userId,
        eventId: params.id,
        deleteScope: query.deleteScope,
        occurrenceDate: query.occurrenceDate,
      });
    },
    {
      params: strictObject({
        id: t.String({ description: "Recurring event ID" }),
      }),
      query: strictObject({
        deleteScope: t.Union([
          t.Literal("this_only"),
          t.Literal("this_and_future"),
          t.Literal("all"),
        ]),
        occurrenceDate: t.Optional(
          t.String({ description: "ISO date of the specific occurrence" }),
        ),
      }),
      detail: {
        tags: ["Recurring"],
        summary: "Delete recurring event series",
        description:
          "Delete a recurring event with options for scope: single occurrence, this and future, or entire series",
        security: [{ bearerAuth: [] }],
      },
    },
  )

  .get(
    "/patterns",
    async () => {
      return recurringService.getCommonPatterns();
    },
    {
      detail: {
        tags: ["Recurring"],
        summary: "Get common recurrence patterns",
        description: "Returns pre-defined common recurrence patterns",
        security: [{ bearerAuth: [] }],
      },
    },
  );
