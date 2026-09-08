import { Elysia } from "elysia";
import { auth } from "../lib/auth";
import { env } from "../lib/env";
import { RateLimitError } from "../lib/errors";
import { getPasskeyStepUpStatus } from "../lib/passkey-step-up";
import { enforceRateLimit, getClientIp } from "../lib/rate-limit";
import { prisma } from "../lib/prisma";
import { AccountService } from "../services/account.service";
import { inviteService } from "../lib/invite-service";
import { RouteModel, routeModels } from "../contracts";

const accountService = new AccountService(prisma, {
  defaultEmailDomain: env.stalwartDefaultDomain,
});

const INVITE_PUBLIC_RATE_LIMIT = { requests: 30, windowMs: 60_000 };

function enforceInvitePublicRateLimit(request: Request, action: string) {
  enforceRateLimit({
    storeId: "account-invite-public",
    key: `${action}:${getClientIp(request)}`,
    limit: INVITE_PUBLIC_RATE_LIMIT,
  });
}

export const accountPublicRoutes = new Elysia({
  prefix: "/account",
  normalize: false,
})
  .use(routeModels)
  .get("/signup-config", {
    detail: {
      tags: ["Account"],
      summary: "Get public Solace sign-up configuration",
      description:
        "Returns the Solace email domain used when new password accounts choose their in-app email address.",
    },
  }, () => accountService.getSignupConfig())
  .get("/email-availability", {
    query: RouteModel.account.emailAvailabilityQuery,
    detail: {
      tags: ["Account"],
      summary: "Check whether a Solace email address can be used for sign-up",
      description:
        "Validates the chosen Solace email handle or full in-app address, normalizes it to the configured domain, and checks whether it is already reserved by an existing Solace account or linked mailbox.",
    },
  }, async ({ query }) => accountService.checkEmailAvailability(query))
  .get("/auth-status", {
    detail: {
      tags: ["Account"],
      summary: "Get current authentication status",
      description:
        "Returns whether the current session is authenticated and whether a registered passkey still needs to complete the required second-factor step-up.",
    },
  }, async ({ request, set }) => {
    set.headers["Cache-Control"] = "no-store, max-age=0";
    const session = await auth.api.getSession({
      headers: request.headers as Headers,
      query: { disableCookieCache: true },
    });
  
    if (!session?.user?.id) {
      return {
        authenticated: false,
        hasPasskeys: false,
        requiresPasskeyStepUp: false,
      };
    }

    const sessionId =
      typeof session.session?.id === "string" ? session.session.id : "";
  
    const stepUpStatus = await getPasskeyStepUpStatus({
      prisma,
      request,
      userId: session.user.id,
      sessionId,
    });
  
    return {
      authenticated: true,
      hasPasskeys: stepUpStatus.hasPasskeys,
      requiresPasskeyStepUp: stepUpStatus.requiresPasskeyStepUp,
    };
  })
  .get("/invite/validate", {
    query: RouteModel.invite.tokenQuery,
    detail: {
      tags: ["Account"],
      summary: "Validate an invite token",
      description: "Check whether an invite token is valid before sign-up.",
    },
  }, async ({ query, request, set }) => {
    try {
      enforceInvitePublicRateLimit(request, "validate");
    } catch (error) {
      if (error instanceof RateLimitError) {
        set.status = 429;
        return { valid: false, reason: error.message };
      }
      throw error;
    }
    return inviteService.validateInviteToken({ token: query.token });
  })
  .post("/invite/claim", {
    body: RouteModel.invite.claimBody,
    detail: {
      tags: ["Account"],
      summary: "Claim an invite token",
      description:
        "Link an invite token to the chosen Solace email. Must be called within 15 minutes of sign-up.",
    },
  }, async ({ body, request, set }) => {
    try {
      enforceInvitePublicRateLimit(request, "claim");
    } catch (error) {
      if (error instanceof RateLimitError) {
        set.status = 429;
        return { success: false, reason: error.message };
      }
      throw error;
    }
    return inviteService.claimInviteToken({
      token: body.token,
      chosenEmail: body.chosenEmail,
    });
  });
