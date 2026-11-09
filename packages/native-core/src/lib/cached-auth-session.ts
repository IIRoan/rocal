import { z } from "@workspace/calendar-core/zod";
import type { authClient } from "./auth-client";

const cachedDate = z.union([z.iso.datetime(), z.date()]).transform((value) =>
  typeof value === "string" ? new Date(value) : value,
);

// Plain objects drop additive response metadata so a server update cannot invalidate an installed app's cache.
const cachedSessionSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    name: z.string(),
    email: z.email(),
    emailVerified: z.boolean(),
    image: z.string().nullable().optional(),
    createdAt: cachedDate,
    updatedAt: cachedDate,
  }),
  session: z.object({
    id: z.string().min(1),
    userId: z.string().min(1),
    token: z.string().regex(/^\S+$/),
    expiresAt: cachedDate,
    createdAt: cachedDate,
    updatedAt: cachedDate,
    ipAddress: z.null().optional(),
    userAgent: z.null().optional(),
  }),
});

function matchesSessionCookie(cookie: string, token: string): boolean {
  const cookies = cookie.split(";").map((entry) => entry.trim()).filter((entry) =>
    entry.startsWith("better-auth.session_token=") ||
    entry.startsWith("__Secure-better-auth.session_token="),
  );
  return cookies.length > 0 && cookies.every((entry) => {
    try {
      const value = decodeURIComponent(entry.slice(entry.indexOf("=") + 1));
      const separator = value.lastIndexOf(".");
      return value === token || (
        separator > 0 && separator < value.length - 1 && value.slice(0, separator) === token
      );
    } catch {
      return false;
    }
  });
}

/** Only an unexpired session whose owner and stored cookie match can open the encrypted offline copy. */
export function parseCachedAuthSession(value: unknown, cookie: string): typeof authClient.$Infer.Session | null {
  const parsed = cachedSessionSchema.safeParse(value);
  if (!parsed.success) return null;
  const { session, user } = parsed.data;
  if (session.expiresAt.getTime() <= Date.now() || session.userId !== user.id) return null;
  if (!matchesSessionCookie(cookie, session.token)) return null;
  return parsed.data;
}
