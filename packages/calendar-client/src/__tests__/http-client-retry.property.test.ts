import fc from "fast-check";
import { HttpClient } from "../http-client";

/**
 * Property 2: HTTP client retry behavior
 *
 * For any HTTP status code and retry config, verify retries on
 * 5xx/408/429/network errors up to configured count, and no retries on
 * 401/403/404.
 *
 * **Validates: Requirements 4.1**
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create an HttpClient with a given retry count and near-zero delays. */
function createClient(retries: number): HttpClient {
  return new HttpClient({
    baseURL: "http://test.local",
    retries,
    retryDelay: 1, // near-zero to keep tests fast
    timeout: 5_000,
  });
}

/** Build a mock Response for a given status code. */
function mockResponse(status: number): Response {
  const ok = status >= 200 && status < 300;
  const body = ok
    ? JSON.stringify({ ok: true })
    : JSON.stringify({
        error: "Test Error",
        message: `Status ${status}`,
        statusCode: status,
      });

  return new Response(body, {
    status,
    statusText: `Status ${status}`,
    headers: { "content-type": "application/json" },
  });
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Status codes that should trigger retries: 5xx, 408, 429 */
const retryableStatusArb: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: 500, max: 599 }),
  fc.constant(408),
  fc.constant(429),
);

/** Status codes that should NOT trigger retries: 401, 403, 404 */
const nonRetryableStatusArb: fc.Arbitrary<number> = fc.constantFrom(
  401,
  403,
  404,
);

/** Retry count between 0 and 5 */
const retryCountArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 5 });

// ─── Property Tests ──────────────────────────────────────────────────────────

describe("HttpClient retry behavior - Property Tests", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("Retryable status codes trigger retries up to configured count", () => {
    it("should make exactly retries + 1 attempts for retryable errors", async () => {
      await fc.assert(
        fc.asyncProperty(
          retryableStatusArb,
          retryCountArb,
          async (status, retries) => {
            let attemptCount = 0;

            globalThis.fetch = async () => {
              attemptCount++;
              return mockResponse(status);
            };

            const client = createClient(retries);

            try {
              await client.get("/test");
            } catch {
              // Expected to throw after exhausting retries
            }

            // Total attempts = initial + retries
            expect(attemptCount).toBe(retries + 1);
          },
        ),
        { numRuns: 30 },
      );
    }, 30_000);
  });

  describe("Non-retryable status codes (401, 403, 404) do not trigger retries", () => {
    it("should make exactly 1 attempt for non-retryable errors", async () => {
      await fc.assert(
        fc.asyncProperty(
          nonRetryableStatusArb,
          retryCountArb,
          async (status, retries) => {
            let attemptCount = 0;

            globalThis.fetch = async () => {
              attemptCount++;
              return mockResponse(status);
            };

            const client = createClient(retries);

            try {
              await client.get("/test");
            } catch {
              // Expected to throw immediately
            }

            // Should only attempt once regardless of retry config
            expect(attemptCount).toBe(1);
          },
        ),
        { numRuns: 30 },
      );
    });
  });

  describe("Network errors (TypeError) trigger retries", () => {
    it("should retry on network errors up to configured count", async () => {
      await fc.assert(
        fc.asyncProperty(retryCountArb, async (retries) => {
          let attemptCount = 0;

          globalThis.fetch = async () => {
            attemptCount++;
            throw new TypeError("Failed to fetch");
          };

          const client = createClient(retries);

          try {
            await client.get("/test");
          } catch {
            // Expected
          }

          expect(attemptCount).toBe(retries + 1);
        }),
        { numRuns: 20 },
      );
    }, 30_000);
  });

  describe("Successful response after transient failures", () => {
    it("should return data when a retryable error is followed by success", async () => {
      await fc.assert(
        fc.asyncProperty(
          retryableStatusArb,
          fc.integer({ min: 1, max: 4 }),
          async (status, failCount) => {
            let attemptCount = 0;
            const retries = failCount + 1; // Enough retries to succeed

            globalThis.fetch = async () => {
              attemptCount++;
              if (attemptCount <= failCount) {
                return mockResponse(status);
              }
              return mockResponse(200);
            };

            const client = createClient(retries);
            const result = await client.get<{ ok: boolean }>("/test");

            expect(result).toEqual({ ok: true });
            expect(attemptCount).toBe(failCount + 1);
          },
        ),
        { numRuns: 20 },
      );
    }, 30_000);
  });

  describe("Error shape is preserved as ApiError", () => {
    it("should throw an ApiError with correct statusCode for non-retryable errors", async () => {
      await fc.assert(
        fc.asyncProperty(nonRetryableStatusArb, async (status) => {
          globalThis.fetch = async () => mockResponse(status);

          const client = createClient(0);

          let thrown: any = null;
          try {
            await client.get("/test");
          } catch (error: any) {
            thrown = error;
          }

          expect(thrown).not.toBeNull();
          expect(thrown.statusCode).toBe(status);
          expect(typeof thrown.error).toBe("string");
          expect(typeof thrown.message).toBe("string");
        }),
        { numRuns: 10 },
      );
    });
  });

  describe("A POST that may already be applied is never sent twice", () => {
    const failures: Array<[string, () => Response]> = [
      ["500", () => mockResponse(500)],
      ["502", () => mockResponse(502)],
      ["network error", () => { throw new TypeError("Network request failed"); }],
      ["timeout", () => { throw Object.assign(new Error("Aborted"), { name: "AbortError" }); }],
      [
        "200 whose body cannot be read",
        () =>
          ({
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => {
              throw new TypeError("Body is unusable");
            },
          }) as unknown as Response,
      ],
    ];

    it.each(failures)("sends a POST once after a %s", async (_label, respond) => {
      let attemptCount = 0;
      globalThis.fetch = async () => {
        attemptCount++;
        return respond();
      };

      await expect(createClient(3).post("/api/events", { title: "x" })).rejects.toBeDefined();
      expect(attemptCount).toBe(1);
    });

    it.each([408, 429])("repeats a POST the server answered %i without processing", async (status) => {
      let attemptCount = 0;
      globalThis.fetch = async () => {
        attemptCount++;
        return attemptCount === 1 ? mockResponse(status) : mockResponse(200);
      };

      await expect(createClient(3).post("/api/events", { title: "x" })).resolves.toEqual({ ok: true });
      expect(attemptCount).toBe(2);
    });

    it.each(["put", "delete"] as const)("still repeats an idempotent %s after a 5xx", async (method) => {
      let attemptCount = 0;
      globalThis.fetch = async () => {
        attemptCount++;
        return attemptCount === 1 ? mockResponse(503) : mockResponse(200);
      };

      const client = createClient(3);
      await expect(method === "put" ? client.put("/api/events/1", {}) : client.delete("/api/events/1")).resolves.toEqual({ ok: true });
      expect(attemptCount).toBe(2);
    });
  });
});
