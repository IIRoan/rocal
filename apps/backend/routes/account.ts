import { Elysia } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { authenticatedRouteDetail } from "../lib/openapi";
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
      async ({ routeUser }) => {
        return accountService.deleteAccount({ userId: routeUser.id });
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
