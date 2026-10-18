import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Elysia } from "elysia";

jest.mock("../../lib/auth", () => ({
  auth: {
    handler: jest.fn(async (request: Request) => {
      const url = new URL(request.url);
      const body = request.method === "POST" ? await request.text() : "";
      return new Response(
        JSON.stringify({
          pathname: url.pathname,
          method: request.method,
          body,
        }),
        { headers: { "content-type": "application/json" } },
      );
    }),
    api: {
      getSession: jest.fn(async () => null),
    },
  },
}));

import { auth } from "../../lib/auth";
import { createBetterAuthPlugin } from "../../lib/better-auth-plugin";

const mockHandler = jest.mocked(auth.handler);

function createApp() {
  return new Elysia({ prefix: "/api", normalize: false }).use(
    createBetterAuthPlugin("/auth"),
  );
}

describe("createBetterAuthPlugin", () => {
  beforeEach(() => {
    mockHandler.mockClear();
  });

  it("forwards /api/auth to Better Auth with the original request", async () => {
    const response = await createApp().handle(
      new Request("http://localhost/api/auth", { method: "GET" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      pathname: "/api/auth",
      method: "GET",
    });
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  it("forwards nested Better Auth paths and POST bodies", async () => {
    const response = await createApp().handle(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      pathname: "/api/auth/sign-in/email",
      method: "POST",
      body: JSON.stringify({ email: "user@example.com" }),
    });
  });
});
