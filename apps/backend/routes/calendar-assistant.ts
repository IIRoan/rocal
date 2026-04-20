import { Elysia, t } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { prisma } from "../lib/prisma";
import { CalendarAssistantService } from "../services/calendar-assistant.service";
import { strictObject } from "../lib/validation";
import { ensureAuthenticatedUser } from "../lib/auth-utils";
import type { AssistantChatInput } from "../contracts/calendar-assistant.contract";

const calendarAssistantService = new CalendarAssistantService(prisma);

const calendarAssistantBodySchema = strictObject({
  query: t.String({ description: "User query for the calendar assistant" }),
  timezone: t.Optional(t.String({ description: "IANA timezone identifier" })),
  now: t.Optional(t.String({ description: "Current date/time in ISO 8601" })),
  events: t.Optional(
    t.Array(
      strictObject({
        id: t.String(),
        title: t.String(),
        description: t.Optional(t.String()),
        start: t.String(),
        end: t.String(),
        allDay: t.Optional(t.Boolean()),
        location: t.Optional(t.String()),
        calendarId: t.String(),
      }),
    ),
  ),
});

export const calendarAssistantRoute = new Elysia({
  prefix: "/calendar-assistant",
  normalize: false,
})
  .use(requireAuth)
  .post(
    "/",
    async ({
      body,
      request,
      set,
      user,
    }: {
      body: {
        query: string;
        timezone?: string;
        now?: string;
        events?: AssistantChatInput["events"];
      };
      request: Request;
      set: {
        status?: number | string;
        headers: Record<string, string | number | undefined>;
      };
      user?: { id?: string } | null;
    }) => {
      try {
        const authenticatedUser = await ensureAuthenticatedUser(user, request);

        const cookies = request.headers.get("cookie") || "";

        const result = await calendarAssistantService.chat({
          userId: authenticatedUser.id,
          query: body.query,
          timezone: body.timezone,
          now: body.now,
          events: body.events,
          cookies,
          request,
        });

        if (result.error && !result.reply) {
          set.status = 400;
        }

        return result;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "";
        const reply = message.includes("parse")
          ? "I had trouble understanding that calendar request. Try rephrasing it with a clearer date or time."
          : "Something went wrong while handling that calendar request.";

        set.status = 400;
        return {
          reply,
          createdEvent: null,
          updatedEvent: null,
          deletedEventId: null,
          events: [],
          error: message || "Unknown error",
        };
      }
    },
    {
      body: calendarAssistantBodySchema,
      detail: {
        tags: ["Calendar Assistant"],
        summary: "Chat with the AI calendar assistant",
        security: [{ bearerAuth: [] }],
      },
    },
  );
