import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { passkey } from "@better-auth/passkey";
import { oneTimeToken, openAPI } from "better-auth/plugins";
import { PrismaClient } from "../generated/prisma";
import { env, parseCsvEnv, toOrigin } from "./env";

const prisma = new PrismaClient();
export const BETTER_AUTH_BASE_PATH = "/api/auth";

const { backendUrl, frontendUrl, mobileAuthCallbackUrl, isProduction, cookieSameSite } = env;

const backendOrigin = toOrigin(backendUrl);
const frontendOrigin = toOrigin(frontendUrl);

const skipStateCookieCheck =
  process.env.AUTH_SKIP_STATE_COOKIE_CHECK === "true" ||
  (!isProduction && process.env.AUTH_SKIP_STATE_COOKIE_CHECK !== "false");

const trustedOrigins = Array.from(
  new Set([
    frontendUrl,
    frontendOrigin,
    backendOrigin,
    process.env.NEXT_PUBLIC_APP_URL || "",
    "http://localhost",
    "https://localhost",
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
    openAPI({
      disableDefaultReference: true,
    }),
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
  basePath: BETTER_AUTH_BASE_PATH,
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

type AuthOpenApiSchema = {
  components?: Record<string, unknown>;
  paths?: Record<string, Record<string, { tags?: string[] }>>;
};

let authOpenApiSchemaPromise: Promise<AuthOpenApiSchema> | null = null;

async function getGeneratedAuthOpenApiSchema(): Promise<AuthOpenApiSchema> {
  authOpenApiSchemaPromise ??= Promise.resolve(
    auth.api.generateOpenAPISchema(),
  ) as Promise<AuthOpenApiSchema>;

  return authOpenApiSchemaPromise;
}

export async function getAuthOpenApiDocumentation(
  prefix = BETTER_AUTH_BASE_PATH,
) {
  const normalizedPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  const schema = await getGeneratedAuthOpenApiSchema();
  const prefixedPaths: Record<string, Record<string, { tags?: string[] }>> = {};

  for (const [path, pathItem] of Object.entries(schema.paths ?? {})) {
    const operationPath = `${normalizedPrefix}${path}`;
    prefixedPaths[operationPath] = pathItem;

    for (const operation of Object.values(pathItem)) {
      operation.tags = ["Better Auth"];
    }
  }

  return {
    components: schema.components ?? {},
    paths: prefixedPaths,
  };
}
