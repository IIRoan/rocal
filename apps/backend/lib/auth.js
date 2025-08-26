import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { passkey } from "better-auth/plugins/passkey";
import { PrismaClient } from "../generated/prisma";
const prisma = new PrismaClient();
// Extract RP ID from NEXT_PUBLIC_APP_URL
const getPasskeyConfig = () => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const url = new URL(appUrl);
    return {
        rpID: url.hostname,
        origin: appUrl,
    };
};
const passkeyConfig = getPasskeyConfig();
export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    secret: process.env.BETTER_AUTH_SECRET || "default-dev-secret-change-in-production",
    socialProviders: process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
        ? {
            github: {
                clientId: process.env.GITHUB_CLIENT_ID,
                clientSecret: process.env.GITHUB_CLIENT_SECRET,
            },
        }
        : {},
    baseURL: process.env.NEXT_PUBLIC_APP_URL,
    basePath: "/api/auth",
    plugins: [
        nextCookies(),
        passkey({
            rpID: passkeyConfig.rpID,
            rpName: "Rocani",
            origin: passkeyConfig.origin,
        }),
    ],
});
