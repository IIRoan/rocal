import { Elysia } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { prisma } from "../lib/prisma";
import { createStalwartUserJmapClient } from "../lib/stalwart-user-jmap";
import { defaultMailService } from "../lib/default-mail-service";
import { authenticatedRouteDetail } from "../lib/openapi";
import { MailSyncService } from "../services/mail-sync.service";
import { MailCalendarIngestionService } from "../services/mail-calendar-ingestion.service";
import { RouteModel, routeModels } from "../contracts";

export const defaultMailSyncService = new MailSyncService(
  prisma,
  createStalwartUserJmapClient({ tokens: defaultMailService }),
  new MailCalendarIngestionService(
    prisma,
    undefined
  ),
);

export function createMailSyncRoutes(
  mailSyncService: MailSyncService = defaultMailSyncService,
) {
  return new Elysia({
    prefix: "/mail",
    normalize: false,
  })
    .use(routeModels)
    .use(requireAuth)
    .guard(authenticatedRouteDetail("Mail"), (app) =>
      app.get("/sync", {
        query: RouteModel.mail.syncQuery,
        detail: {
          summary: "Synchronize mail changes for an authorized account",
          description:
            "Runs JMAP changes for Email, Mailbox, and Thread using server-side Stalwart credentials and returns normalized deltas for the authenticated user's mailbox.",
        },
      }, async ({ routeUser, query }) =>
        mailSyncService.syncForUser({
          userId: routeUser.id,
          accountId: query.accountId,
        })),
    );
}

export const mailSyncRoutes = createMailSyncRoutes();
