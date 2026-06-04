import { createServerMailTokenManager, MailApiError } from "./mail-api";

jest.mock("../api", () => ({
  getAuthHeaders: jest.fn(() => ({ cookie: "session=abc" })),
}));

const ENDPOINT = "https://backend.test/api/mail/oauth/access-token";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("createServerMailTokenManager", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("mints a token from the endpoint and returns the access token", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ access_token: "tok-1", expires_in: 3600 }),
    );
    const manager = createServerMailTokenManager(ENDPOINT);
    await expect(manager.getAccessToken()).resolves.toBe("tok-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(ENDPOINT);
  });

  it("caches a fresh token and does not refetch", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: "tok-1", expires_in: 3600 }),
    );
    const manager = createServerMailTokenManager(ENDPOINT);
    await manager.getAccessToken();
    await manager.getAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-mints when the cached token is within the expiry skew window", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "tok-old",
          expires_at: Math.floor(Date.now() / 1000) + 5,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "tok-new", expires_in: 3600 }),
      );
    const manager = createServerMailTokenManager(ENDPOINT);
    await expect(manager.getAccessToken()).resolves.toBe("tok-old");
    await expect(manager.getAccessToken()).resolves.toBe("tok-new");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats tokens without expiry as always fresh", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ access_token: "tok-1" }));
    const manager = createServerMailTokenManager(ENDPOINT);
    await manager.getAccessToken();
    await manager.getAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent mint requests", async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const manager = createServerMailTokenManager(ENDPOINT);
    const first = manager.getAccessToken();
    const second = manager.getAccessToken();
    resolveFetch?.(jsonResponse({ access_token: "tok-1", expires_in: 3600 }));
    await expect(Promise.all([first, second])).resolves.toEqual([
      "tok-1",
      "tok-1",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws a MailApiError when the server rejects the request", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error_description: "no mailbox" }, 403),
    );
    const manager = createServerMailTokenManager(ENDPOINT);
    await expect(manager.getAccessToken()).rejects.toBeInstanceOf(MailApiError);
  });

  it("retries after clear() discards the cached token", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: "tok-1", expires_in: 3600 }),
    );
    const manager = createServerMailTokenManager(ENDPOINT);
    await manager.getAccessToken();
    manager.clear();
    await manager.getAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
