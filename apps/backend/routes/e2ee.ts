import { Elysia, t } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import type { AuthenticatedUser } from "../lib/auth-utils";
import { authenticatedRouteDetail } from "../lib/openapi";
import { resolveRouteUser } from "../lib/request-user";
import { prisma } from "../lib/prisma";
import { strictObject } from "../lib/validation";
import { E2eeService } from "../services/e2ee.service";

const e2eeService = new E2eeService(prisma);

const deviceBodySchema = strictObject({
  deviceId: t.String({
    minLength: 1,
    maxLength: 128,
    description: "Stable client-generated device identifier.",
  }),
  deviceLabel: t.Optional(
    t.String({
      maxLength: 120,
      description:
        "Human-readable device label shown during future key transfer flows.",
    }),
  ),
  publicKey: t.String({
    minLength: 1,
    maxLength: 32768,
    description: "Client wrapping public key encoded as base64url SPKI.",
  }),
  publicKeyAlgorithm: t.Optional(
    t.String({
      maxLength: 64,
      description: "Wrapping public key algorithm identifier.",
    }),
  ),
  wrappedAccountKey: t.String({
    minLength: 1,
    maxLength: 32768,
    description:
      "Client-generated account content key wrapped to the device public key.",
  }),
  wrappedSearchKey: t.String({
    minLength: 1,
    maxLength: 32768,
    description:
      "Client-generated blind-index key wrapped to the device public key.",
  }),
  wrapAlgorithm: t.Optional(
    t.String({
      maxLength: 64,
      description:
        "Wrapping algorithm identifier used for wrappedAccountKey and wrappedSearchKey.",
    }),
  ),
  keyVersion: t.Optional(
    t.Number({
      minimum: 1,
      maximum: 1000,
      description: "Client-managed key version for future rotation support.",
    }),
  ),
});

const passwordBodySchema = strictObject({
  kdfAlgorithm: t.Optional(
    t.String({
      maxLength: 64,
      description: "Client-side password KDF identifier.",
    }),
  ),
  kdfSalt: t.String({
    minLength: 1,
    maxLength: 512,
    description: "Client-generated salt for password key derivation.",
  }),
  kdfIterations: t.Optional(
    t.Number({
      minimum: 100000,
      maximum: 5000000,
      description: "PBKDF2 iteration count used for password key derivation.",
    }),
  ),
  wrappedAccountKey: t.String({
    minLength: 1,
    maxLength: 32768,
    description: "Password-wrapped account content key.",
  }),
  wrappedSearchKey: t.String({
    minLength: 1,
    maxLength: 32768,
    description: "Password-wrapped blind-index key.",
  }),
  wrapAlgorithm: t.Optional(
    t.String({
      maxLength: 64,
      description: "Password wrapping algorithm identifier.",
    }),
  ),
  keyVersion: t.Optional(
    t.Number({
      minimum: 1,
      maximum: 1000,
      description: "Client-managed key version for future rotation support.",
    }),
  ),
});

export const e2eeRoutes = new Elysia({
  prefix: "/e2ee",
  normalize: false,
})
  .use(requireAuth)
  .guard(authenticatedRouteDetail("E2EE"), (app) =>
    app
      .get(
        "/bootstrap",
        async ({
          authenticatedUser,
          request,
        }: {
          authenticatedUser?: AuthenticatedUser;
          request: Request;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          return e2eeService.getBootstrap(user.id);
        },
        {
          detail: {
            summary: "Get client encryption bootstrap state",
            description:
              "Returns device bootstrap records and current calendar shadow-write metadata for the authenticated user.",
          },
        },
      )
      .get(
        "/reset-snapshot",
        async ({
          authenticatedUser,
          request,
        }: {
          authenticatedUser?: AuthenticatedUser;
          request: Request;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          return e2eeService.getResetSnapshot(user.id);
        },
        {
          detail: {
            summary: "Get raw encrypted records for password reset",
            description:
              "Returns raw calendars, categories, and events so the client can refresh hybrid shadows before storing a new password envelope.",
          },
        },
      )
      .put(
        "/device",
        async ({
          body,
          authenticatedUser,
          request,
        }: {
          body: {
            deviceId: string;
            deviceLabel?: string;
            publicKey: string;
            publicKeyAlgorithm?: string;
            wrappedAccountKey: string;
            wrappedSearchKey: string;
            wrapAlgorithm?: string;
            keyVersion?: number;
          };
          authenticatedUser?: AuthenticatedUser;
          request: Request;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          return e2eeService.upsertDevice({
            userId: user.id,
            ...body,
          });
        },
        {
          body: deviceBodySchema,
          detail: {
            summary: "Register or refresh a client encryption device",
            description:
              "Stores a client-owned wrapping public key and wrapped shadow-write keys for the authenticated device.",
          },
        },
      )
      .put(
        "/password",
        async ({
          body,
          authenticatedUser,
          request,
        }: {
          body: {
            kdfAlgorithm?: string;
            kdfSalt: string;
            kdfIterations?: number;
            wrappedAccountKey: string;
            wrappedSearchKey: string;
            wrapAlgorithm?: string;
            keyVersion?: number;
          };
          authenticatedUser?: AuthenticatedUser;
          request: Request;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          return e2eeService.upsertPasswordEnvelope({
            userId: user.id,
            ...body,
          });
        },
        {
          body: passwordBodySchema,
          detail: {
            summary: "Register or rotate a password-wrapped E2EE envelope",
            description:
              "Stores password-derived wrapping metadata and wrapped shadow-write keys for cross-device unlock.",
          },
        },
      ),
  );
