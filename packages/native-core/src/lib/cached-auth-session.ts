import { z } from "@workspace/calendar-core/zod";
import type { authClient } from "./auth-client";

const cachedDate = z.union([z.iso.datetime(), z.date()]).transform((value) =>
  typeof value === "string" ? new Date(value) : value,
);

const cachedSessionSchema = z.strictObject({
  user: z.strictObject({
    id: z.string().min(1),
    name: z.string(),
    email: z.email(),
    emailVerified: z.boolean(),
    image: z.string().nullable().optional(),
    createdAt: cachedDate,
    updatedAt: cachedDate,
  }),
  session: z.strictObject({
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

function pickCachedFields(value: unknown, fields: string[]): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const selected: Record<string, unknown> = {};
  for (const field of fields) selected[field] = candidate[field];
  return selected;
}

/** Only a complete, unexpired session belonging to its cached user can open the encrypted offline copy. */
export function parseCachedAuthSession(value: unknown): typeof authClient.$Infer.Session | null {
  const candidate = pickCachedFields(value, Object.keys(cachedSessionSchema.shape));
  if (!candidate) return null;
  // Ignore additive response metadata so a server update cannot invalidate an installed app's cache.
  const parsed = cachedSessionSchema.safeParse({
    user: pickCachedFields(candidate.user, Object.keys(cachedSessionSchema.shape.user.shape)),
    session: pickCachedFields(candidate.session, Object.keys(cachedSessionSchema.shape.session.shape)),
  });
  if (!parsed.success) return null;
  const { session, user } = parsed.data;
  if (session.expiresAt.getTime() <= Date.now() || session.userId !== user.id) return null;
  return parsed.data;
}
