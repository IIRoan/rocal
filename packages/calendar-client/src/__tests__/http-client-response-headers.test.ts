import { afterEach, expect, it, jest } from "@jest/globals";
import { HttpClient } from "../http-client";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

it("delivers renewal headers with the request's session before returning data", async () => {
  const headers = new Headers({
    "set-cookie": "session_token=fixture; Max-Age=1209600",
  });
  globalThis.fetch = jest.fn(async () =>
    Response.json({ ok: true }, { headers }),
  );
  const persisted: string[] = [];
  const client = new HttpClient({
    baseURL: "https://fixture.test",
    getHeaders: () => ({ cookie: "session_token=fixture" }),
    onResponseHeaders: async (received, sent) => {
      persisted.push(
        received.get("set-cookie") ?? "",
        sent.get("cookie") ?? "",
      );
    },
  });
  await expect(client.get("/status")).resolves.toEqual({ ok: true });
  expect(persisted).toEqual([
    headers.get("set-cookie"),
    "session_token=fixture",
  ]);
});

it("delivers revoked-session cookie clears before reporting an authentication error", async () => {
  const clearingCookie = "session_token=; Max-Age=0; HttpOnly";
  globalThis.fetch = jest.fn(async () => Response.json(
    { error: "Unauthorized", message: "Authentication required", statusCode: 401 },
    { status: 401, headers: { "set-cookie": clearingCookie } },
  ));
  const events: string[] = [];
  const client = new HttpClient({
    baseURL: "https://fixture.test",
    getHeaders: () => ({ cookie: "session_token=fixture" }),
    onResponseHeaders(received, sent) {
      expect(sent.get("cookie")).toBe("session_token=fixture");
      events.push(received.get("set-cookie") ?? "");
    },
    onAuthError() { events.push("auth-error"); },
  });
  await expect(client.get("/protected", { retries: 0 })).rejects.toMatchObject({ statusCode: 401 });
  expect(events).toEqual([clearingCookie, "auth-error"]);
});
