import { describe, expect, it, jest } from "@jest/globals";

import { StalwartUserJmapClient } from "../../lib/stalwart-user-jmap";

function createTokens(accessTokens: string[]) {
  const remaining = [...accessTokens];
  return {
    getAccessTokenForUser: jest.fn(async () => ({
      access_token: remaining.length > 1 ? remaining.shift()! : remaining[0]!,
    })),
    invalidateAccessTokenForUser: jest.fn(),
  };
}

function createClient(
  tokens: ReturnType<typeof createTokens>,
  fetcher: (input: string, init?: RequestInit) => Promise<Response>,
) {
  return new StalwartUserJmapClient({
    baseUrl: "http://stalwart.test/",
    tokens,
    fetcher,
  });
}

const CALL = {
  userId: "user-1",
  email: "alice@solace.onl",
  using: ["urn:ietf:params:jmap:core"],
  methodCalls: [["Email/get", { accountId: "acct-1" }, "c1"]] as [
    string,
    Record<string, unknown>,
    string,
  ][],
};

describe("StalwartUserJmapClient", () => {
  it("calls JMAP with the mailbox owner's bearer, not an admin token", async () => {
    const tokens = createTokens(["owner-token"]);
    const fetcher = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(async () => Response.json({ methodResponses: [] }));

    await createClient(tokens, fetcher).callJmap(CALL);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe("http://stalwart.test/jmap/");
    const headers = (fetcher.mock.calls[0]?.[1]?.headers ?? {}) as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBe("Bearer owner-token");
    expect(tokens.getAccessTokenForUser).toHaveBeenCalledWith({
      userId: "user-1",
      email: "alice@solace.onl",
    });
  });

  it("invalidates the cached token and retries once on a 401", async () => {
    const tokens = createTokens(["stale-token", "fresh-token"]);
    let attempts = 0;
    const fetcher = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(async () => {
      attempts += 1;
      return attempts === 1
        ? new Response(null, { status: 401 })
        : Response.json({ methodResponses: [] });
    });

    await createClient(tokens, fetcher).callJmap(CALL);

    expect(tokens.invalidateAccessTokenForUser).toHaveBeenCalledWith("user-1");
    expect(fetcher).toHaveBeenCalledTimes(2);
    const retryHeaders = (fetcher.mock.calls[1]?.[1]?.headers ?? {}) as Record<
      string,
      string
    >;
    expect(retryHeaders.Authorization).toBe("Bearer fresh-token");
  });

  it("surfaces non-401 upstream failures", async () => {
    const tokens = createTokens(["owner-token"]);
    const fetcher = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(async () => new Response(null, { status: 503 }));

    await expect(createClient(tokens, fetcher).callJmap(CALL)).rejects.toThrow(
      "status 503",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
