export type AuthenticatedUser = {
  id: string;
  email?: string | null;
  name?: string | null;
} & Record<string, unknown>;

export function hasUserId(user: unknown): user is AuthenticatedUser {
  return !!user && typeof user === "object" && "id" in user;
}
