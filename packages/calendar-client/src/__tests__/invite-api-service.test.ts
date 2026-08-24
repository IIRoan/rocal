import { afterEach, describe, expect, it, jest } from "@jest/globals";

import { HttpClient } from "../http-client";
import { InviteApiService } from "../invite-api-service";

function jsonOk(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("InviteApiService", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function createService() {
    return new InviteApiService(
      new HttpClient({
        baseURL: "http://api.test",
        retries: 0,
      }),
    );
  }

  it("lists invites from GET /api/invites", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("http://api.test/api/invites");
      return jsonOk({
        invites: [
          {
            id: "inv-1",
            token: "tok-1",
            email: "friend@example.com",
            status: "pending",
            expiresAt: "2026-09-01T00:00:00.000Z",
            createdAt: "2026-08-20T00:00:00.000Z",
            invitedById: "user-1",
          },
        ],
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await createService().listInvites();
    expect(result.invites).toHaveLength(1);
    expect(result.invites[0]?.email).toBe("friend@example.com");
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("creates an invite with POST /api/invites and the email body", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://api.test/api/invites");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        email: "friend@example.com",
      });
      return jsonOk({
        id: "inv-2",
        token: "tok-2",
        email: "friend@example.com",
        status: "pending",
        expiresAt: "2026-09-01T00:00:00.000Z",
        createdAt: "2026-08-24T00:00:00.000Z",
        invitedById: "user-1",
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const created = await createService().createInvite("friend@example.com");
    expect(created.id).toBe("inv-2");
    expect(created.email).toBe("friend@example.com");
  });

  it("revokes an invite with DELETE /api/invites/:id", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://api.test/api/invites/inv%2F2");
      expect(init?.method).toBe("DELETE");
      return jsonOk({ success: true });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(createService().revokeInvite("inv/2")).resolves.toEqual({
      success: true,
    });
  });
});
