import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../lib/auth-guard";
import { ensureAuthenticatedUser } from "../lib/auth-utils";
import { NotFoundError, ValidationError } from "../lib/errors";
import {
  buildIcsCalendar,
  type CalendarShareLinkResponse,
  type CreateCalendarShareLinkRequest,
  type DisableCalendarShareLinkResponse,
} from "@workspace/calendar-ics";
import { toIcsBuildEvent, toSafeIcsFilename } from "../lib/ics-export";

const SHARE_TOKEN_LENGTH = 40;
const SHARE_TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function resolveBackendBaseUrl(request: Request): string {
  const configuredBaseUrl = process.env.BACKEND_URL?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, "");
  }

  const requestUrl = new URL(request.url);
  return `${requestUrl.protocol}//${requestUrl.host}`;
}

function buildSharedCalendarUrl(token: string, request: Request): string {
  const baseUrl = resolveBackendBaseUrl(request);
  return `${baseUrl}/api/calendars/shared/${encodeURIComponent(token)}`;
}

function generateShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SHARE_TOKEN_LENGTH));
  return Array.from(bytes)
    .map((value) => SHARE_TOKEN_ALPHABET[value % SHARE_TOKEN_ALPHABET.length])
    .join("");
}

async function createUniqueShareToken(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = generateShareToken();
    const existing = await prisma.calendar.findFirst({
      where: { icsShareToken: token },
      select: { id: true },
    });

    if (!existing) {
      return token;
    }
  }

  throw new Error("Unable to generate a unique share token");
}

function serializeShareLinkResponse(
  calendar: {
    id: string;
    name: string;
    icsShareEnabled: boolean;
    icsShareToken: string | null;
  },
  request: Request,
): CalendarShareLinkResponse {
  const enabled = calendar.icsShareEnabled && !!calendar.icsShareToken;
  return {
    calendarId: calendar.id,
    calendarName: calendar.name,
    enabled,
    shareUrl:
      enabled && calendar.icsShareToken
        ? buildSharedCalendarUrl(calendar.icsShareToken, request)
        : null,
  };
}

export const calendarSharingRoutes = new Elysia({ prefix: "/calendars" })
  .get(
    "/shared/:token",
    async ({ params, set, request }: any) => {
      const token = (params?.token || "").trim().replace(/\.ics$/i, "");
      if (!token) {
        throw new NotFoundError("Shared calendar not found");
      }

      const calendar = await prisma.calendar.findFirst({
        where: {
          icsShareToken: token,
          icsShareEnabled: true,
        },
        include: {
          events: {
            where: {
              parentEventId: null,
            },
            orderBy: {
              start: "asc",
            },
          },
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      });

      if (!calendar) {
        throw new NotFoundError("Shared calendar not found");
      }

      const timezoneSource = calendar.events.find(
        (event) => !event.allDay && !!event.timezone,
      );

      const icsContent = buildIcsCalendar({
        calendar: {
          name: calendar.name,
          description: `Shared calendar from ${calendar.user.name || calendar.user.email}`,
          timezone: timezoneSource?.timezone || "UTC",
          sourceUrl: buildSharedCalendarUrl(token, request as Request),
        },
        events: calendar.events.map((event) => toIcsBuildEvent(event)),
      });

      set.headers["Content-Type"] = "text/calendar; charset=utf-8";
      set.headers["Content-Disposition"] =
        `inline; filename="${toSafeIcsFilename(calendar.name)}"`;
      // Always return fresh ICS content for subscriptions.
      set.headers["Cache-Control"] = "no-store, max-age=0";

      return icsContent;
    },
    {
      params: t.Object({
        token: t.String(),
      }),
      detail: {
        tags: ["ICS Sharing"],
        summary: "Public shared calendar feed (.ics)",
      },
    },
  )
  .use(requireAuth)
  .get(
    "/:id/share-link",
    async ({ params, user, request }: any) => {
      user = await ensureAuthenticatedUser(user, request as Request);
      const { id } = params as { id: string };

      const calendar = await prisma.calendar.findFirst({
        where: {
          id,
          userId: user.id,
        },
        select: {
          id: true,
          name: true,
          icsShareEnabled: true,
          icsShareToken: true,
        },
      });

      if (!calendar) {
        throw new ValidationError("Calendar not found or access denied");
      }

      return serializeShareLinkResponse(calendar, request as Request);
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        tags: ["ICS Sharing"],
        summary: "Get calendar ICS share-link status",
        security: [{ bearerAuth: [] }],
      },
    },
  )
  .post(
    "/:id/share-link",
    async ({ params, body, user, request }: any) => {
      user = await ensureAuthenticatedUser(user, request as Request);
      const { id } = params as { id: string };
      const { regenerate = false } =
        (body as CreateCalendarShareLinkRequest) || {};

      const calendar = await prisma.calendar.findFirst({
        where: {
          id,
          userId: user.id,
        },
        select: {
          id: true,
          name: true,
          icsShareToken: true,
        },
      });

      if (!calendar) {
        throw new ValidationError("Calendar not found or access denied");
      }

      let nextToken = calendar.icsShareToken;
      if (!nextToken || regenerate) {
        nextToken = await createUniqueShareToken();
      }

      const updatedCalendar = await prisma.calendar.update({
        where: {
          id: calendar.id,
        },
        data: {
          icsShareEnabled: true,
          icsShareToken: nextToken,
        },
        select: {
          id: true,
          name: true,
          icsShareEnabled: true,
          icsShareToken: true,
        },
      });

      return serializeShareLinkResponse(updatedCalendar, request as Request);
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Optional(
        t.Object({
          regenerate: t.Optional(t.Boolean()),
        }),
      ),
      detail: {
        tags: ["ICS Sharing"],
        summary: "Enable or regenerate calendar ICS share-link",
        security: [{ bearerAuth: [] }],
      },
    },
  )
  .delete(
    "/:id/share-link",
    async ({ params, user, request }: any) => {
      user = await ensureAuthenticatedUser(user, request as Request);
      const { id } = params as { id: string };

      const calendar = await prisma.calendar.findFirst({
        where: {
          id,
          userId: user.id,
        },
        select: {
          id: true,
        },
      });

      if (!calendar) {
        throw new ValidationError("Calendar not found or access denied");
      }

      await prisma.calendar.update({
        where: {
          id: calendar.id,
        },
        data: {
          icsShareEnabled: false,
          icsShareToken: null,
        },
      });

      const response: DisableCalendarShareLinkResponse = {
        success: true,
      };

      return response;
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        tags: ["ICS Sharing"],
        summary: "Disable calendar ICS share-link",
        security: [{ bearerAuth: [] }],
      },
    },
  );
