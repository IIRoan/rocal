import { Elysia } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import type { AuthenticatedUser } from "../lib/auth-utils";
import { authenticatedRouteDetail } from "../lib/openapi";
import { resolveRouteUser } from "../lib/request-user";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { AccountService } from "../services/account.service";
import { defaultMailService } from "./mail";

const accountService = new AccountService(
  prisma,
  {
    defaultEmailDomain: env.stalwartDefaultDomain,
  },
  defaultMailService,
);

export const accountRoutes = new Elysia({
  prefix: "/account",
  normalize: false,
})
  .use(requireAuth)
  .guard(authenticatedRouteDetail("Account"), (app) =>
    app.delete(
      "/",
      async ({
        authenticatedUser,
        request,
      }: {
        authenticatedUser?: AuthenticatedUser;
        request: Request;
      }) => {
        const user = await resolveRouteUser(authenticatedUser, request);
        return accountService.deleteAccount({ userId: user.id });
      },
      {
        detail: {
          summary: "Delete the authenticated account",
          description:
            "Deletes the authenticated user account, linked Stalwart mailbox, and all related calendar/auth data.",
        },
      },
    ),
  );
