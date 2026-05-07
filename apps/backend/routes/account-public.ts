import { Elysia, t } from "elysia";
import { env } from "../lib/env";
import { prisma } from "../lib/prisma";
import { strictObject } from "../lib/validation";
import { AccountService } from "../services/account.service";

const accountService = new AccountService(prisma, {
  defaultEmailDomain: env.stalwartDefaultDomain,
});

const emailAvailabilityQuerySchema = strictObject({
  email: t.String({
    minLength: 1,
    maxLength: 320,
  }),
});

export const accountPublicRoutes = new Elysia({
  prefix: "/account",
  normalize: false,
})
  .get(
    "/signup-config",
    () => accountService.getSignupConfig(),
    {
      detail: {
        tags: ["Account"],
        summary: "Get public Solace sign-up configuration",
        description:
          "Returns the Solace email domain used when new password accounts choose their in-app email address.",
      },
    },
  )
  .get(
    "/email-availability",
    async ({ query }) => accountService.checkEmailAvailability(query),
    {
      query: emailAvailabilityQuerySchema,
      detail: {
        tags: ["Account"],
        summary: "Check whether a Solace email address can be used for sign-up",
        description:
          "Validates the chosen Solace email handle or full in-app address, normalizes it to the configured domain, and checks whether it is already reserved by an existing Solace account or linked mailbox.",
      },
    },
  );