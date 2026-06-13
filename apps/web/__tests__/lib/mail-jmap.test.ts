import { describe, expect, it, jest } from "@jest/globals";

import {
  StalwartJmapClient,
  buildBearerAuthHeader,
  buildSendMessageMethodCalls,
  getPrimaryMailAccountId,
  normalizeJmapSession,
} from "../../lib/mail/jmap-client";
import type { JmapSession } from "../../lib/mail/types";

describe("mail JMAP helpers", () => {
  it("builds a bearer auth header from an access token", () => {
    expect(buildBearerAuthHeader("access-token-123")).toBe(
      "Bearer access-token-123",
    );
  });

  it("normalizes advertised session URLs back to the configured discovery base", () => {
    const session = normalizeJmapSession(
      {
        apiUrl: "https://solacemailmail.solace.onl/jmap/",
        downloadUrl:
          "https://solacemailmail.solace.onl/jmap/download/{accountId}/{blobId}/{name}?accept={type}",
        uploadUrl: "https://solacemailmail.solace.onl/jmap/upload/{accountId}/",
        eventSourceUrl:
          "https://solacemailmail.solace.onl/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}",
        accounts: {},
        primaryAccounts: {
          "urn:ietf:params:jmap:mail": "b",
        },
      },
      "http://192.168.2.213:8080",
    );

    expect(session).toEqual(
      expect.objectContaining({
        apiUrl: "http://192.168.2.213:8080/jmap/",
        downloadUrl:
          "http://192.168.2.213:8080/jmap/download/{accountId}/{blobId}/{name}?accept={type}",
        uploadUrl: "http://192.168.2.213:8080/jmap/upload/{accountId}/",
        eventSourceUrl:
          "http://192.168.2.213:8080/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}",
      }),
    );
  });

  it("preserves proxy base paths when normalizing advertised session URLs", () => {
    const session = normalizeJmapSession(
      {
        apiUrl: "https://solacemailmail.solace.onl/jmap/",
        downloadUrl:
          "https://solacemailmail.solace.onl/jmap/download/{accountId}/{blobId}/{name}?accept={type}",
        uploadUrl: "https://solacemailmail.solace.onl/jmap/upload/{accountId}/",
        eventSourceUrl:
          "https://solacemailmail.solace.onl/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}",
        accounts: {},
        primaryAccounts: {
          "urn:ietf:params:jmap:mail": "b",
        },
      },
      "http://localhost:4001/api/mail/jmap",
    );

    expect(session).toEqual(
      expect.objectContaining({
        apiUrl: "http://localhost:4001/api/mail/jmap/jmap/",
        downloadUrl:
          "http://localhost:4001/api/mail/jmap/jmap/download/{accountId}/{blobId}/{name}?accept={type}",
        uploadUrl:
          "http://localhost:4001/api/mail/jmap/jmap/upload/{accountId}/",
        eventSourceUrl:
          "http://localhost:4001/api/mail/jmap/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}",
      }),
    );
  });

  it("returns the primary mail account id from the session", () => {
    expect(
      getPrimaryMailAccountId({
        accounts: {
          b: { name: "alice@solace.onl" },
        },
        primaryAccounts: {
          "urn:ietf:params:jmap:mail": "b",
        },
      }),
    ).toBe("b");
  });

  it("falls back to the Stalwart account capability when the mail capability is absent", () => {
    expect(
      getPrimaryMailAccountId({
        accounts: {
          stalwart: { name: "alice@solace.onl" },
        },
        primaryAccounts: {
          "urn:stalwart:jmap": "stalwart",
        },
      }),
    ).toBe("stalwart");
  });

  it("falls back to the first account when no primary account mapping is present", () => {
    expect(
      getPrimaryMailAccountId({
        accounts: {
          a: { name: "alice@solace.onl" },
          b: { name: "alice+alt@solace.onl" },
        },
        primaryAccounts: {},
      }),
    ).toBe("a");
  });

  it("builds plain-text send method calls for Email/set and EmailSubmission/set", () => {
    expect(
      buildSendMessageMethodCalls({
        draftsMailboxId: "drafts-1",
        fromEmail: "alice@solace.onl",
        to: ["bob@example.com", "cara@example.com"],
        subject: "Hello",
        textBody: "Hello from Solace Mail",
        identityId: "identity-1",
      }),
    ).toEqual([
      [
        "Email/set",
        {
          create: {
            draft1: {
              mailboxIds: { "drafts-1": true },
              from: [{ email: "alice@solace.onl" }],
              to: [{ email: "bob@example.com" }, { email: "cara@example.com" }],
              subject: "Hello",
              bodyStructure: {
                type: "text/plain",
                partId: "text",
              },
              bodyValues: {
                text: {
                  value: "Hello from Solace Mail",
                },
              },
            },
          },
        },
        "c1",
      ],
      [
        "EmailSubmission/set",
        {
          create: {
            s1: {
              emailId: "#draft1",
              identityId: "identity-1",
            },
          },
        },
        "c2",
      ],
    ]);
  });

  it("moves the sent message into the sent mailbox when one is provided", () => {
    expect(
      buildSendMessageMethodCalls({
        draftsMailboxId: "drafts-1",
        sentMailboxId: "sent-1",
        fromEmail: "alice@solace.onl",
        to: ["bob@example.com"],
        subject: "Hello",
        textBody: "Hello from Solace Mail",
        identityId: "identity-1",
      }),
    ).toEqual([
      expect.any(Array),
      [
        "EmailSubmission/set",
        {
          create: {
            s1: {
              emailId: "#draft1",
              identityId: "identity-1",
            },
          },
          onSuccessUpdateEmail: {
            "#s1": {
              "mailboxIds/sent-1": true,
              "mailboxIds/drafts-1": null,
              "keywords/$draft": null,
            },
          },
        },
        "c2",
      ],
    ]);
  });

  it("includes thread metadata when building a reply", () => {
    expect(
      buildSendMessageMethodCalls({
        draftsMailboxId: "drafts-1",
        sentMailboxId: "sent-1",
        fromEmail: "alice@solace.onl",
        to: ["bob@example.com"],
        subject: "Re: Hello",
        textBody: "Hello from Solace Mail",
        identityId: "identity-1",
        inReplyTo: ["<message-1@example.com>"],
        references: [
          "<message-0@example.com>",
          "<message-1@example.com>",
        ],
      }),
    ).toEqual([
      [
        "Email/set",
        {
          create: {
            draft1: expect.objectContaining({
              inReplyTo: ["<message-1@example.com>"],
              references: [
                "<message-0@example.com>",
                "<message-1@example.com>",
              ],
            }),
          },
        },
        "c1",
      ],
      expect.any(Array),
    ]);
  });
});

describe("StalwartJmapClient", () => {
  it("discovers and normalizes the JMAP session through the backend proxy", async () => {
    const fetcher = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(
          JSON.stringify({
            apiUrl: "https://mail.solace.onl/jmap/",
            downloadUrl:
              "https://mail.solace.onl/jmap/download/{accountId}/{blobId}/{name}?accept={type}",
            uploadUrl: "https://mail.solace.onl/jmap/upload/{accountId}/",
            eventSourceUrl:
              "https://mail.solace.onl/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}",
            accounts: {},
            primaryAccounts: {
              "urn:ietf:params:jmap:mail": "b",
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
    );
    const client = new StalwartJmapClient({
      baseUrl: "http://localhost:4001/api/mail/jmap",
      accessToken: "mail-access-token",
      fetcher,
    });

    await expect(client.discoverSession()).resolves.toEqual(
      expect.objectContaining({
        apiUrl: "http://localhost:4001/api/mail/jmap/jmap/",
        downloadUrl:
          "http://localhost:4001/api/mail/jmap/jmap/download/{accountId}/{blobId}/{name}?accept={type}",
      }),
    );
    expect(fetcher).toHaveBeenCalledWith(
      "http://localhost:4001/api/mail/jmap/.well-known/jmap",
      {
        method: "GET",
        headers: {
          Authorization: buildBearerAuthHeader("mail-access-token"),
        },
        redirect: "follow",
      },
    );
  });

  it("supports bearer tokens for proxied JMAP discovery", async () => {
    const fetcher = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(
          JSON.stringify({
            apiUrl: "https://mail.solace.onl/jmap/",
            accounts: {},
            primaryAccounts: {
              "urn:ietf:params:jmap:mail": "b",
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
    );
    const client = new StalwartJmapClient({
      baseUrl: "http://localhost:4001/api/mail/jmap",
      accessToken: "mail-access-token",
      fetcher,
    });

    await client.discoverSession();

    expect(fetcher).toHaveBeenCalledWith(
      "http://localhost:4001/api/mail/jmap/.well-known/jmap",
      {
        method: "GET",
        headers: {
          Authorization: buildBearerAuthHeader("mail-access-token"),
        },
        redirect: "follow",
      },
    );
  });

  it("supports async access-token providers for proxied JMAP discovery", async () => {
    const fetcher = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(
          JSON.stringify({
            apiUrl: "https://mail.solace.onl/jmap/",
            accounts: {},
            primaryAccounts: {
              "urn:ietf:params:jmap:mail": "b",
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
    );
    const getAccessToken = jest.fn(async () => "mail-access-token");
    const client = new StalwartJmapClient({
      baseUrl: "http://localhost:4001/api/mail/jmap",
      getAccessToken,
      fetcher,
    });

    await client.discoverSession();

    expect(getAccessToken).toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledWith(
      "http://localhost:4001/api/mail/jmap/.well-known/jmap",
      {
        method: "GET",
        headers: {
          Authorization: buildBearerAuthHeader("mail-access-token"),
        },
        redirect: "follow",
      },
    );
  });

  it("queries paginated mailbox ids for local search indexing", async () => {
    const fetcher = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(
          JSON.stringify({
            methodResponses: [
              [
                "Email/query",
                {
                  ids: ["m1", "m2"],
                  total: 10,
                  queryState: "state-1",
                },
                "q1",
              ],
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    const client = new StalwartJmapClient({
      baseUrl: "http://localhost:4001/api/mail/jmap",
      accessToken: "mail-access-token",
      fetcher,
    });

    await expect(
      client.getMailboxMessageIds(
        {
          apiUrl: "http://localhost:4001/api/mail/jmap/jmap/",
          accounts: { account: {} },
          primaryAccounts: { "urn:ietf:params:jmap:mail": "account" },
        },
        "inbox",
        { limit: 2, position: 4 },
      ),
    ).resolves.toEqual({
      ids: ["m1", "m2"],
      total: 10,
      queryState: "state-1",
    });

    const request = JSON.parse(
      String(fetcher.mock.calls[0]?.[1]?.body),
    ) as { methodCalls: Array<[string, Record<string, unknown>, string]> };
    expect(request.methodCalls[0]?.[0]).toBe("Email/query");
    expect(request.methodCalls[0]?.[1]).toEqual(
      expect.objectContaining({
        accountId: "account",
        filter: { inMailbox: "inbox" },
        limit: 2,
        position: 4,
      }),
    );
  });

  it("reads Email/changes for incremental local search refreshes", async () => {
    const fetcher = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(
          JSON.stringify({
            methodResponses: [
              [
                "Email/changes",
                {
                  oldState: "state-1",
                  newState: "state-2",
                  created: ["new"],
                  updated: ["updated"],
                  destroyed: ["gone"],
                },
                "c1",
              ],
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    const client = new StalwartJmapClient({
      baseUrl: "http://localhost:4001/api/mail/jmap",
      accessToken: "mail-access-token",
      fetcher,
    });

    await expect(
      client.getEmailChanges(
        {
          apiUrl: "http://localhost:4001/api/mail/jmap/jmap/",
          accounts: { account: {} },
          primaryAccounts: { "urn:ietf:params:jmap:mail": "account" },
        },
        "state-1",
      ),
    ).resolves.toEqual({
      oldState: "state-1",
      newState: "state-2",
      hasMoreChanges: undefined,
      created: ["new"],
      updated: ["updated"],
      destroyed: ["gone"],
    });
  });

  it("surfaces bearer-auth failures without mentioning passwords", async () => {
    const client = new StalwartJmapClient({
      baseUrl: "http://localhost:4001/api/mail/jmap",
      accessToken: "expired-access-token",
      fetcher: async () =>
        new Response(JSON.stringify({ message: "Token expired" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
    });

    await expect(client.discoverSession()).rejects.toThrow(
      "Mail sign-in expired or was rejected by the mail server.",
    );
  });

  it("retries JMAP calls once after clearing stale auth", async () => {
    let calls = 0;
    const onUnauthorized = jest.fn<() => void>();
    const client = new StalwartJmapClient({
      baseUrl: "http://localhost:4001/api/mail/jmap",
      accessToken: "stale-access-token",
      onUnauthorized,
      fetcher: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response(JSON.stringify({ message: "Token expired" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            methodResponses: [
              [
                "Mailbox/get",
                {
                  list: [
                    {
                      id: "inbox-1",
                      name: "Inbox",
                      role: "inbox",
                    },
                  ],
                },
                "c1",
              ],
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      },
    });

    const session: JmapSession = {
      apiUrl: "http://localhost:4001/api/mail/jmap/",
      accounts: { acc1: { name: "alice@solace.onl" } },
      primaryAccounts: { "urn:ietf:params:jmap:mail": "acc1" },
    };
    const mailboxes = await client.getMailboxes(session);

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(calls).toBe(2);
    expect(mailboxes[0]?.id).toBe("inbox-1");
  });

  it("includes upstream details when discovery cannot reach the mail server", async () => {
    const client = new StalwartJmapClient({
      baseUrl: "http://localhost:4001/api/mail/jmap",
      accessToken: "mail-access-token",
      fetcher: async () =>
        new Response(JSON.stringify({ message: "Connection refused" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
    });

    await expect(client.discoverSession()).rejects.toThrow(
      "Mail server is unreachable — Connection refused.",
    );
  });
});
