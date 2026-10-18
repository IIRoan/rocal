export type AuthenticatedUser = {
  id: string;
  email?: string | null;
  name?: string | null;
} & Record<string, unknown>;

export function hasUserId(user: unknown): user is AuthenticatedUser {
  return !!user && typeof user === "object" && "id" in user;
}

/** Sessions never persist the client IP or user agent; the IP only keys rate limits in memory. */
export function stripSessionClientMetadata<T extends object>(
  session: T,
): T & { ipAddress: null; userAgent: null } {
  return { ...session, ipAddress: null, userAgent: null };
}
