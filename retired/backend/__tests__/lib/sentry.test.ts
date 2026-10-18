import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

type InitOptions = {
  sendDefaultPii?: boolean;
  beforeSend?: (event: Record<string, unknown>) => unknown;
  beforeBreadcrumb?: (breadcrumb: Record<string, unknown>) => unknown;
};

const mockInit = jest.fn<(options: InitOptions) => void>();
const mockSetExtras = jest.fn<(extras: Record<string, unknown>) => void>();
const mockSetTag = jest.fn<(key: string, value: string) => void>();
const mockCaptureException = jest.fn();

jest.mock("@sentry/bun", () => ({
  init: (options: InitOptions) => mockInit(options),
  captureException: (error: unknown) => mockCaptureException(error),
  withScope: (callback: (scope: unknown) => void) =>
    callback({ setExtras: mockSetExtras, setTag: mockSetTag }),
}));

const DSN = "https://publickey@errors.solace.onl/solace";
const SECRETS = [
  "alice@example.com",
  "eyJhbGciOi.payload.sig",
  "token=abc123",
  "Dentist appointment",
  "Quarterly salary",
  "session=xyz",
];

function expectNoSecrets(value: unknown) {
  const text = JSON.stringify(value);
  for (const secret of SECRETS) {
    expect(text).not.toContain(secret);
  }
}

async function loadSentry() {
  let sentry: typeof import("../../lib/sentry") | undefined;
  await jest.isolateModulesAsync(async () => {
    sentry = await import("../../lib/sentry");
  });
  if (!sentry) throw new Error("sentry module failed to load");
  return sentry;
}

describe("backend error reporting scrubbing", () => {
  beforeEach(() => {
    process.env.SENTRY_DSN = DSN;
  });

  afterEach(() => {
    delete process.env.SENTRY_DSN;
  });

  it("installs beforeSend/beforeBreadcrumb scrubbers", async () => {
    const { initSentry } = await loadSentry();
    initSentry();

    const options = mockInit.mock.calls[0]?.[0];
    expect(options?.sendDefaultPii).toBe(false);

    const event = options?.beforeSend?.({
      message: "failed for alice@example.com",
      user: { id: "user_1", email: "alice@example.com", ip_address: "203.0.113.1" },
      request: {
        method: "GET",
        url: "https://api.solace.onl/api/invites?token=abc123",
        headers: { authorization: "Bearer eyJhbGciOi.payload.sig", cookie: "session=xyz" },
        cookies: { session: "xyz" },
        data: { title: "Dentist appointment" },
      },
      exception: {
        values: [{ type: "Error", value: "Bearer eyJhbGciOi.payload.sig rejected" }],
      },
      extra: { subject: "Quarterly salary", email: "alice@example.com" },
      breadcrumbs: [{ category: "console", message: "alice@example.com" }],
    }) as Record<string, unknown>;

    expectNoSecrets(event);
    expect(event.user).toBeUndefined();
    expect(event.request).toEqual({
      method: "GET",
      url: "https://api.solace.onl/api/invites?[redacted]",
    });
    expect((event.extra as Record<string, unknown>).email).toMatch(/^[0-9a-f]{12}$/);
    expect(
      options?.beforeBreadcrumb?.({ category: "http", data: { url: "https://x.test/?token=abc123" } }),
    ).toEqual({ category: "http", data: { url: "https://x.test/?[redacted]" } });
  });

  it("sanitizes extras before attaching them to the scope", async () => {
    const { reportException } = await loadSentry();
    reportException(new Error("boom"), {
      requestId: "req-1",
      title: "Dentist appointment",
      message: "failed for alice@example.com",
      detail: "see https://api.solace.onl/x?token=abc123",
    });

    const extras = mockSetExtras.mock.calls[0]?.[0];
    expectNoSecrets(extras);
    expect(extras).toMatchObject({ requestId: "req-1", title: "[omitted]" });
    expect(mockSetTag).toHaveBeenCalledWith("requestId", "req-1");
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
