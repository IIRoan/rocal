import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { passkey } from "@better-auth/passkey";
import { oneTimeToken } from "better-auth/plugins";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

const backendUrl = process.env.BACKEND_URL || "http://localhost:3001";
const frontendUrl =
  process.env.FRONTEND_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3000";
const mobileAuthCallbackUrl =
  process.env.MOBILE_AUTH_CALLBACK_URL ||
  process.env.NEXT_PUBLIC_MOBILE_AUTH_CALLBACK_URL ||
  "app.solace.onl://api/auth";
const isProduction = process.env.NODE_ENV === "production";
const skipStateCookieCheck =
  process.env.AUTH_SKIP_STATE_COOKIE_CHECK === "true" ||
  (!isProduction && process.env.AUTH_SKIP_STATE_COOKIE_CHECK !== "false");

const parseCsvEnv = (value?: string) => {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const trustedOrigins = Array.from(
  new Set([
    frontendUrl,
    process.env.NEXT_PUBLIC_APP_URL || "",
    "capacitor://localhost",
    "http://localhost",
    "https://localhost",
    "http://localhost:3000",
    "https://localhost:3000",
    "http://127.0.0.1:3000",
    "https://127.0.0.1:3000",
    mobileAuthCallbackUrl,
    "app.solace.onl://api",
    "app.solace.onl://api/auth",
    "app.solace.onl://",
    ...parseCsvEnv(process.env.TRUSTED_ORIGINS),
  ]),
).filter(Boolean);

const passkeyOrigin =
  process.env.PASSKEY_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || frontendUrl;

const socialRedirectUrl =
  process.env.AUTH_REDIRECT_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  frontendUrl;

const cookieSameSite = (process.env.AUTH_COOKIE_SAME_SITE || "lax") as
  | "lax"
  | "strict"
  | "none";

// Extract root domain for rpID (e.g., "cal.roan.dev" -> "roan.dev")
const getRpId = (url: string) => {
  try {
    const hostname = new URL(url).hostname;
    if (hostname === "localhost") return "localhost";
    const parts = hostname.split(".");
    // Get root domain (last two parts: roan.dev)
    return parts.slice(-2).join(".");
  } catch {
    return "localhost";
  }
};

export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    passkey({
      rpID: getRpId(passkeyOrigin),
      rpName: "Rocani",
      origin: passkeyOrigin,
    }),
    oneTimeToken({
      expiresIn: 3,
      storeToken: "hashed",
    }),
  ],
  user: {
    additionalFields: {
      hasAiAccess: {
        type: "boolean",
        required: false,
        defaultValue: false,
      },
    },
  },
  account: {
    // Mobile OAuth often starts in the webview and finishes in the system browser.
    // In local/dev this can split state cookies across contexts.
    skipStateCookieCheck,
  },
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret:
    process.env.BETTER_AUTH_SECRET || "default-dev-secret-change-in-production",
  socialProviders:
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
          },
        }
      : {},
  baseURL: backendUrl,
  basePath: "/api/auth",
  trustedOrigins,
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  advanced: {
    useSecureCookies: isProduction,
    cookieOptions: {
      sameSite: cookieSameSite,
      secure: isProduction,
      httpOnly: true,
      domain: isProduction ? getRpId(backendUrl) : undefined,
    },
    // Cross subdomain cookie sharing for mobile OAuth flow
    crossSubDomainCookies: {
      enabled: true,
    },
  },
  socialProviderConfig: {
    redirectURL: socialRedirectUrl,
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;
