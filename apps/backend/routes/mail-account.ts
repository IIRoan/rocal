import { Elysia } from "elysia";
import type { IMailService } from "../contracts/mail.contract";
import { requireAuth } from "../lib/auth-guard";
import { authenticatedRouteDetail } from "../lib/openapi";
import { RouteModel, routeModels } from "../contracts";
import { defaultMailService } from "./mail";

export function createMailAccountRoutes(
  mailService: IMailService = defaultMailService,
) {
  return new Elysia({
    prefix: "/mail/account",
    normalize: false,
  })
    .use(routeModels)
    .use(requireAuth)
    .guard(authenticatedRouteDetail("Mail"), (app) =>
      app
        .get(
          "/",
          async ({ routeUser }) => {
            return mailService.getMailboxStatusForUser({
              userId: routeUser.id,
              email: routeUser.email ?? "",
              displayName: routeUser.name ?? null,
            });
          },
          {
            detail: {
              summary: "Get the authenticated user's mailbox status",
              description:
                "Returns whether the current Solace account already has a linked mailbox and which address it uses.",
            },
          },
        )
        .post(
          "/bootstrap",
          async ({ routeUser, body }) => {
            return mailService.bootstrapForUser({
              userId: routeUser.id,
              email: routeUser.email ?? "",
              displayName: routeUser.name ?? null,
              ...body,
            });
          },
          {
            body: RouteModel.mail.bootstrapBody,
            detail: {
              summary:
                "Provision a mailbox for the authenticated Solace account",
              description:
                "Creates a mailbox for the current Solace user, registers the client-generated OpenPGP key, enables encryption at rest, and stores the encrypted vault backup metadata.",
            },
          },
        )
        .get(
          "/vault-backup",
          async ({ routeUser }) => {
            return mailService.getVaultBackupForUser({
              userId: routeUser.id,
              email: routeUser.email ?? "",
            });
          },
          {
            detail: {
              summary: "Fetch the authenticated user's encrypted vault backup",
              description:
                "Returns the encrypted private-key vault backup linked to the current Solace account.",
            },
          },
        )
        .put(
          "/vault-backup",
          async ({ routeUser, body }) => {
            return mailService.upsertVaultBackupForUser({
              userId: routeUser.id,
              email: routeUser.email ?? "",
              ...body,
            });
          },
          {
            body: RouteModel.mail.vaultBackupBody,
            detail: {
              summary: "Update the authenticated user's encrypted vault backup",
              description:
                "Stores ciphertext-only vault backup material for the current Solace account mailbox.",
            },
          },
        ),
    );
}

export const mailAccountRoutes = createMailAccountRoutes();
