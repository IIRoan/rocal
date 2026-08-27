import { Elysia } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { prisma } from "../lib/prisma";
import { createStalwartAdminClient } from "../lib/stalwart-admin";
import { authenticatedRouteDetail } from "../lib/openapi";
import { MailSyncService } from "../services/mail-sync.service";
import { createStalwartCalendarClient } from "../lib/stalwart-calendar";
import { MailCalendarIngestionService } from "../services/mail-calendar-ingestion.service";
import { RouteModel, routeModels } from "../contracts";

export const defaultMailSyncService = new MailSyncService(
  prisma,
  createStalwartAdminClient(),
  new MailCalendarIngestionService(
    prisma,
    undefined,
    createStalwartCalendarClient(),
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
