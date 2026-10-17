import { Elysia } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { authenticatedRouteDetail } from "../lib/openapi";
import { prisma } from "../lib/prisma";
import { CalendarSharingService } from "../services/calendar-sharing.service";
import { toSafeIcsFilename } from "../lib/ics-export";
import { RouteModel, routeModels } from "../contracts";

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
  .use(routeModels)
  .get("/shared/:token", {
    params: RouteModel.calendar.shareTokenParams,
    detail: {
      tags: ["ICS Sharing"],
      summary: "Public shared calendar feed (.ics)",
      description:
        "Returns a token-protected read-only ICS feed that can be subscribed to by external calendar clients such as Apple Calendar, Google Calendar, or Outlook.",
    },
  }, async ({ params, set, request }) => {
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
  })
  .use(requireAuth)
  .guard(authenticatedRouteDetail("ICS Sharing"), (app) =>
    app
      .get("/:id/share-link", {
        params: RouteModel.calendar.idParams,
        detail: {
          summary: "Get calendar ICS share-link status",
          description:
            "Returns the current share-link state for a calendar, including whether sharing is enabled and the public URL when one exists.",
        },
      }, async ({ params, request, routeUser }) => {
        const baseUrl = resolveBackendBaseUrl(request);
        return calendarSharingService.getShareLink({
          userId: routeUser.id,
          calendarId: params.id,
          baseUrl,
        });
      })
      .post("/:id/share-link", {
        params: RouteModel.calendar.idParams,
        body: RouteModel.calendar.shareLinkBody,
        detail: {
          summary: "Enable or regenerate calendar ICS share-link",
          description:
            "Creates a new public ICS URL or rotates the existing token for an already shared calendar.",
        },
      }, async ({ params, body, request, routeUser }) => {
        const baseUrl = resolveBackendBaseUrl(request);
        return calendarSharingService.createShareLink({
          userId: routeUser.id,
          calendarId: params.id,
          baseUrl,
          regenerate: body.regenerate,
        });
      })
      .delete("/:id/share-link", {
        parse: "none",
        params: RouteModel.calendar.idParams,
        detail: {
          summary: "Disable calendar ICS share-link",
          description:
            "Revokes the public ICS URL for the calendar. Existing external subscribers will stop receiving updates once the link is disabled.",
        },
      }, async ({ params, request, routeUser }) => {
        const baseUrl = resolveBackendBaseUrl(request);
        return calendarSharingService.disableShareLink({
          userId: routeUser.id,
          calendarId: params.id,
          baseUrl,
        });
      }),
  );
