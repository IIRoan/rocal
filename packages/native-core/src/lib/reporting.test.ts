import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.unmock("./reporting");

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { appVariant: "preview" },
    },
  },
}));

const DSN =
  "https://65f1ae513c4a4865bc3b3384ce746653@errors.solace.onl/solace";

describe("reporting", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = DSN;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    jest.resetModules();
  });

  it("builds a sentry-compatible envelope", async () => {
    const { buildErrexEnvelope } = await import("./reporting");
    const { getErrexReportingOptions } = await import("./errex-dsn");
    const options = getErrexReportingOptions(DSN);
    expect(options).not.toBeNull();

    const envelope = buildErrexEnvelope(
      {
        exception: {
          values: [{ type: "Error", value: "test" }],
        },
      },
      options!,
    );

    const lines = envelope.split("\n");
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0])).toMatchObject({ event_id: expect.any(String) });
    expect(JSON.parse(lines[1])).toEqual({
      type: "event",
      length: lines[2].length,
    });
    expect(JSON.parse(lines[2])).toMatchObject({
      platform: "javascript",
      environment: "preview",
      exception: { values: [{ type: "Error", value: "test" }] },
    });
  });

  it("posts captureException to the errex tunnel", async () => {
    const fetchMock = jest.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => new Response("", { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const { captureException, flushReporting } = await import("./reporting");
    captureException(new Error("unit test error"), {
      tags: { area: "reporting-test" },
    });
    await flushReporting();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://errors.solace.onl/api/solace/envelope/?sentry_key=65f1ae513c4a4865bc3b3384ce746653",
    );
    expect(init?.headers).toMatchObject({
      "Content-Type": "application/x-sentry-envelope",
    });
    expect(String(init?.body)).toContain("unit test error");
    expect(String(init?.body)).toContain("reporting-test");
  });

  it("scrubs PII from exception messages and tags before sending", async () => {
    const fetchMock = jest.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => new Response("", { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const { captureException, captureMessage, flushReporting } = await import(
      "./reporting"
    );
    captureException(
      new Error(
        "sync failed for alice@example.com Bearer abc.def.ghi https://api.solace.onl/x?token=secret",
      ),
      { tags: { title: "Dentist appointment", area: "sync" } },
    );
    captureMessage("draft for bob@example.com", {
      tags: { subject: "Quarterly salary" },
    });
    await flushReporting();

    const bodies = fetchMock.mock.calls.map(([, init]) => String(init?.body));
    expect(bodies).toHaveLength(2);
    const sent = bodies.join("\n");
    for (const secret of [
      "alice@example.com",
      "bob@example.com",
      "abc.def.ghi",
      "token=secret",
      "Dentist appointment",
      "Quarterly salary",
    ]) {
      expect(sent).not.toContain(secret);
    }
    expect(sent).toContain("sync failed for [email] Bearer [redacted] [url]");
    expect(sent).toContain('"area":"sync"');
  });

  it("no-ops when the DSN is unset", async () => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    const fetchMock = jest.fn(async () => new Response("", { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const { captureException, flushReporting } = await import("./reporting");
    captureException(new Error("ignored"));
    await flushReporting();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
