import { Elysia } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { prisma } from "../lib/prisma";
import { createStalwartAdminClient } from "../lib/stalwart-admin";
import { authenticatedRouteDetail } from "../lib/openapi";
import { MailSyncService } from "../services/mail-sync.service";
import type { MailSyncResult } from "../services/mail-sync.service";
import { createStalwartCalendarClient } from "../lib/stalwart-calendar";
import { MailCalendarIngestionService } from "../services/mail-calendar-ingestion.service";
import { RouteModel, routeModels } from "../contracts";
import { enqueueInboundMailPush } from "../lib/mail-push-enqueue";

export const defaultMailSyncService = new MailSyncService(
  prisma,
  createStalwartAdminClient(),
  new MailCalendarIngestionService(
    prisma,
    undefined,
    createStalwartCalendarClient(),
  ),
);

type InboundMailPushHandler = (input: {
  accountId: string;
  userId: string;
  sync: MailSyncResult;
}) => Promise<void>;

export function createMailSyncRoutes(
  mailSyncService: MailSyncService = defaultMailSyncService,
  onInboundMail: InboundMailPushHandler = async (input) => {
    await enqueueInboundMailPush(prisma, input);
  },
) {
  return new Elysia({
    prefix: "/mail",
    normalize: false,
  })
    .use(routeModels)
    .use(requireAuth)
    .guard(authenticatedRouteDetail("Mail"), (app) =>
      app.get(
        "/sync",
        async ({ routeUser, query }) => {
          const sync = await mailSyncService.syncForUser({
            userId: routeUser.id,
            accountId: query.accountId,
          });
          await onInboundMail({
            accountId: sync.accountId,
            userId: routeUser.id,
            sync,
          });
          return sync;
        },
        {
          query: RouteModel.mail.syncQuery,
          detail: {
            summary: "Synchronize mail changes for an authorized account",
            description:
              "Runs JMAP changes for Email, Mailbox, and Thread using server-side Stalwart credentials and returns normalized deltas for the authenticated user's mailbox.",
          },
        },
      ),
    );
}

export const mailSyncRoutes = createMailSyncRoutes();
