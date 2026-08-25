import { createAuthEndpoint } from "@better-auth/core/api";
import { sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { User } from "better-auth";
import { createLogger } from "@workspace/logger";
import { errorLogDetails } from "./log-sanitization";
import { setVerifiedPasskeyStepUpCookie } from "./passkey-step-up";
import {
  PASSKEY_BRIDGE_COMPLETE_STEP_UP_PATH,
  PASSKEY_BRIDGE_FRESHEN_PATH,
  isFreshSessionRecord,
  parsePasskeyBridgeSession,
} from "./passkey-bridge-session-helpers";

export {
  PASSKEY_BRIDGE_COMPLETE_STEP_UP_PATH,
  PASSKEY_BRIDGE_FRESHEN_PATH,
  parsePasskeyBridgeSession,
} from "./passkey-bridge-session-helpers";

const logger = createLogger("backend:auth-passkey-bridge");

export const passkeyBridgeFreshSessionPlugin = {
  id: "passkey-bridge-fresh-session",
  endpoints: {
    freshenPasskeyBridgeSession: createAuthEndpoint(
      PASSKEY_BRIDGE_FRESHEN_PATH,
      {
        method: "POST",
        requireHeaders: true,
        use: [sessionMiddleware],
      },
      async (ctx) => {
        const current = parsePasskeyBridgeSession(ctx.context.session);
        if (!current) {
          throw ctx.error("UNAUTHORIZED", {
            message: "Unauthorized",
          });
        }

        try {
          const freshSession = await ctx.context.internalAdapter.createSession(
            current.user.id,
          );
          if (!isFreshSessionRecord(freshSession)) {
            throw new Error("Fresh session was not created.");
          }

          await setSessionCookie(ctx, {
            session: freshSession,
            user: current.user as User,
          });
        } catch (error) {
          logger.error(
            "Unable to mint a fresh session for passkey bridge register",
            errorLogDetails(error),
          );
          throw ctx.error("INTERNAL_SERVER_ERROR", {
            message: "Unable to prepare passkey setup.",
          });
        }

        return ctx.json({ ok: true as const });
      },
    ),
    completePasskeyBridgeStepUp: createAuthEndpoint(
      PASSKEY_BRIDGE_COMPLETE_STEP_UP_PATH,
      {
        method: "POST",
        requireHeaders: true,
        use: [sessionMiddleware],
      },
      async (ctx) => {
        const current = parsePasskeyBridgeSession(ctx.context.session);
        if (!current) {
          throw ctx.error("UNAUTHORIZED", {
            message: "Unauthorized",
          });
        }

        setVerifiedPasskeyStepUpCookie({
          setCookie: (name, value, options) => {
            ctx.setCookie(name, value, options);
          },
        });

        return ctx.json({ ok: true as const });
      },
    ),
  },
};
