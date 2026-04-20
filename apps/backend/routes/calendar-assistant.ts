import { Elysia, t } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { prisma } from "../lib/prisma";
import { CalendarAssistantService } from "../services/calendar-assistant.service";
import { strictObject } from "../lib/validation";
import type { AuthenticatedUser } from "../lib/auth-utils";
import type { AssistantChatInput } from "../contracts/calendar-assistant.contract";
import { authenticatedRouteDetail } from "../lib/openapi";
import { resolveRouteUser } from "../lib/request-user";

const calendarAssistantService = new CalendarAssistantService(prisma);

const calendarAssistantBodySchema = strictObject({
  query: t.String({
    description:
      "Natural-language request for the assistant, such as creating, moving, deleting, or summarizing events.",
    examples: [
      "Move my design review to next Tuesday at 3pm",
      "What is on my calendar tomorrow morning?",
    ],
  }),
  timezone: t.Optional(
    t.String({
      description:
        "IANA timezone identifier used to interpret relative date phrases and render time-aware answers.",
      examples: ["America/New_York", "Europe/London"],
    }),
  ),
  now: t.Optional(
    t.String({
      description:
        "Current client-side date and time in ISO 8601 format. Supplying this makes relative expressions like 'tomorrow afternoon' deterministic.",
      examples: ["2025-01-15T13:30:00.000Z"],
    }),
  ),
  events: t.Optional(
    t.Array(
      strictObject({
        id: t.String({ description: "Event identifier." }),
        title: t.String({ description: "Event title." }),
        description: t.Optional(
          t.String({ description: "Optional event description." }),
        ),
        start: t.String({ description: "Event start timestamp in ISO 8601." }),
        end: t.String({ description: "Event end timestamp in ISO 8601." }),
        allDay: t.Optional(
          t.Boolean({ description: "Whether the event spans the full day." }),
        ),
        location: t.Optional(
          t.String({ description: "Optional event location." }),
        ),
        calendarId: t.String({
          description: "Owning calendar identifier.",
        }),
      }),
      {
        description:
          "Optional client-provided event context that the assistant can use for faster or more grounded reasoning.",
      },
    ),
  ),
});

export const calendarAssistantRoute = new Elysia({
  prefix: "/calendar-assistant",
  normalize: false,
})
  .use(requireAuth)
  .guard(authenticatedRouteDetail("Calendar Assistant"), (app) =>
    app.post(
      "/",
      async ({
        body,
        request,
        set,
        authenticatedUser,
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
        authenticatedUser?: AuthenticatedUser;
      }) => {
        try {
          const user = await resolveRouteUser(authenticatedUser, request);
          const cookies = request.headers.get("cookie") || "";

          const result = await calendarAssistantService.chat({
            userId: user.id,
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
          summary: "Chat with the AI calendar assistant",
          description:
            "Sends a natural-language calendar request to the assistant. Depending on the prompt, the assistant may answer questions, propose changes, or create, update, and delete events on behalf of the authenticated user.",
        },
      },
    ),
  );
