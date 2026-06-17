import { Elysia } from "elysia";

export function createMockRequireAuth(
  user: { id: string; email?: string | null; name?: string | null } = {
    id: "user-1",
    email: "user@example.com",
  },
) {
  return new Elysia({ name: "require-auth-test" }).derive(
    { as: "scoped" },
    () => ({
      routeUser: user,
    }),
  );
}
