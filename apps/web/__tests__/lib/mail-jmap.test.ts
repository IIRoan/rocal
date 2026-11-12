import { clearMailSendAttempts, discardMailSendAttempt } from "@workspace/calendar-core";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { resolveMailServerPolicy } from "@workspace/calendar-core";

import {
  StalwartJmapClient,
  buildBearerAuthHeader,
  getPrimaryMailAccountId,
  normalizeJmapSession,
} from "../../lib/mail/jmap-client";
import type { JmapSession } from "../../lib/mail/types";

beforeEach(() => clearMailSendAttempts());

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

    // Second call should reuse the cached session (no extra discovery HTTP).
    await expect(client.discoverSession()).resolves.toEqual(
      expect.objectContaining({
        apiUrl: "http://localhost:4001/api/mail/jmap/jmap/",
      }),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
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

  it("bootstraps mailbox state even when policy singletons are missing", async () => {
    const fetcher = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(
          JSON.stringify({
            methodResponses: [
              [
                "x:AccountSettings/get",
                {
                  list: [{ encryptionAtRest: { "@type": "Disabled" } }],
                },
                "as1",
              ],
              // User tokens often cannot read server policy singletons.
              [
                "error",
                {
                  type: "urn:ietf:params:jmap:error:forbidden",
                },
                "e1",
              ],
              [
                "error",
                {
                  type: "urn:ietf:params:jmap:error:forbidden",
                },
                "j1",
              ],
              [
                "Mailbox/get",
                {
                  list: [
                    {
                      id: "inbox",
                      name: "Inbox",
                      role: "inbox",
                      parentId: null,
                      sortOrder: 0,
                    },
                  ],
                },
                "m1",
              ],
              [
                "Identity/get",
                {
                  list: [
                    {
                      id: "id-1",
                      email: "alice@solace.onl",
                      name: "Alice",
                    },
                  ],
                },
                "i1",
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
      client.bootstrapMailboxState({
        apiUrl: "http://localhost:4001/api/mail/jmap/jmap/",
        accounts: { account: {} },
        primaryAccounts: { "urn:ietf:params:jmap:mail": "account" },
      }),
    ).resolves.toEqual({
      accountSettings: { encryptionAtRest: { "@type": "Disabled" } },
      emailSettings: null,
      jmapSettings: null,
      mailboxes: [
        {
          id: "inbox",
          name: "Inbox",
          role: "inbox",
          parentId: null,
          sortOrder: 0,
        },
      ],
      identities: [
        {
          id: "id-1",
          email: "alice@solace.onl",
          name: "Alice",
        },
      ],
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
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

    const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      methodCalls: Array<[string, Record<string, unknown>, string]>;
    };
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

  it("wildcard-prefixes inline search text for Stalwart FTS", async () => {
    const fetcher = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(
          JSON.stringify({
            methodResponses: [
              ["Email/query", { ids: ["m1"], total: 1 }, "q1"],
              [
                "Email/get",
                {
                  list: [
                    {
                      id: "m1",
                      subject: "hi me!",
                    },
                  ],
                },
                "g1",
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
      client.searchMailboxMessages(
        {
          apiUrl: "http://localhost:4001/api/mail/jmap/jmap/",
          accounts: { account: {} },
          primaryAccounts: { "urn:ietf:params:jmap:mail": "account" },
        },
        "inbox",
        "hi me",
      ),
    ).resolves.toEqual({
      messages: [{ id: "m1", subject: "hi me!" }],
      total: 1,
    });

    const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      methodCalls: Array<[string, Record<string, unknown>, string]>;
    };
    expect(request.methodCalls[0]?.[1]).toEqual(
      expect.objectContaining({
        filter: {
          inMailbox: "inbox",
          text: "hi* me*",
        },
      }),
    );
  });

  it("passes complex AND filters through searchMailboxMessagesWithFilter", async () => {
    const fetcher = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(
          JSON.stringify({
            methodResponses: [
              ["Email/query", { ids: [], total: 0 }, "q1"],
              ["Email/get", { list: [] }, "g1"],
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

    const session = {
      apiUrl: "http://localhost:4001/api/mail/jmap/jmap/",
      accounts: { account: {} },
      primaryAccounts: { "urn:ietf:params:jmap:mail": "account" },
    };

    const filter = {
      operator: "AND",
      conditions: [
        { inMailbox: "inbox", text: "invoice*" },
        { inMailbox: "inbox", from: "alice@example.com" },
      ],
    };

    await client.searchMailboxMessagesWithFilter(session, "inbox", filter, 40);

    const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      methodCalls: Array<[string, Record<string, unknown>, string]>;
    };
    expect(request.methodCalls[0]?.[1]).toEqual(
      expect.objectContaining({
        filter,
        limit: 40,
      }),
    );
  });

  it("wildcard-prefixes special-character queries for inline search", async () => {
    const fetcher = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(
          JSON.stringify({
            methodResponses: [
              ["Email/query", { ids: [], total: 0 }, "q1"],
              ["Email/get", { list: [] }, "g1"],
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

    const session = {
      apiUrl: "http://localhost:4001/api/mail/jmap/jmap/",
      accounts: { account: {} },
      primaryAccounts: { "urn:ietf:params:jmap:mail": "account" },
    };

    await client.searchMailboxMessages(
      session,
      "inbox",
      "alice@example.com #urgent",
    );

    const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      methodCalls: Array<[string, Record<string, unknown>, string]>;
    };
    expect(request.methodCalls[0]?.[1]).toEqual(
      expect.objectContaining({
        filter: {
          inMailbox: "inbox",
          text: "alice@example.com* #urgent*",
        },
      }),
    );
  });

  it("empties a mailbox by repeatedly querying and destroying batches", async () => {
    let queryCount = 0;
    const fetcher = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(async () => {
      queryCount += 1;
      if (queryCount === 1) {
        return new Response(
          JSON.stringify({
            methodResponses: [
              ["Email/query", { ids: ["m1", "m2"], total: 2 }, "q1"],
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (queryCount === 2) {
        return new Response(
          JSON.stringify({
            methodResponses: [
              [
                "Email/set",
                { destroyed: ["m1", "m2"], notDestroyed: {} },
                "c1",
              ],
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          methodResponses: [["Email/query", { ids: [], total: 0 }, "q2"]],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const client = new StalwartJmapClient({
      baseUrl: "http://localhost:4001/api/mail/jmap",
      accessToken: "mail-access-token",
      fetcher,
    });

    const session = {
      apiUrl: "http://localhost:4001/api/mail/jmap/jmap/",
      accounts: { account: {} },
      primaryAccounts: { "urn:ietf:params:jmap:mail": "account" },
    };

    await expect(client.emptyMailbox(session, "trash")).resolves.toBe(2);
    expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(2);
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

  it("loads Stalwart Email singleton limits when available", async () => {
    const client = new StalwartJmapClient({
      baseUrl: "http://localhost:4001/api/mail/jmap",
      accessToken: "mail-access-token",
      fetcher: async () =>
        new Response(
          JSON.stringify({
            methodResponses: [
              [
                "x:Email/get",
                {
                  list: [
                    {
                      maxAttachmentSize: 100_000_000,
                      maxMessageSize: 150_000_000,
                    },
                  ],
                },
                "e1",
              ],
              ["x:Jmap/get", { list: [{ maxUploadSize: 100_000_000 }] }, "j1"],
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });

    const session: JmapSession = {
      apiUrl: "http://localhost:4001/api/mail/jmap/",
      accounts: { acc1: { name: "alice@solace.onl" } },
      primaryAccounts: { "urn:ietf:params:jmap:mail": "acc1" },
    };

    await expect(client.getStalwartPolicySingletons(session)).resolves.toEqual({
      emailSettings: {
        maxAttachmentSize: 100_000_000,
        maxMessageSize: 150_000_000,
      },
      jmapSettings: { maxUploadSize: 100_000_000 },
    });
  });

  it("refreshes Stalwart policy before saving a draft", async () => {
    const fetcher = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(
          JSON.stringify({
            methodResponses: [
              [
                "x:Email/get",
                {
                  list: [{ maxMessageSize: 1_000 }],
                },
                "e1",
              ],
              ["x:Jmap/get", { list: [] }, "j1"],
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

    const session: JmapSession = {
      apiUrl: "http://localhost:4001/api/mail/jmap/",
      accounts: { acc1: { name: "alice@solace.onl" } },
      primaryAccounts: { "urn:ietf:params:jmap:mail": "acc1" },
    };

    await expect(
      client.saveDraft(session, {
        draftsMailboxId: "drafts",
        fromEmail: "alice@solace.onl",
        to: ["bob@solace.onl"],
        subject: "Hello",
        ciphertext: { blobId: "sealed-draft", size: 5_000 },
      }),
    ).rejects.toThrow(/exceeds the .* server limit/);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects send when the outgoing message exceeds maxMessageSize", async () => {
    const client = new StalwartJmapClient({
      baseUrl: "http://localhost:4001/api/mail/jmap",
      accessToken: "mail-access-token",
      fetcher: async () =>
        new Response(JSON.stringify({ methodResponses: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    });
    client.setMailServerPolicy(
      resolveMailServerPolicy({
        emailSettings: { maxMessageSize: 1_000 },
      }),
    );

    const session: JmapSession = {
      apiUrl: "http://localhost:4001/api/mail/jmap/",
      accounts: { acc1: { name: "alice@solace.onl" } },
      primaryAccounts: {
        "urn:ietf:params:jmap:mail": "acc1",
        "urn:ietf:params:jmap:submission": "acc1",
      },
    };

    await expect(
      client.sendMessage(session, {
        sendScope: "test-compose-session",
        draftsMailboxId: "drafts",
        sentMailboxId: "sent",
        fromEmail: "alice@solace.onl",
        to: ["bob@solace.onl"],
        subject: "Hello",
        textBody: "x".repeat(5_000),
        identityId: "identity-1",
        sentCopyCiphertext: null,
      }),
    ).rejects.toThrow(/exceeds the .* server limit/);
  });

  it("refreshes Stalwart policy before sending a message", async () => {
    const fetcher = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(
          JSON.stringify({
            methodResponses: [
              [
                "x:Email/get",
                {
                  list: [{ maxMessageSize: 1_000 }],
                },
                "e1",
              ],
              ["x:Jmap/get", { list: [] }, "j1"],
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

    const session: JmapSession = {
      apiUrl: "http://localhost:4001/api/mail/jmap/",
      accounts: { acc1: { name: "alice@solace.onl" } },
      primaryAccounts: {
        "urn:ietf:params:jmap:mail": "acc1",
        "urn:ietf:params:jmap:submission": "acc1",
      },
    };

    await expect(
      client.sendMessage(session, {
        sendScope: "test-compose-session",
        draftsMailboxId: "drafts",
        sentMailboxId: "sent",
        fromEmail: "alice@solace.onl",
        to: ["bob@solace.onl"],
        subject: "Hello",
        textBody: "x".repeat(5_000),
        identityId: "identity-1",
        sentCopyCiphertext: null,
      }),
    ).rejects.toThrow(/exceeds the .* server limit/);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not split dependent JMAP method calls when maxMethodCalls is low", async () => {
    let requestCount = 0;
    const client = new StalwartJmapClient({
      baseUrl: "http://localhost:4001/api/mail/jmap",
      accessToken: "mail-access-token",
      fetcher: async () => {
        requestCount += 1;
        return new Response(
          JSON.stringify({
            methodResponses: [
              ["Email/query", { ids: ["m1"], total: 1 }, "q1"],
              ["Email/get", { list: [] }, "g1"],
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });
    client.setMailServerPolicy(
      resolveMailServerPolicy({
        jmapSettings: { maxMethodCalls: 1 },
      }),
    );

    const session: JmapSession = {
      apiUrl: "http://localhost:4001/api/mail/jmap/",
      accounts: { acc1: { name: "alice@solace.onl" } },
      primaryAccounts: { "urn:ietf:params:jmap:mail": "acc1" },
    };

    await client.getMailboxMessages(session, "inbox-1", { limit: 5 });

    expect(requestCount).toBe(1);
  });

  it("retries blob uploads once after clearing stale auth", async () => {
    let calls = 0;
    const onUnauthorized = jest.fn<() => void>();
    const client = new StalwartJmapClient({
      baseUrl: "http://localhost:4001/api/mail/jmap",
      accessToken: "stale-access-token",
      onUnauthorized,
      fetcher: async (url) => {
        calls += 1;
        if (calls === 1) {
          return new Response(
            JSON.stringify({ title: "Unauthorized", status: 401 }),
            {
              status: 401,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        return new Response(
          JSON.stringify({
            blobId: "blob-1",
            size: 4,
            type: "text/plain",
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
      uploadUrl: "http://localhost:4001/api/mail/jmap/jmap/upload/{accountId}/",
      accounts: { acc1: { name: "alice@solace.onl" } },
      primaryAccounts: { "urn:ietf:params:jmap:mail": "acc1" },
    };
    const uploaded = await client.uploadBlob(
      session,
      new Blob(["test"], { type: "text/plain" }),
      "text/plain",
    );

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(calls).toBe(2);
    expect(uploaded.blobId).toBe("blob-1");
  });

  it("respects upload concurrency when refreshing expired outgoing attachments", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(1_000);
    const fetcher = jest.fn<
      (url: string, init?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(
          JSON.stringify({
            methodResponses: [
              ["Email/set", { created: { draft1: { id: "email" } } }, "c1"],
              ["EmailSubmission/set", { created: { s1: { id: "sub" } } }, "c2"],
            ],
          }),
        ),
    );
    const client = new StalwartJmapClient({
      baseUrl: "https://mail.example.test",
      accessToken: "token",
      fetcher,
    });
    const session: JmapSession = {
      apiUrl: "https://mail.example.test/jmap/",
      accounts: { acc: {} },
      primaryAccounts: { "urn:ietf:params:jmap:mail": "acc" },
    };
    let active = 0;
    let peak = 0;
    let uploadedCount = 0;
    jest.spyOn(client, "uploadBlob").mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      const blobId = `blob-${++uploadedCount}`;
      await new Promise((resolve) => setTimeout(resolve, 0));
      active -= 1;
      return { blobId, size: 1, type: "text/plain" };
    });
    try {
      const attachments = await Promise.all(
        Array.from({ length: 5 }, () => client.uploadTextBlob(session, "x")),
      );
      // An earlier plaintext send's attachment stays registered but is not part of this message.
      await client.uploadTextBlob(session, "earlier attachment");
      peak = 0;
      now.mockReturnValue(7_200_000);
      client.setMailServerPolicy(
        resolveMailServerPolicy({
          jmapSettings: { maxConcurrentUploads: 4, uploadTtl: 3_600_000 },
        }),
      );

      await expect(
        client.sendMessage(session, {
          sendScope: "test-compose-session",
          draftsMailboxId: "drafts",
          sentMailboxId: null,
          fromEmail: "alice@example.test",
          to: ["bob@solace.onl"],
          subject: "Files",
          textBody: "Hello",
          identityId: "identity-1",
          sentCopyCiphertext: null,
          attachments: attachments.map((attachment, index) => ({
            ...attachment,
            name: `attachment-${index}.txt`,
          })),
        }),
      ).resolves.toEqual(expect.objectContaining({ emailId: "email" }));

      expect(peak).toBeLessThanOrEqual(4);
      expect(uploadedCount).toBe(11);
      const body = String(fetcher.mock.calls[0]?.[1]?.body);
      expect(body).toContain('"blob-7"');
      expect(body).toContain('"blob-11"');
      expect(body).not.toContain('"blob-1"');
    } finally {
      now.mockRestore();
    }
  });

  it("rejects blob uploads that do not return a blob id", async () => {
    const client = new StalwartJmapClient({
      baseUrl: "http://localhost:4001/api/mail/jmap",
      accessToken: "mail-access-token",
      fetcher: async () =>
        new Response(
          JSON.stringify({
            size: 4,
            type: "text/plain",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    });

    const session: JmapSession = {
      apiUrl: "http://localhost:4001/api/mail/jmap/",
      uploadUrl: "http://localhost:4001/api/mail/jmap/jmap/upload/{accountId}/",
      accounts: { acc1: { name: "alice@solace.onl" } },
      primaryAccounts: { "urn:ietf:params:jmap:mail": "acc1" },
    };

    await expect(
      client.uploadBlob(
        session,
        new Blob(["test"], { type: "text/plain" }),
        "text/plain",
      ),
    ).rejects.toThrow("Blob upload did not return a blob id");
  });

  it("requires EmailSubmission/set to create a submission when sending", async () => {
    const fetcher = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(
          JSON.stringify({
            methodResponses: [
              [
                "Email/set",
                {
                  created: {
                    draft1: { id: "email-1", threadId: "thread-1" },
                  },
                },
                "c1",
              ],
              ["EmailSubmission/set", { created: {} }, "c2"],
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
      client.sendMessage(
        {
          apiUrl: "http://localhost:4001/api/mail/jmap/jmap/",
          accounts: { account: {} },
          primaryAccounts: { "urn:ietf:params:jmap:mail": "account" },
        },
        {
          sendScope: "test-compose-session",
          draftsMailboxId: "drafts-1",
          sentMailboxId: "sent-1",
          fromEmail: "alice@solace.onl",
          to: ["bob@example.com"],
          subject: "Hello",
          textBody: "Hello",
          identityId: "identity-1",
          sentCopyCiphertext: null,
        },
      ),
    ).rejects.toThrow("Could not confirm whether");
  });

  describe("sending to external recipients", () => {
    const session: JmapSession = {
      apiUrl: "http://localhost:4001/api/mail/jmap/jmap/",
      accounts: { account: {} },
      primaryAccounts: { "urn:ietf:params:jmap:mail": "account" },
    };
    const external = {
      draftsMailboxId: "drafts-1",
      sentMailboxId: "sent-1",
      fromEmail: "alice@solace.onl",
      to: ["bob@example.com"],
      subject: "Hello",
      textBody: "Plain hello",
      identityId: "identity-1",
      sentCopyCiphertext: { blobId: "sealed-copy", size: 900 },
    };
    const requestBodies = (
      fetcher: jest.Mock<
        (input: string, init?: RequestInit) => Promise<Response>
      >,
    ) => fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));

    function externalClient(mode: "accept" | "refuse" | "missing-copy" = "accept") {
      const fetcher = jest.fn<(input: string, init?: RequestInit) => Promise<Response>>(async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { methodCalls: Array<[string, Record<string, unknown>, string]> };
        const call = body.methodCalls[0];
        if (!call) throw new Error("Missing call");
        const [method, params, id] = call;
        if (!params.create) return new Response(JSON.stringify({ methodResponses: [[method, { destroyed: params.destroy }, id]] }));
        const email = { created: { draft1: { id: "plain-1" }, ...(mode === "missing-copy" ? {} : { sent1: { id: "copy-1", threadId: "t-1" } }) }, ...(mode === "missing-copy" ? { notCreated: { sent1: { type: "tooLarge" } } } : {}) };
        const submission = mode === "refuse" ? { notCreated: { s1: { type: "forbiddenToSend", description: "Quota" } } } : { created: { s1: { id: "sub-1" } } };
        return new Response(JSON.stringify({ methodResponses: [["Email/set", email, "c1"], ["EmailSubmission/set", submission, "c2"]] }));
      });
      const client = new StalwartJmapClient({ baseUrl: "http://localhost:4001/api/mail/jmap", accessToken: "mail-access-token", fetcher });
      client.setMailServerPolicy(resolveMailServerPolicy({}));
      return { client, fetcher };
    }

    it("submits plaintext and stores its encrypted Sent copy in the same batch with an opaque ENVID", async () => {
      const { client, fetcher } = externalClient();
      await expect(client.sendMessage(session, { sendScope: "test-compose-session", ...external })).resolves.toEqual({ emailId: "copy-1", threadId: "t-1", submissionId: "sub-1" });
      expect(fetcher).toHaveBeenCalledTimes(1);
      const [request] = requestBodies(fetcher);
      expect(request.methodCalls.map(([method]: [string]) => method)).toEqual(["Email/set", "EmailSubmission/set"]);
      const emailSet = request.methodCalls[0][1];
      expect(emailSet.create.draft1.bodyValues.text.value).toBe("Plain hello");
      expect(emailSet.create.sent1.mailboxIds).toEqual({ "sent-1": true });
      expect(emailSet.create.sent1.bodyStructure.subParts[1].blobId).toBe("sealed-copy");
      expect(JSON.stringify(emailSet.create.sent1)).not.toContain("Plain hello");
      expect(request.methodCalls[1][1]).toMatchObject({ create: { s1: { emailId: "#draft1", envelope: { mailFrom: { parameters: { ENVID: expect.stringMatching(/^[a-f0-9]{32}$/) } } } } }, onSuccessDestroyEmail: ["#s1"] });
    });

    it("removes refused batch objects and preserves the encrypted source draft", async () => {
      const { client, fetcher } = externalClient("refuse");
      await expect(client.sendMessage(session, { sendScope: "test-compose-session", ...external, previousDraftId: "draft-1" })).rejects.toThrow("Quota");
      expect(fetcher).toHaveBeenCalledTimes(2);
      const [, cleanup] = requestBodies(fetcher);
      expect(cleanup.methodCalls).toEqual([["Email/set", { accountId: "account", destroy: ["plain-1", "copy-1"] }, "c1"]]);
    });

    it("keeps a queued send successful if its encrypted Sent copy was refused", async () => {
      const { client, fetcher } = externalClient("missing-copy");
      await expect(client.sendMessage(session, { sendScope: "test-compose-session", ...external })).resolves.toMatchObject({ emailId: "plain-1", submissionId: "sub-1" });
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
  });

  it("saves drafts only as PGP/MIME ciphertext with readable headers", async () => {
    const fetcher = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(
          JSON.stringify({
            methodResponses: [
              ["Email/set", { created: { draft1: { id: "draft-2" } } }, "c1"],
            ],
          }),
        ),
    );
    const client = new StalwartJmapClient({
      baseUrl: "http://localhost:4001/api/mail/jmap",
      accessToken: "mail-access-token",
      fetcher,
    });
    client.setMailServerPolicy(resolveMailServerPolicy({}));

    await expect(
      client.saveDraft(
        {
          apiUrl: "http://localhost:4001/api/mail/jmap/jmap/",
          accounts: { account: {} },
          primaryAccounts: { "urn:ietf:params:jmap:mail": "account" },
        },
        {
          draftsMailboxId: "drafts-1",
          fromEmail: "alice@solace.onl",
          to: ["bob@example.com"],
          subject: "Plans",
          ciphertext: { blobId: "sealed-draft", size: 512 },
          previousDraftId: "draft-1",
        },
      ),
    ).resolves.toBe("draft-2");

    const draft = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))
      .methodCalls[0][1];
    expect(draft.destroy).toEqual(["draft-1"]);
    expect(draft.create.draft1).toEqual(
      expect.objectContaining({
        subject: "Plans",
        to: [{ email: "bob@example.com" }],
        bodyStructure: expect.objectContaining({ type: "multipart/encrypted" }),
      }),
    );
    expect(draft.create.draft1).not.toHaveProperty("textBody");
    expect(draft.create.draft1).not.toHaveProperty("htmlBody");
    expect(draft.create.draft1).not.toHaveProperty("attachments");
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

  describe("ensureEncryptOnAppendDisabled", () => {
    const session: JmapSession = {
      apiUrl: "http://localhost:4001/api/mail/jmap/",
      accounts: { acc1: { name: "alice@solace.onl" } },
      primaryAccounts: { "urn:ietf:params:jmap:mail": "acc1" },
    };

    it("is a no-op when encryptOnAppend is already disabled", async () => {
      const fetcher = jest.fn<
        (input: string, init?: RequestInit) => Promise<Response>
      >(
        async () =>
          new Response(
            JSON.stringify({
              methodResponses: [
                [
                  "x:AccountSettings/get",
                  {
                    list: [
                      {
                        encryptionAtRest: {
                          "@type": "Enabled",
                          publicKey: "pk-1",
                          headerProtection: "none",
                          encryptOnAppend: false,
                          allowSpamTraining: false,
                        },
                      },
                    ],
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

      await client.ensureEncryptOnAppendDisabled(session);

      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("disables encryptOnAppend while preserving the existing encryption settings", async () => {
      const fetcher = jest
        .fn<(input: string, init?: RequestInit) => Promise<Response>>()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              methodResponses: [
                [
                  "x:AccountSettings/get",
                  {
                    list: [
                      {
                        encryptionAtRest: {
                          "@type": "Enabled",
                          publicKey: "pk-1",
                          headerProtection: "none",
                          encryptOnAppend: true,
                          allowSpamTraining: false,
                        },
                      },
                    ],
                  },
                  "c1",
                ],
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              methodResponses: [
                [
                  "x:AccountSettings/set",
                  { updated: { singleton: null } },
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

      await client.ensureEncryptOnAppendDisabled(session);

      const setBody = JSON.parse(
        String(fetcher.mock.calls[1]?.[1]?.body ?? "{}"),
      );
      expect(setBody.methodCalls[0]).toEqual([
        "x:AccountSettings/set",
        {
          accountId: "acc1",
          update: {
            singleton: {
              encryptionAtRest: {
                "@type": "Enabled",
                publicKey: "pk-1",
                headerProtection: "none",
                encryptOnAppend: false,
                allowSpamTraining: false,
              },
            },
          },
        },
        "c1",
      ]);
    });
  });
});

describe("parallel chunked JMAP requests", () => {
  const session: JmapSession = {
    apiUrl: "http://localhost:4001/api/mail/jmap/",
    accounts: { account: { name: "alice@solace.onl" } },
    primaryAccounts: { "urn:ietf:params:jmap:mail": "account" },
  };

  function trackConcurrency() {
    let inFlight = 0;
    let peak = 0;
    return {
      async run<T>(work: () => T): Promise<T> {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 0));
        inFlight -= 1;
        return work();
      },
      getPeak: () => peak,
    };
  }

  function parseMethodCalls(init?: RequestInit) {
    return (
      JSON.parse(String(init?.body)) as {
        methodCalls: Array<[string, Record<string, unknown>, string]>;
      }
    ).methodCalls;
  }

  it("fetches message chunks in parallel and keeps result order", async () => {
    const tracker = trackConcurrency();
    const fetcher = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(async (_input, init) =>
      tracker.run(() => {
        const ids = (parseMethodCalls(init)[0][1].ids ?? []) as string[];
        return new Response(
          JSON.stringify({
            methodResponses: [
              ["Email/get", { list: ids.map((id) => ({ id })) }, "c1"],
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );
    const client = new StalwartJmapClient({
      baseUrl: "http://localhost:4001/api/mail/jmap",
      accessToken: "mail-access-token",
      fetcher,
    });
    client.setMailServerPolicy(
      resolveMailServerPolicy({ jmapSettings: { getMaxResults: 2 } }),
    );

    const messages = await client.getMessagesByIds(session, [
      "m1",
      "m2",
      "m3",
      "m4",
    ]);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(tracker.getPeak()).toBe(2);
    expect(messages.map((message) => message.id)).toEqual([
      "m1",
      "m2",
      "m3",
      "m4",
    ]);
  });

  it("splits independent bootstrap method calls into parallel requests", async () => {
    const tracker = trackConcurrency();
    const fetcher = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(async (_input, init) =>
      tracker.run(() => {
        const method = parseMethodCalls(init)[0][0];
        const lists: Record<string, unknown[]> = {
          "x:AccountSettings/get": [
            {
              encryptionAtRest: {
                "@type": "Enabled",
                publicKey: "pk-1",
                headerProtection: "none",
                encryptOnAppend: false,
                allowSpamTraining: false,
              },
            },
          ],
          "x:Email/get": [{ uploadMax: 10 }],
          "x:Jmap/get": [{ maxMethodCalls: 16 }],
          "Mailbox/get": [
            {
              id: "inbox",
              name: "Inbox",
              role: "inbox",
              parentId: null,
              sortOrder: 0,
            },
          ],
          "Identity/get": [
            { id: "id-1", email: "alice@solace.onl", name: "Alice" },
          ],
        };
        return new Response(
          JSON.stringify({
            methodResponses: [[method, { list: lists[method] ?? [] }, "c1"]],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );
    const client = new StalwartJmapClient({
      baseUrl: "http://localhost:4001/api/mail/jmap",
      accessToken: "mail-access-token",
      fetcher,
    });
    client.setMailServerPolicy(
      resolveMailServerPolicy({ jmapSettings: { maxMethodCalls: 1 } }),
    );

    const state = await client.bootstrapMailboxState(session);

    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(tracker.getPeak()).toBe(5);
    expect(state).toEqual({
      accountSettings: {
        encryptionAtRest: {
          "@type": "Enabled",
          publicKey: "pk-1",
          headerProtection: "none",
          encryptOnAppend: false,
          allowSpamTraining: false,
        },
      },
      emailSettings: { uploadMax: 10 },
      jmapSettings: { maxMethodCalls: 16 },
      mailboxes: [
        {
          id: "inbox",
          name: "Inbox",
          role: "inbox",
          parentId: null,
          sortOrder: 0,
        },
      ],
      identities: [{ id: "id-1", email: "alice@solace.onl", name: "Alice" }],
    });
  });
});

describe("send retries across client rebuilds", () => {
  const session: JmapSession = { apiUrl: "http://localhost:4001/api/mail/jmap/", accounts: { "runtime-account": {} }, primaryAccounts: { "urn:ietf:params:jmap:mail": "runtime-account" } };
  const input = { sendScope: "random-compose-session", draftsMailboxId: "drafts", sentMailboxId: "sent", fromEmail: "owner@solace.test", to: ["other@solace.test"], subject: "Runtime rebuild", textBody: "", identityId: "identity", pgpMimeCiphertext: { blobId: "sealed-body", size: 50 }, sentCopyCiphertext: null };

  it("reconciles the same pending send after recreating the JMAP client", async () => {
    let submissions = 0;
    let messageId: unknown;
    let submissionToken: unknown;
    const fetcher = jest.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { methodCalls: Array<[string, Record<string, unknown>, string]> };
      const first = body.methodCalls[0];
      if (!first) throw new Error("Missing method");
      const [method, params, id] = first;
      if (method === "Email/set") {
        submissions += 1;
        const create = params.create as { draft1: { messageId: unknown } };
        messageId = create.draft1.messageId;
        const submission = body.methodCalls[1]?.[1].create as { s1: { envelope: { mailFrom: { parameters: { ENVID: unknown } } } } };
        submissionToken = submission.s1.envelope.mailFrom.parameters.ENVID;
        throw new Error("Lost response after acceptance");
      }
      const result = method === "Email/query" ? { ids: ["original"], total: 1, position: 0 }
        : method === "Email/get" ? { list: [{ id: "original", threadId: "thread", messageId }] }
        : method === "EmailSubmission/query" ? { ids: ["receipt"], total: 1, position: 0 }
        : { list: [{ id: "receipt", emailId: "original", undoStatus: "final", envelope: { mailFrom: { parameters: { ENVID: submissionToken } } } }] };
      return new Response(JSON.stringify({ methodResponses: [[method, result, id]] }));
    });
    const build = () => {
      const client = new StalwartJmapClient({ baseUrl: "http://localhost:4001/api/mail/jmap", accessToken: "synthetic-token", fetcher });
      client.setMailServerPolicy(resolveMailServerPolicy({}));
      return client;
    };
    await expect(build().sendMessage(session, input)).rejects.toThrow("Could not confirm whether");
    await expect(build().sendMessage(session, input)).resolves.toEqual({ emailId: "original", threadId: "thread", submissionId: "receipt" });
    expect(submissions).toBe(1);
  });

  it.each([401, 429])("allows explicit retry after HTTP %s without an automatic submission retry", async (status) => {
    let requests = 0;
    const fetcher = jest.fn(async () => {
      requests += 1;
      if (requests === 1) return new Response("Request rejected", { status });
      return new Response(JSON.stringify({ methodResponses: [["Email/set", { created: { draft1: { id: "sent" } } }, "c1"], ["EmailSubmission/set", { created: { s1: { id: "receipt" } } }, "c2"]] }));
    });
    const client = new StalwartJmapClient({ baseUrl: "http://localhost:4001/api/mail/jmap", accessToken: "synthetic-token", fetcher });
    client.setMailServerPolicy(resolveMailServerPolicy({}));
    await expect(client.sendMessage(session, input)).rejects.toThrow();
    expect(requests).toBe(1);
    await expect(client.sendMessage(session, input)).resolves.toMatchObject({ submissionId: "receipt" });
    expect(requests).toBe(2);
  });
});

describe("stale upload refresh fences", () => {
  it("rejects an expired plaintext attachment refresh after deferred authorization without another upload", async () => {
    let current = true;
    let tokenCalls = 0;
    let releaseToken: ((token: string) => void) | undefined;
    let markRefreshing: (() => void) | undefined;
    const refreshing = new Promise<void>((resolve) => { markRefreshing = resolve; });
    const fetcher = jest.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ blobId: "original-blob", size: 1, type: "text/plain" })));
    const client = new StalwartJmapClient({ baseUrl: "http://localhost:4001/api/mail/jmap", getAccessToken: async () => {
      tokenCalls += 1;
      if (tokenCalls === 1) return "synthetic-token";
      markRefreshing?.();
      return new Promise<string>((resolve) => { releaseToken = resolve; });
    }, fetcher });
    const session: JmapSession = { apiUrl: "http://localhost:4001/api/mail/jmap/", uploadUrl: "http://localhost:4001/api/mail/upload/{accountId}/", accounts: { "refresh-account": {} }, primaryAccounts: { "urn:ietf:params:jmap:mail": "refresh-account" } };
    const now = jest.spyOn(Date, "now").mockReturnValue(0);
    try {
      await client.uploadTextBlob(session, "x", "text/plain");
      now.mockReturnValue(7_200_000);
      client.setMailServerPolicy(resolveMailServerPolicy({ jmapSettings: { uploadTtl: 3_600_000 } }));
      const send = client.sendMessage(session, { sendScope: "expired-attachment-session", isCurrent: () => current, draftsMailboxId: "drafts", fromEmail: "owner@solace.test", to: ["other@example.test"], subject: "Attachment", textBody: "Body", attachments: [{ blobId: "original-blob", name: "file.txt", type: "text/plain", size: 1 }], identityId: "identity", sentCopyCiphertext: null });
      await refreshing;
      current = false;
      releaseToken?.("synthetic-token");
      await expect(send).rejects.toThrow("unlocked mailbox changed");
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally { now.mockRestore(); }
  });
});

describe("discarded compose authorization", () => {
  it("lets an already-authorized command finish and refuses new sends on its discarded scope", async () => {
    let releaseToken: ((token: string) => void) | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const fetcher = jest.fn(async () => new Response(JSON.stringify({ methodResponses: [["Email/set", { created: { draft1: { id: "sent" } } }, "c1"], ["EmailSubmission/set", { created: { s1: { id: "accepted" } } }, "c2"]] })));
    const client = new StalwartJmapClient({ baseUrl: "http://localhost:4001/api/mail/jmap", getAccessToken: async () => {
      markStarted?.();
      return new Promise<string>((resolve) => { releaseToken = resolve; });
    }, fetcher });
    client.setMailServerPolicy(resolveMailServerPolicy({}));
    const session: JmapSession = { apiUrl: "http://localhost:4001/api/mail/jmap/", accounts: { owner: {} }, primaryAccounts: { "urn:ietf:params:jmap:mail": "owner" } };
    const input = { sendScope: "discard-pending-session", draftsMailboxId: "drafts", fromEmail: "owner@solace.test", to: ["other@solace.test"], subject: "Discard", textBody: "", pgpMimeCiphertext: { blobId: "sealed", size: 50 }, identityId: "identity", sentCopyCiphertext: null };
    const pending = client.sendMessage(session, input);
    await started;
    discardMailSendAttempt(input.sendScope);
    releaseToken?.("synthetic-token");
    await expect(pending).resolves.toMatchObject({ submissionId: "accepted" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(client.sendMessage(session, input)).rejects.toThrow("finished");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
