/* eslint-disable @typescript-eslint/no-explicit-any */
import { Elysia } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { prisma } from "../lib/prisma";
import { CalendarAssistantService } from "../services/calendar-assistant.service";

const calendarAssistantService = new CalendarAssistantService(prisma);

export const calendarAssistantRoute = new Elysia({
  prefix: "/calendar-assistant",
  normalize: false,
})
  .use(requireAuth)
  .post("/", async ({ body, request, set, user }: any) => {
    try {
      if (!user?.id || typeof user.id !== "string") {
        set.status = 401;
        return { error: "Unauthorized" };
      }

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
    } catch (error: any) {
      const reply = error?.message?.includes("parse")
        ? "I had trouble understanding that calendar request. Try rephrasing it with a clearer date or time."
        : "Something went wrong while handling that calendar request.";

      set.status = 400;
      return {
        reply,
        createdEvent: null,
        updatedEvent: null,
        deletedEventId: null,
        events: [],
        error: error?.message || "Unknown error",
      };
    }
  });
