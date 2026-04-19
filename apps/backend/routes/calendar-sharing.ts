import { Elysia, t } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { ensureAuthenticatedUser } from "../lib/auth-utils";
import { strictObject } from "../lib/validation";
import { prisma } from "../lib/prisma";
import { CalendarSharingService } from "../services/calendar-sharing.service";
import { toSafeIcsFilename } from "../lib/ics-export";

const calendarSharingService = new CalendarSharingService(prisma);

function resolveBackendBaseUrl(request: Request): string {
  const configuredBaseUrl = process.env.BACKEND_URL?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, "");
  }

  const requestUrl = new URL(request.url);
  return `${requestUrl.protocol}//${requestUrl.host}`;
}

export const calendarSharingRoutes = new Elysia({
  prefix: "/calendars",
  normalize: false,
})
  .get(
    "/shared/:token",
    async ({ params, set, request }: any) => {
      const baseUrl = resolveBackendBaseUrl(request);
      const sourceUrl = `${baseUrl}/api/calendars/shared/${encodeURIComponent(params.token)}`;

      const result = await calendarSharingService.getSharedCalendarIcs(
        params.token,
        sourceUrl,
      );

      set.headers["Content-Type"] = "text/calendar; charset=utf-8";
      set.headers["Content-Disposition"] =
        `inline; filename="${toSafeIcsFilename(result.calendarName)}"`;
      set.headers["Cache-Control"] = "no-store, max-age=0";

      return result.icsContent;
    },
    {
      params: strictObject({ token: t.String() }),
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
      const { id: userId } = await ensureAuthenticatedUser(user, request);
      const baseUrl = resolveBackendBaseUrl(request);
      return calendarSharingService.getShareLink({
        userId,
        calendarId: params.id,
        baseUrl,
      });
    },
    {
      params: strictObject({ id: t.String() }),
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
      const { id: userId } = await ensureAuthenticatedUser(user, request);
      const baseUrl = resolveBackendBaseUrl(request);
      return calendarSharingService.createShareLink({
        userId,
        calendarId: params.id,
        baseUrl,
        regenerate: body?.regenerate,
      });
    },
    {
      params: strictObject({ id: t.String() }),
      body: t.Optional(
        strictObject({
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
      const { id: userId } = await ensureAuthenticatedUser(user, request);
      const baseUrl = resolveBackendBaseUrl(request);
      return calendarSharingService.disableShareLink({
        userId,
        calendarId: params.id,
        baseUrl,
      });
    },
    {
      params: strictObject({ id: t.String() }),
      detail: {
        tags: ["ICS Sharing"],
        summary: "Disable calendar ICS share-link",
        security: [{ bearerAuth: [] }],
      },
    },
  );
