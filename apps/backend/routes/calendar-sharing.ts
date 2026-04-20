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
      params: strictObject({
        token: t.String({
          description: "Share token embedded in the public ICS URL.",
        }),
      }),
      detail: {
        tags: ["ICS Sharing"],
        summary: "Public shared calendar feed (.ics)",
        description:
          "Returns a token-protected read-only ICS feed that can be subscribed to by external calendar clients such as Apple Calendar, Google Calendar, or Outlook.",
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
          params: strictObject({
            id: t.String({
              description: "Calendar identifier.",
            }),
          }),
          detail: {
            summary: "Get calendar ICS share-link status",
            description:
              "Returns the current share-link state for a calendar, including whether sharing is enabled and the public URL when one exists.",
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
          body: { regenerate?: boolean } | null;
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
          params: strictObject({
            id: t.String({
              description: "Calendar identifier.",
            }),
          }),
          body: t.Optional(
            strictObject({
              regenerate: t.Optional(
                t.Boolean({
                  description:
                    "When true, rotates the share token and invalidates any previously issued public URL.",
                }),
              ),
            }),
          ),
          detail: {
            summary: "Enable or regenerate calendar ICS share-link",
            description:
              "Creates a new public ICS URL or rotates the existing token for an already shared calendar.",
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
          params: strictObject({
            id: t.String({
              description: "Calendar identifier.",
            }),
          }),
          detail: {
            summary: "Disable calendar ICS share-link",
            description:
              "Revokes the public ICS URL for the calendar. Existing external subscribers will stop receiving updates once the link is disabled.",
          },
        },
      ),
  );
