import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { probeStalwartReachable } from "../../lib/stalwart-reachability";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

describe("probeStalwartReachable", () => {
  afterEach(() => {
    delete process.env.STALWART_GATE_KEY;
  });

  it("GETs the session without credentials and treats 200 as reachable", async () => {
    const fetcher = jest.fn<Fetcher>(async () => new Response("{}", { status: 200 }));

    await expect(
      probeStalwartReachable({ baseUrl: "http://stalwart.test/", fetcher }),
    ).resolves.toEqual({ ok: true });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://stalwart.test/jmap/session");
    expect(init.method).toBe("GET");
    expect(init.redirect).toBe("manual");
    expect(init.headers).toBeUndefined();
  });

  it("treats an unauthenticated 401 as reachable", async () => {
    const fetcher = jest.fn<Fetcher>(async () => new Response(null, { status: 401 }));

    await expect(
      probeStalwartReachable({ baseUrl: "http://stalwart.test", fetcher }),
    ).resolves.toEqual({ ok: true });
  });

  it("fails on a gate 404 so a missing or wrong key is visible", async () => {
    const fetcher = jest.fn<Fetcher>(async () => new Response(null, { status: 404 }));

    await expect(
      probeStalwartReachable({ baseUrl: "http://stalwart.test", fetcher }),
    ).resolves.toEqual({ ok: false, status: 404 });
  });

  it("does not follow redirects", async () => {
    const fetcher = jest.fn<Fetcher>(
      async () => new Response(null, { status: 307, headers: { Location: "/jmap/session" } }),
    );

    await expect(
      probeStalwartReachable({ baseUrl: "http://stalwart.test", fetcher }),
    ).resolves.toEqual({ ok: false, status: 307 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fails on upstream 5xx", async () => {
    const fetcher = jest.fn<Fetcher>(async () => new Response(null, { status: 503 }));

    await expect(
      probeStalwartReachable({ baseUrl: "http://stalwart.test", fetcher }),
    ).resolves.toEqual({ ok: false, status: 503 });
  });

  it("fails when the connection errors", async () => {
    const fetcher = jest.fn<Fetcher>(async () => {
      throw new Error("connect ECONNREFUSED");
    });

    await expect(
      probeStalwartReachable({ baseUrl: "http://stalwart.test", fetcher }),
    ).resolves.toEqual({ ok: false, status: 0 });
  });

  it("sends the gate key to an https base", async () => {
    process.env.STALWART_GATE_KEY = "k".repeat(64);
    const fetcher = jest.fn<Fetcher>(async () => new Response("{}", { status: 200 }));

    await probeStalwartReachable({ baseUrl: "https://gate.test", fetcher });

    const [, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get("X-Solace-Gate")).toBe("k".repeat(64));
  });
});
