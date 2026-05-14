import { Elysia, t } from "elysia";
import type { AuthenticatedUser } from "../lib/auth-utils";
import { requireAuth } from "../lib/auth-guard";
import { prisma } from "../lib/prisma";
import { createStalwartAdminClient } from "../lib/stalwart-admin";
import { authenticatedRouteDetail } from "../lib/openapi";
import { resolveRouteUser } from "../lib/request-user";
import { strictObject } from "../lib/validation";
import { MailSyncService } from "../services/mail-sync.service";

export const defaultMailSyncService = new MailSyncService(
  prisma,
  createStalwartAdminClient(),
);

const syncQuerySchema = strictObject({
  accountId: t.String({
    minLength: 1,
    maxLength: 128,
  }),
});

export function createMailSyncRoutes(
  mailSyncService: MailSyncService = defaultMailSyncService,
) {
  return new Elysia({
    prefix: "/mail",
    normalize: false,
  })
    .use(requireAuth)
    .guard(authenticatedRouteDetail("Mail"), (app) =>
      app.get(
        "/sync",
        async ({
          authenticatedUser,
          query,
          request,
        }: {
          authenticatedUser?: AuthenticatedUser;
          query: typeof syncQuerySchema.static;
          request: Request;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);

          return mailSyncService.syncForUser({
            userId: user.id,
            accountId: query.accountId,
          });
        },
        {
          query: syncQuerySchema,
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
