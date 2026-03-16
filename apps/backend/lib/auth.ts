import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { passkey } from "@better-auth/passkey";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

const backendUrl = process.env.BACKEND_URL || "http://localhost:3001";
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
const isProduction = process.env.NODE_ENV === "production";

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
  plugins: [
    passkey({
      rpID: getRpId(frontendUrl),
      rpName: "Rocani",
      origin: frontendUrl,
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
  trustedOrigins: [frontendUrl],
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  advanced: {
    useSecureCookies: isProduction,
    cookieOptions: {
      sameSite: "lax",
      secure: isProduction,
      httpOnly: true,
      domain: isProduction ? getRpId(backendUrl) : undefined,
    },
  },
  socialProviderConfig: {
    redirectURL: frontendUrl,
  },
}) as any;
