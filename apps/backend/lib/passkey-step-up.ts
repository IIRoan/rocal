import type { PrismaClient } from "../generated/prisma/index.js";
import { env } from "./env";

export const PASSKEY_STEP_UP_COOKIE_NAME = "solace-passkey-step-up";
const PASSKEY_STEP_UP_COOKIE_VALUE = "verified";

type PasskeyStepUpCookieAttributes = ReturnType<
  typeof getPasskeyStepUpCookieAttributes
>;

type PasskeyStepUpCookieTarget =
  | {
      setCookie: (
        name: string,
        value: string,
        options?: Record<string, unknown>,
      ) => void;
    }
  | {
      headers: Headers;
    };

function normalizeCookieSameSite(
  value: string | undefined,
): "lax" | "strict" | "none" {
  switch ((value ?? "").toLowerCase()) {
    case "strict":
      return "strict";
    case "none":
      return "none";
    default:
      return "lax";
  }
}

function getCookieDomain(baseUrl: string): string | undefined {
  try {
    const hostname = new URL(baseUrl).hostname;
    if (!hostname || hostname === "localhost") {
      return undefined;
    }

    const parts = hostname.split(".");
    return parts.length >= 2 ? parts.slice(-2).join(".") : undefined;
  } catch {
    return undefined;
  }
}

export function getPasskeyStepUpCookieAttributes() {
  return {
    httpOnly: true,
    path: "/",
    sameSite: normalizeCookieSameSite(env.cookieSameSite),
    secure: env.isProduction,
    maxAge: 60 * 60 * 24 * 30,
    ...(env.isProduction
      ? {
          domain: getCookieDomain(env.backendUrl),
        }
      : {}),
  };
}

function serializeCookie(
  name: string,
  value: string,
  attributes: PasskeyStepUpCookieAttributes,
): string {
  const serialized = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${attributes.path}`,
    `Max-Age=${attributes.maxAge}`,
    `SameSite=${attributes.sameSite}`,
  ];

  if (attributes.httpOnly) {
    serialized.push("HttpOnly");
  }

  if (attributes.secure) {
    serialized.push("Secure");
  }

  if ("domain" in attributes && attributes.domain) {
    serialized.push(`Domain=${attributes.domain}`);
  }

  return serialized.join("; ");
}

function writeCookie(
  target: PasskeyStepUpCookieTarget,
  name: string,
  value: string,
  attributes: PasskeyStepUpCookieAttributes,
) {
  if ("setCookie" in target && typeof target.setCookie === "function") {
    target.setCookie(name, value, attributes);
    return;
  }

  if ("headers" in target) {
    target.headers.append(
      "set-cookie",
      serializeCookie(name, value, attributes),
    );
  }
}

export function setVerifiedPasskeyStepUpCookie(
  target: PasskeyStepUpCookieTarget,
) {
  writeCookie(
    target,
    PASSKEY_STEP_UP_COOKIE_NAME,
    PASSKEY_STEP_UP_COOKIE_VALUE,
    getPasskeyStepUpCookieAttributes(),
  );
}

export function clearPasskeyStepUpCookie(target: PasskeyStepUpCookieTarget) {
  writeCookie(target, PASSKEY_STEP_UP_COOKIE_NAME, "", {
    ...getPasskeyStepUpCookieAttributes(),
    maxAge: 0,
  });
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separatorIndex = entry.indexOf("=");
        if (separatorIndex <= 0) {
          return [entry, ""];
        }

        return [
          entry.slice(0, separatorIndex),
          decodeURIComponent(entry.slice(separatorIndex + 1)),
        ];
      }),
  );
}

export function hasVerifiedPasskeyStepUp(request: Request): boolean {
  const cookies = parseCookies(request.headers.get("cookie"));
  return cookies[PASSKEY_STEP_UP_COOKIE_NAME] === PASSKEY_STEP_UP_COOKIE_VALUE;
}

export async function getPasskeyStepUpStatus(input: {
  prisma: PrismaClient;
  request: Request;
  userId: string;
}) {
  const passkeyCount = await input.prisma.passkey.count({
    where: { userId: input.userId },
  });
  const hasPasskeys = passkeyCount > 0;
  const verified = hasVerifiedPasskeyStepUp(input.request);

  return {
    hasPasskeys,
    isPasskeyStepUpVerified: verified,
    requiresPasskeyStepUp: hasPasskeys && !verified,
  };
}
