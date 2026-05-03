import { createRuntimeOriginPolicy } from "@workspace/runtime";
import { env, parseCsvEnv } from "./env";

function buildMobileTrustedOriginVariants(url?: string | null): string[] {
  const trimmed = url?.trim();

  if (!trimmed) {
    return [];
  }

  const variants = new Set<string>([trimmed.replace(/\/+$/, "")]);

  try {
    const parsed = new URL(trimmed);
    const root = `${parsed.protocol}//`;
    variants.add(root);

    if (parsed.hostname) {
      let current = `${parsed.protocol}//${parsed.hostname}`;
      variants.add(current);

      const segments = parsed.pathname.split("/").filter(Boolean);
      for (const segment of segments) {
        current = `${current}/${segment}`;
        variants.add(current);
      }
    }
  } catch {
    return [...variants];
  }

  return [...variants];
}

const baseOriginPolicy = createRuntimeOriginPolicy({
  backendUrl: env.backendUrl,
  frontendUrl: env.frontendUrl,
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "",
  isProduction: env.isProduction,
  trustedOrigins: [
    "http://localhost",
    "https://localhost",
    ...parseCsvEnv(process.env.TRUSTED_ORIGINS),
  ],
});

const mobileTrustedOrigins = Array.from(
  new Set(
    [
      env.mobileAuthCallbackUrl,
      process.env.NEXT_PUBLIC_MOBILE_AUTH_CALLBACK_URL,
      "solace://api/auth",
      "app.solace.onl://api/auth",
    ].flatMap((value) => buildMobileTrustedOriginVariants(value)),
  ),
);

export const corsOriginPolicy = baseOriginPolicy;

export function getAuthTrustedOrigins(request?: Request): string[] {
  return Array.from(
    new Set([
      ...baseOriginPolicy.getTrustedOrigins(request),
      ...mobileTrustedOrigins,
    ]),
  );
}
