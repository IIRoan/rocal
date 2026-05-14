import { Elysia, t } from "elysia";
import type { AuthenticatedUser } from "../lib/auth-utils";
import type { IMailService } from "../contracts/mail.contract";
import { requireAuth } from "../lib/auth-guard";
import { authenticatedRouteDetail } from "../lib/openapi";
import { resolveRouteUser } from "../lib/request-user";
import { strictObject } from "../lib/validation";
import { defaultMailService } from "./mail";

const kdfParamsSchema = strictObject({
  saltB64: t.String({
    minLength: 1,
    maxLength: 512,
  }),
  memoryKiB: t.Number({
    minimum: 8192,
    maximum: 1048576,
  }),
  iterations: t.Number({
    minimum: 1,
    maximum: 16,
  }),
  parallelism: t.Number({
    minimum: 1,
    maximum: 32,
  }),
});

const bootstrapBodySchema = strictObject({
  publicKeyArmored: t.String({
    minLength: 1,
    maxLength: 131072,
  }),
  fingerprint: t.String({
    minLength: 16,
    maxLength: 128,
  }),
  algorithm: t.String({
    minLength: 1,
    maxLength: 32,
  }),
  createdAt: t.String({
    minLength: 1,
    maxLength: 64,
  }),
  vaultVersion: t.Number({
    minimum: 1,
    maximum: 10,
  }),
  encryptedVaultB64: t.String({
    minLength: 1,
    maxLength: 500000,
  }),
  kdf: t.String({
    minLength: 1,
    maxLength: 32,
  }),
  kdfParams: kdfParamsSchema,
});

const vaultBackupBodySchema = strictObject({
  vaultVersion: t.Number({
    minimum: 1,
    maximum: 10,
  }),
  encryptedVaultB64: t.String({
    minLength: 1,
    maxLength: 500000,
  }),
  kdf: t.String({
    minLength: 1,
    maxLength: 32,
  }),
  kdfParams: kdfParamsSchema,
});

export function createMailAccountRoutes(
  mailService: IMailService = defaultMailService,
) {
  return new Elysia({
    prefix: "/mail/account",
    normalize: false,
  })
    .use(requireAuth)
    .guard(authenticatedRouteDetail("Mail"), (app) =>
      app
        .get(
          "/",
          async ({
            authenticatedUser,
            request,
          }: {
            authenticatedUser?: AuthenticatedUser;
            request: Request;
          }) => {
            const user = await resolveRouteUser(authenticatedUser, request);

            return mailService.getMailboxStatusForUser({
              userId: user.id,
              email: user.email ?? "",
              displayName: user.name ?? null,
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
          async ({
            authenticatedUser,
            body,
            request,
          }: {
            authenticatedUser?: AuthenticatedUser;
            body: typeof bootstrapBodySchema.static;
            request: Request;
          }) => {
            const user = await resolveRouteUser(authenticatedUser, request);

            return mailService.bootstrapForUser({
              userId: user.id,
              email: user.email ?? "",
              displayName: user.name ?? null,
              ...body,
            });
          },
          {
            body: bootstrapBodySchema,
            detail: {
              summary: "Provision a mailbox for the authenticated Solace account",
              description:
                "Creates a mailbox for the current Solace user, registers the client-generated OpenPGP key, enables encryption at rest, and stores the encrypted vault backup metadata.",
            },
          },
        )
        .get(
          "/vault-backup",
          async ({
            authenticatedUser,
            request,
          }: {
            authenticatedUser?: AuthenticatedUser;
            request: Request;
          }) => {
            const user = await resolveRouteUser(authenticatedUser, request);

            return mailService.getVaultBackupForUser({
              userId: user.id,
              email: user.email ?? "",
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
          async ({
            authenticatedUser,
            body,
            request,
          }: {
            authenticatedUser?: AuthenticatedUser;
            body: typeof vaultBackupBodySchema.static;
            request: Request;
          }) => {
            const user = await resolveRouteUser(authenticatedUser, request);

            return mailService.upsertVaultBackupForUser({
              userId: user.id,
              email: user.email ?? "",
              ...body,
            });
          },
          {
            body: vaultBackupBodySchema,
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