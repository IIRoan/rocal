import { afterEach, expect, it, jest } from "@jest/globals";
import { HttpClient } from "../http-client";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});
it.each(["response", "network"])(
  "checks the request's epoch again before retrying a %s failure",
  async (failure) => {
    let generation = 1;
    const captured = generation;
    jest.spyOn(Math, "random").mockReturnValue(0);
    const fetch = jest.fn(async () => {
      generation += 1;
      if (failure === "network") throw new TypeError("SYNTHETIC network error");
      return Response.json(
        { message: "SYNTHETIC retryable", statusCode: 503 },
        { status: 503 },
      );
    });
    globalThis.fetch = fetch;
    const client = new HttpClient({
      baseURL: "https://api.solace.test",
      retries: 2,
      retryDelay: 0,
    });
    await expect(
      client.get("/api/mail/trust", {
        isCurrent: () => generation === captured,
      }),
    ).rejects.toThrow("session changed");
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
it("allows current-session requests without sending the guard function to fetch", async () => {
  const fetch = jest.fn(
    async (_url: RequestInfo | URL, _options?: RequestInit) =>
      Response.json({ encryptedTrust: null }),
  );
  globalThis.fetch = fetch;
  const client = new HttpClient({ baseURL: "https://api.solace.test" });
  await expect(
    client.get("/api/mail/trust", { retries: 0, isCurrent: () => true }),
  ).resolves.toEqual({ encryptedTrust: null });
  expect(fetch.mock.calls[0]?.[1]).not.toHaveProperty("isCurrent");
});

it("keeps ordinary retries available while the captured request scope is current", async () => {
  jest.spyOn(Math, "random").mockReturnValue(0);
  let calls = 0;
  const fetch = jest.fn(async () =>
    ++calls === 1
      ? Response.json({ statusCode: 503 }, { status: 503 })
      : Response.json({ encryptedTrust: null }),
  );
  globalThis.fetch = fetch;
  const http = new HttpClient({
    baseURL: "https://api.solace.test",
    retryDelay: 0,
    retries: 1,
  });
  await expect(
    http.get("/api/mail/trust", { isCurrent: () => true }),
  ).resolves.toEqual({ encryptedTrust: null });
  expect(fetch).toHaveBeenCalledTimes(2);
});
