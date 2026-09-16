import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";

import {
  createValidatingLookup,
  parseSafeFetchUrl,
  safeFetch,
  SafeFetchError,
  type SafeFetchOptions,
  type SafeFetchResolver,
} from "../../lib/safe-fetch";
import { isPrivateNetworkHost } from "../../lib/ssrf-host-policy";

// Only 127.0.0.1 (the test server) is treated as public, so the real private-address paths stay exercised.
const TEST_PUBLIC_ADDRESS = "127.0.0.1";
const isBlockedAddress = (address: string) =>
  address !== TEST_PUBLIC_ADDRESS && isPrivateNetworkHost(address);

const requests: string[] = [];
let server: http.Server;
let port = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    requests.push(`${req.headers.host}${req.url}`);
    const url = req.url ?? "/";
    if (url === "/ok") {
      res.writeHead(200, { "content-type": "text/calendar" });
      res.end("BEGIN:VCALENDAR");
    } else if (url === "/gzip") {
      res.writeHead(200, { "content-encoding": "gzip" });
      res.end(gzipSync("x".repeat(4096)));
    } else if (url === "/big") {
      res.writeHead(200);
      res.end("x".repeat(4096));
    } else if (url === "/slow") {
      setTimeout(() => res.end("late"), 500);
    } else if (url === "/loop") {
      res.writeHead(302, { location: "/loop" });
      res.end();
    } else if (url.startsWith("/redirect?to=")) {
      res.writeHead(302, {
        location: decodeURIComponent(url.slice("/redirect?to=".length)),
      });
      res.end();
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((resolve) =>
    server.listen(0, TEST_PUBLIC_ADDRESS, resolve),
  );
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function options(
  resolve: SafeFetchResolver,
  overrides: Partial<SafeFetchOptions> = {},
): SafeFetchOptions {
  return {
    timeoutMs: 2_000,
    maxBytes: 1024,
    maxRedirects: 3,
    resolve,
    isBlockedAddress,
    ...overrides,
  };
}

const publicResolver: SafeFetchResolver = async () => [
  { address: TEST_PUBLIC_ADDRESS, family: 4 },
];

describe("parseSafeFetchUrl", () => {
  it("rejects non-http schemes and credentials", () => {
    expect(() => parseSafeFetchUrl("file:///etc/passwd")).toThrow("unsupported-scheme");
    expect(() => parseSafeFetchUrl("gopher://example.com/")).toThrow("unsupported-scheme");
    expect(() => parseSafeFetchUrl("https://user:pw@example.com/")).toThrow("invalid-url");
  });

  it("maps webcal to https", () => {
    expect(parseSafeFetchUrl("webcal://example.com/cal.ics").href).toBe(
      "https://example.com/cal.ics",
    );
  });

  it.each([
    "http://127.0.0.1/",
    "http://2130706433/",
    "http://0x7f.1/",
    "http://0177.0.0.1/",
    "http://[::ffff:169.254.169.254]/",
    "http://169.254.169.254/latest/meta-data",
    "http://[fd00::1]/",
    "http://[64:ff9b::a00:1]/",
    "http://localhost/",
    "http://metadata.google.internal/",
  ])("blocks private literal %s before connecting", (url) => {
    expect(() => parseSafeFetchUrl(url)).toThrow("private-network-host");
  });
});

describe("createValidatingLookup", () => {
  it("validates every resolution, so a rebinding answer is rejected", async () => {
    const answers = ["93.184.216.34", "10.0.0.5"];
    const lookup = createValidatingLookup(
      async () => [{ address: answers.shift() ?? "", family: 4 }],
      isPrivateNetworkHost,
    );
    const run = () =>
      new Promise<{ error: Error | null; address: string }>((resolve) =>
        lookup("rebind.test", {}, (error, address) =>
          resolve({ error, address: String(address) }),
        ),
      );

    await expect(run()).resolves.toEqual({ error: null, address: "93.184.216.34" });
    const second = await run();
    expect(second.error).toBeInstanceOf(SafeFetchError);
  });

  it("rejects when any resolved address is private", async () => {
    const lookup = createValidatingLookup(
      async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "fe80::1", family: 6 },
      ],
      isPrivateNetworkHost,
    );
    const error = await new Promise<Error | null>((resolve) =>
      lookup("mixed.test", { all: true }, (err) => resolve(err)),
    );
    expect(error).toBeInstanceOf(SafeFetchError);
  });
});

describe("safeFetch", () => {
  it("connects to the validated address and keeps the original Host header", async () => {
    const response = await safeFetch(
      `http://calendar.test:${port}/ok`,
      options(publicResolver),
    );
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("BEGIN:VCALENDAR");
    expect(requests).toContain(`calendar.test:${port}/ok`);
  });

  it("blocks a DNS rebinding host on the redirect hop (public, then private)", async () => {
    const resolve = jest.fn<SafeFetchResolver>()
      .mockResolvedValueOnce([{ address: TEST_PUBLIC_ADDRESS, family: 4 }])
      .mockResolvedValueOnce([{ address: "127.0.0.2", family: 4 }]);
    const target = encodeURIComponent(`http://rebind.test:${port}/ok`);
    const before = requests.length;

    await expect(
      safeFetch(`http://rebind.test:${port}/redirect?to=${target}`, options(resolve)),
    ).rejects.toMatchObject({ code: "private-network-host" });
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(requests.slice(before)).toEqual([
      `rebind.test:${port}/redirect?to=${target}`,
    ]);
  });

  it.each([
    "http://10.0.0.1/",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/",
    "file:///etc/passwd",
  ])("blocks redirects to %s", async (location) => {
    await expect(
      safeFetch(
        `http://calendar.test:${port}/redirect?to=${encodeURIComponent(location)}`,
        options(publicResolver),
      ),
    ).rejects.toBeInstanceOf(SafeFetchError);
  });

  it("blocks redirects to hostnames resolving to private addresses", async () => {
    const resolve: SafeFetchResolver = async (hostname) =>
      hostname === "internal.test"
        ? [{ address: "192.168.1.10", family: 4 }]
        : [{ address: TEST_PUBLIC_ADDRESS, family: 4 }];
    const target = encodeURIComponent(`http://internal.test:${port}/ok`);
    await expect(
      safeFetch(`http://calendar.test:${port}/redirect?to=${target}`, options(resolve)),
    ).rejects.toMatchObject({ code: "private-network-host" });
  });

  it("limits redirects", async () => {
    await expect(
      safeFetch(`http://calendar.test:${port}/loop`, options(publicResolver)),
    ).rejects.toMatchObject({ code: "too-many-redirects" });
  });

  it("caps the response size, including after decompression", async () => {
    await expect(
      safeFetch(`http://calendar.test:${port}/big`, options(publicResolver)),
    ).rejects.toMatchObject({ code: "response-too-large" });
    await expect(
      safeFetch(`http://calendar.test:${port}/gzip`, options(publicResolver)),
    ).rejects.toMatchObject({ code: "response-too-large" });
  });

  it("decodes gzip bodies within the cap", async () => {
    const response = await safeFetch(
      `http://calendar.test:${port}/gzip`,
      options(publicResolver, { maxBytes: 8192 }),
    );
    await expect(response.text()).resolves.toBe("x".repeat(4096));
  });

  it("times out slow responses", async () => {
    await expect(
      safeFetch(
        `http://calendar.test:${port}/slow`,
        options(publicResolver, { timeoutMs: 100 }),
      ),
    ).rejects.toMatchObject({ code: "timeout" });
  });
});
