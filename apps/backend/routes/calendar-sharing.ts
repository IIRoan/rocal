import { Elysia, t } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import type { AuthenticatedUser } from "../lib/auth-utils";
import { authenticatedRouteDetail } from "../lib/openapi";
import { resolveRouteUser } from "../lib/request-user";
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
    async ({
      params,
      set,
      request,
    }: {
      params: { token: string };
      set: { headers: Record<string, string | number | undefined> };
      request: Request;
    }) => {
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
  .guard(authenticatedRouteDetail("ICS Sharing"), (app) =>
    app
      .get(
        "/:id/share-link",
        async ({
          params,
          request,
          authenticatedUser,
        }: {
          params: { id: string };
          request: Request;
          authenticatedUser?: AuthenticatedUser;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          const baseUrl = resolveBackendBaseUrl(request);
          return calendarSharingService.getShareLink({
            userId: user.id,
            calendarId: params.id,
            baseUrl,
          });
        },
        {
          params: strictObject({ id: t.String() }),
          detail: {
            summary: "Get calendar ICS share-link status",
          },
        },
      )
      .post(
        "/:id/share-link",
        async ({
          params,
          body,
          request,
          authenticatedUser,
        }: {
          params: { id: string };
          body?: { regenerate?: boolean };
          request: Request;
          authenticatedUser?: AuthenticatedUser;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          const baseUrl = resolveBackendBaseUrl(request);
          return calendarSharingService.createShareLink({
            userId: user.id,
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
            summary: "Enable or regenerate calendar ICS share-link",
          },
        },
      )
      .delete(
        "/:id/share-link",
        async ({
          params,
          request,
          authenticatedUser,
        }: {
          params: { id: string };
          request: Request;
          authenticatedUser?: AuthenticatedUser;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          const baseUrl = resolveBackendBaseUrl(request);
          return calendarSharingService.disableShareLink({
            userId: user.id,
            calendarId: params.id,
            baseUrl,
          });
        },
        {
          params: strictObject({ id: t.String() }),
          detail: {
            summary: "Disable calendar ICS share-link",
          },
        },
      ),
  );
