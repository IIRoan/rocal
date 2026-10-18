import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { withStalwartGate } from "../../lib/stalwart-gate";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

const KEY = "a".repeat(64);
const GATE = "https://gate.test";

function sentHeaders(fetcher: jest.Mock<Fetcher>): Headers {
  const [, init] = fetcher.mock.calls[0] as [string, RequestInit | undefined];
  return new Headers(init?.headers);
}

describe("withStalwartGate", () => {
  afterEach(() => {
    delete process.env.STALWART_GATE_KEY;
  });

  it("adds the key to https requests and keeps existing headers", async () => {
    process.env.STALWART_GATE_KEY = KEY;
    const fetcher = jest.fn<Fetcher>(async () => new Response(null));

    await withStalwartGate(fetcher, GATE)("https://gate.test/jmap/", {
      method: "POST",
      headers: { Authorization: "Bearer user" },
    });

    const headers = sentHeaders(fetcher);
    expect(headers.get("X-Solace-Gate")).toBe(KEY);
    expect(headers.get("Authorization")).toBe("Bearer user");
    expect((fetcher.mock.calls[0] as [string, RequestInit])[1].method).toBe("POST");
  });

  it("replaces a caller-supplied gate header with the server key", async () => {
    process.env.STALWART_GATE_KEY = KEY;
    const fetcher = jest.fn<Fetcher>(async () => new Response(null));

    await withStalwartGate(fetcher, GATE)("https://gate.test/jmap/", {
      headers: { "X-Solace-Gate": "forged" },
    });

    expect(sentHeaders(fetcher).get("X-Solace-Gate")).toBe(KEY);
  });

  it("passes requests through untouched when no key is configured", async () => {
    const fetcher = jest.fn<Fetcher>(async () => new Response(null));
    const init: RequestInit = { method: "GET" };

    await withStalwartGate(fetcher, GATE)("https://gate.test/jmap/session", init);

    expect(fetcher).toHaveBeenCalledWith("https://gate.test/jmap/session", init);
  });

  it("only sends the key to a configured Stalwart origin", async () => {
    process.env.STALWART_GATE_KEY = KEY;
    const fetcher = jest.fn<Fetcher>(async () => new Response(null));

    await withStalwartGate(fetcher, GATE)("https://mail.solace.onl/jmap/session");
    await withStalwartGate(fetcher, GATE)("https://gate.test.evil.example/jmap/session");

    expect(fetcher.mock.calls.every(([, init]) => !new Headers(init?.headers).has("X-Solace-Gate"))).toBe(true);
  });

  it("never sends the key over plain http", async () => {
    process.env.STALWART_GATE_KEY = KEY;
    const fetcher = jest.fn<Fetcher>(async () => new Response(null));

    await withStalwartGate(fetcher, "http://stalwart.test")("http://stalwart.test/jmap/session");

    expect(sentHeaders(fetcher).has("X-Solace-Gate")).toBe(false);
  });
});
