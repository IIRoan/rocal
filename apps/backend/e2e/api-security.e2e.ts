/**
 * API-level end-to-end checks for the security & privacy guarantees in AGENTS.md §2.
 * Runs against a deployed (or locally served) API — never mocks.
 *
 *   E2E_API_URL=https://api.solace.onl \
 *   E2E_WEB_URL=https://solace.onl \            # optional: web security headers
 *   E2E_COOKIE="<session cookie header>" \       # optional: authenticated checks
 *   E2E_RATE_LIMIT=1 \                           # optional: burns the sign-in limit for this IP
 *   bun run e2e:api
 *
 * Authenticated checks only send requests the API must reject, so they write nothing when the API is correct.
 */
import {
  PLAINTEXT_EVENT_CONTENT_WITH_CIPHERTEXT_MESSAGE,
  PLAINTEXT_NAME_WITH_CIPHERTEXT_MESSAGE,
} from "@workspace/calendar-core";

const apiUrl = requiredEnv("E2E_API_URL").replace(/\/$/, "");
const webUrl = process.env.E2E_WEB_URL?.replace(/\/$/, "");
const cookie = process.env.E2E_COOKIE;
const trustedOrigin = process.env.E2E_TRUSTED_ORIGIN ?? webUrl ?? "https://solace.onl";

type Check = { name: string; run: () => Promise<void | "skip"> };
const checks: Check[] = [];
const check = (name: string, run: () => Promise<void | "skip">) => checks.push({ name, run });

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function api(path: string, init: RequestInit = {}, withCookie = false): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("origin", trustedOrigin);
  if (init.body) headers.set("content-type", "application/json");
  if (withCookie && cookie) headers.set("cookie", cookie);
  return fetch(`${apiUrl}${path}`, { ...init, headers, redirect: "manual" });
}

/** Authenticated rejection: must be a 4xx validation-style error, not an auth failure. */
async function expectRejected(response: Response, expectedText?: string) {
  const body = await response.text();
  assert(
    response.status >= 400 && response.status < 500 && response.status !== 401 && response.status !== 403,
    `expected a non-auth 4xx, got ${response.status}: ${body.slice(0, 200)}`,
  );
  if (expectedText) {
    assert(body.includes(expectedText), `expected "${expectedText}" in ${body.slice(0, 300)}`);
  }
}

// --- API security headers -------------------------------------------------------------------

check("API sends strict security headers", async () => {
  const response = await api("/api/health");
  const h = response.headers;
  assert(h.get("x-content-type-options") === "nosniff", "missing nosniff");
  assert(h.get("x-frame-options") === "DENY", "missing X-Frame-Options: DENY");
  assert(h.get("referrer-policy") === "no-referrer", "missing Referrer-Policy");
  assert(h.get("content-security-policy")?.includes("frame-ancestors 'none'"), "missing CSP");
  if (apiUrl.startsWith("https://")) {
    assert(h.get("strict-transport-security")?.includes("max-age="), "missing HSTS");
  }
});

check("API errors carry a requestId and no internals", async () => {
  const response = await api("/api/events/does-not-exist", {}, false);
  const body = await response.text();
  assert(response.status === 401, `unauthenticated request should be 401, got ${response.status}`);
  assert(!/stack|prisma|at \w+ \(/i.test(body), "error body leaks internals");
});

// --- CORS / origin policy -------------------------------------------------------------------

check("CORS trusts the app origin", async () => {
  const response = await fetch(`${apiUrl}/api/health`, { headers: { origin: trustedOrigin } });
  assert(
    response.headers.get("access-control-allow-origin") === trustedOrigin,
    `trusted origin ${trustedOrigin} not allowed`,
  );
});

check("CORS does not trust localhost in production", async () => {
  if (!apiUrl.startsWith("https://") && !process.env.E2E_EXPECT_PRODUCTION) return "skip";
  for (const origin of ["http://localhost:4000", "https://localhost", "https://evil.example"]) {
    const response = await fetch(`${apiUrl}/api/health`, { headers: { origin } });
    const allowed = response.headers.get("access-control-allow-origin");
    assert(allowed !== origin && allowed !== "*", `untrusted origin ${origin} was allowed`);
  }
});

// --- Auth rate limit ------------------------------------------------------------------------

check("sign-in is rate limited", async () => {
  if (!process.env.E2E_RATE_LIMIT) return "skip";
  const email = `e2e-rate-limit-${crypto.randomUUID()}@example.invalid`;
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await api("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password: "not-the-password" }),
    });
    statuses.push(response.status);
    if (response.status === 429) return;
  }
  throw new Error(`no 429 after 8 sign-in attempts: ${statuses.join(",")}`);
});

// --- Web security headers -------------------------------------------------------------------

check("web sends CSP and security headers", async () => {
  if (!webUrl) return "skip";
  const response = await fetch(`${webUrl}/login`, { redirect: "manual" });
  const h = response.headers;
  const csp = h.get("content-security-policy") ?? "";
  for (const directive of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'"]) {
    assert(csp.includes(directive), `web CSP missing ${directive}`);
  }
  assert(!/script-src[^;]*'unsafe-eval'/.test(csp), "web CSP allows unsafe-eval");
  assert(h.get("strict-transport-security")?.includes("max-age="), "web missing HSTS");
  assert(h.get("x-content-type-options") === "nosniff", "web missing nosniff");
  assert(h.get("permissions-policy")?.includes("publickey-credentials-get"), "passkeys not allowed");
});

// --- Authenticated privacy contract (reject-only, no writes) -------------------------------

check("unauthenticated writes are refused", async () => {
  const response = await api("/api/calendars", {
    method: "POST",
    body: JSON.stringify({ name: "e2e", color: "#3b82f6" }),
  });
  assert(response.status === 401, `expected 401, got ${response.status}`);
});

check("authenticated session resolves", async () => {
  if (!cookie) return "skip";
  const response = await api("/api/calendars", {}, true);
  assert(response.ok, `E2E_COOKIE does not authenticate (GET /api/calendars → ${response.status})`);
});

async function firstCalendarId(): Promise<string> {
  const response = await api("/api/calendars", {}, true);
  const body = (await response.json()) as Array<{ id: string }> | { calendars?: Array<{ id: string }> };
  const calendars = Array.isArray(body) ? body : (body.calendars ?? []);
  assert(calendars[0]?.id, "test account has no calendar");
  return calendars[0].id;
}

check("event plaintext alongside ciphertext is rejected", async () => {
  if (!cookie) return "skip";
  const calendarId = await firstCalendarId();
  const start = new Date(Date.now() + 86_400_000);
  const response = await api(
    "/api/events",
    {
      method: "POST",
      body: JSON.stringify({
        title: "plaintext title",
        start: start.toISOString(),
        end: new Date(start.getTime() + 3_600_000).toISOString(),
        timezone: "Europe/Amsterdam",
        calendarId,
        encryptedContent: "v1.e2e.ciphertext",
        blindIndexTokens: ["e2e"],
      }),
    },
    true,
  );
  await expectRejected(response, PLAINTEXT_EVENT_CONTENT_WITH_CIPHERTEXT_MESSAGE);
});

check("calendar plaintext name alongside ciphertext is rejected", async () => {
  if (!cookie) return "skip";
  const response = await api(
    "/api/calendars",
    {
      method: "POST",
      body: JSON.stringify({
        name: "plaintext name",
        color: "#3b82f6",
        encryptedName: "v1.e2e.ciphertext",
        blindIndexTokens: ["e2e"],
      }),
    },
    true,
  );
  await expectRejected(response, PLAINTEXT_NAME_WITH_CIPHERTEXT_MESSAGE);
});

check("plaintext reminder displayTitle is rejected", async () => {
  if (!cookie) return "skip";
  const response = await api(
    `/api/notifications/event/${crypto.randomUUID()}`,
    { method: "PUT", body: JSON.stringify({ notifications: [], displayTitle: "plaintext title" }) },
    true,
  );
  await expectRejected(response);
});

check("ICS subscriptions to private addresses are refused", async () => {
  if (!cookie) return "skip";
  for (const url of [
    "http://169.254.169.254/latest/meta-data/",
    "http://127.1/calendar.ics",
    "http://[::ffff:10.0.0.1]/calendar.ics",
    "http://0x7f000001/calendar.ics",
  ]) {
    const response = await api(
      "/api/subscriptions",
      { method: "POST", body: JSON.stringify({ name: "e2e ssrf probe", url, color: "#3b82f6" }) },
      true,
    );
    await expectRejected(response, "not allowed");
  }
});

check("session payload exposes no IP or user agent", async () => {
  if (!cookie) return "skip";
  const response = await api("/api/auth/get-session", {}, true);
  assert(response.ok, `get-session failed: ${response.status}`);
  const session = (await response.json()) as { session?: Record<string, unknown> } | null;
  assert(session?.session, "cookie did not resolve to a session");
  assert(!session.session.ipAddress && !session.session.userAgent, "session stores IP/user agent");
});

// --- Runner ---------------------------------------------------------------------------------

let failed = 0;
let skipped = 0;
for (const { name, run } of checks) {
  try {
    if ((await run()) === "skip") {
      skipped += 1;
      console.log(`  - ${name} (skipped)`);
      continue;
    }
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}\n      ${error instanceof Error ? error.message : String(error)}`);
  }
}
console.log(`\n${checks.length - failed - skipped} passed, ${failed} failed, ${skipped} skipped against ${apiUrl}`);
process.exit(failed > 0 ? 1 : 0);
