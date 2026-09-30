import { describe, expect, it, jest } from "@jest/globals";
import { probeStalwartReachable } from "../../lib/stalwart-reachability";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

describe("probeStalwartReachable", () => {
  it("treats an unauthenticated 401 as reachable and sends no credentials", async () => {
    const fetcher = jest.fn<Fetcher>(async () => new Response(null, { status: 401 }));

    await expect(
      probeStalwartReachable({ baseUrl: "http://stalwart.test/", fetcher }),
    ).resolves.toEqual({ ok: true });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://stalwart.test/.well-known/jmap");
    expect(init.headers).toBeUndefined();
  });

  it("does not follow redirects", async () => {
    const fetcher = jest.fn<Fetcher>(
      async () => new Response(null, { status: 307, headers: { Location: "/jmap/session" } }),
    );

    await expect(
      probeStalwartReachable({ baseUrl: "http://stalwart.test", fetcher }),
    ).resolves.toEqual({ ok: true });
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
});
