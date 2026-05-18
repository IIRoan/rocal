import { Elysia, t } from "elysia";
import { auth } from "../lib/auth";
import { env } from "../lib/env";
import { getPasskeyStepUpStatus } from "../lib/passkey-step-up";
import { prisma } from "../lib/prisma";
import { strictObject } from "../lib/validation";
import { AccountService } from "../services/account.service";
import { inviteService } from "../lib/invite-service";

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
  .get("/signup-config", () => accountService.getSignupConfig(), {
    detail: {
      tags: ["Account"],
      summary: "Get public Solace sign-up configuration",
      description:
        "Returns the Solace email domain used when new password accounts choose their in-app email address.",
    },
  })
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
  )
  .get(
    "/auth-status",
    async ({ request, set }) => {
      set.headers["Cache-Control"] = "no-store, max-age=0";
      const session = await auth.api.getSession({
        headers: request.headers as Headers,
      });

      if (!session?.user?.id) {
        return {
          authenticated: false,
          hasPasskeys: false,
          requiresPasskeyStepUp: false,
        };
      }

      const stepUpStatus = await getPasskeyStepUpStatus({
        prisma,
        request,
        userId: session.user.id,
      });

      return {
        authenticated: true,
        hasPasskeys: stepUpStatus.hasPasskeys,
        requiresPasskeyStepUp: stepUpStatus.requiresPasskeyStepUp,
      };
    },
    {
      detail: {
        tags: ["Account"],
        summary: "Get current authentication status",
        description:
          "Returns whether the current session is authenticated and whether a registered passkey still needs to complete the required second-factor step-up.",
      },
    },
  )
  .get(
    "/invite/validate",
    async ({ query }) =>
      inviteService.validateInviteToken({ token: query.token }),
    {
      query: strictObject({
        token: t.String({ minLength: 1, maxLength: 500 }),
      }),
      detail: {
        tags: ["Account"],
        summary: "Validate an invite token",
        description: "Check whether an invite token is valid before sign-up.",
      },
    },
  )
  .post(
    "/invite/claim",
    async ({ body }) =>
      inviteService.claimInviteToken({
        token: body.token,
        chosenEmail: body.chosenEmail,
      }),
    {
      body: strictObject({
        token: t.String({ minLength: 1, maxLength: 500 }),
        chosenEmail: t.String({ minLength: 1, maxLength: 320 }),
      }),
      detail: {
        tags: ["Account"],
        summary: "Claim an invite token",
        description:
          "Link an invite token to the chosen Solace email. Must be called within 15 minutes of sign-up.",
      },
    },
  );
