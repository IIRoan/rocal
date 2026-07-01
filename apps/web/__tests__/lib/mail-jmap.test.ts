import { describe, expect, it, jest } from "@jest/globals";
import { resolveMailServerPolicy } from "@workspace/calendar-core";

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
              keywords: { $seen: true, $draft: true },
              from: [{ email: "alice@solace.onl" }],
              to: [{ email: "bob@example.com" }, { email: "cara@example.com" }],
              subject: "Hello",
              textBody: [{ partId: "text", type: "text/plain" }],
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
              envelope: {
                mailFrom: { email: "alice@solace.onl" },
                rcptTo: [
                  { email: "bob@example.com" },
                  { email: "cara@example.com" },
                ],
              },
            },
          },
        },
        "c2",
      ],
    ]);
  });

  it("builds multipart/encrypted body structure for PGP/MIME ciphertext", () => {
    expect(
      buildSendMessageMethodCalls({
        draftsMailboxId: "drafts-1",
        fromEmail: "alice@solace.onl",
        to: ["bob@solace.onl"],
        subject: "Encrypted attachment",
        textBody: "",
        identityId: "identity-1",
        pgpMimeCiphertext: { blobId: "blob-abc", size: 4096 },
      }),
    ).toEqual([
      [
        "Email/set",
        {
          create: {
            draft1: {
              mailboxIds: { "drafts-1": true },
              keywords: { $seen: true, $draft: true },
              from: [{ email: "alice@solace.onl" }],
              to: [{ email: "bob@solace.onl" }],
              subject: "Encrypted attachment",
              bodyStructure: {
                type: "multipart/encrypted",
                subParts: [
                  { type: "application/pgp-encrypted", partId: "pgp-version" },
                  {
                    type: "application/octet-stream",
                    blobId: "blob-abc",
                    size: 4096,
                  },
                ],
              },
              bodyValues: {
                "pgp-version": { value: "Version: 1\r\n" },
              },
            },
          },
        },
        "c1",
      ],
      expect.any(Array),
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
              envelope: {
                mailFrom: { email: "alice@solace.onl" },
                rcptTo: [{ email: "bob@example.com" }],
              },
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

  it("builds html and top-level attachments for multipart messages", () => {
    expect(
      buildSendMessageMethodCalls({
        draftsMailboxId: "drafts-1",
        fromEmail: "alice@solace.onl",
        to: ["bob@example.com"],
        subject: "Files",
        textBody: "See attached",
        htmlBody: "<p>See attached</p>",
        identityId: "identity-1",
        attachments: [
          {
            blobId: "blob-1",
            name: "note.txt",
            type: "text/plain",
            size: 12,
          },
        ],
      }),
    ).toEqual([
      [
        "Email/set",
        {
          create: {
            draft1: expect.objectContaining({
              textBody: [{ partId: "text", type: "text/plain" }],
              htmlBody: [{ partId: "html", type: "text/html" }],
              bodyValues: {
                text: { value: "See attached" },
                html: { value: "<p>See attached</p>" },
              },
              attachments: [
                {
                  blobId: "blob-1",
                  name: "note.txt",
                  type: "text/plain",
                  disposition: "attachment",
                },
              ],
            }),
          },
        },
        "c1",
      ],
      expect.any(Array),
    ]);
  });

  it("includes inline attachments with cid at the top level", () => {
    expect(
      buildSendMessageMethodCalls({
        draftsMailboxId: "drafts-1",
        fromEmail: "alice@solace.onl",
        to: ["bob@example.com"],
        subject: "Inline image",
        textBody: "",
        htmlBody: '<p><img src="cid:img@solace"></p>',
        identityId: "identity-1",
        attachments: [
          {
            blobId: "blob-img",
            name: "inline.png",
            type: "image/png",
            size: 42,
            disposition: "inline",
            cid: "img@solace",
          },
        ],
      }),
    ).toEqual([
      [
        "Email/set",
        {
          create: {
            draft1: expect.objectContaining({
              htmlBody: [{ partId: "html", type: "text/html" }],
              attachments: [
                {
                  blobId: "blob-img",
                  name: "inline.png",
                  type: "image/png",
                  disposition: "inline",
                  cid: "img@solace",
                },
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

    const request = JSON.parse(
      String(fetcher.mock.calls[0]?.[1]?.body),
    ) as { methodCalls: Array<[string, Record<string, unknown>, string]> };
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

    const request = JSON.parse(
      String(fetcher.mock.calls[0]?.[1]?.body),
    ) as { methodCalls: Array<[string, Record<string, unknown>, string]> };
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

    await client.searchMailboxMessages(session, "inbox", "alice@example.com #urgent");

    const request = JSON.parse(
      String(fetcher.mock.calls[0]?.[1]?.body),
    ) as { methodCalls: Array<[string, Record<string, unknown>, string]> };
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
    >(async () =>
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
        textBody: "x".repeat(5_000),
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
        draftsMailboxId: "drafts",
        sentMailboxId: "sent",
        fromEmail: "alice@solace.onl",
        to: ["bob@solace.onl"],
        subject: "Hello",
        textBody: "x".repeat(5_000),
        identityId: "identity-1",
      }),
    ).rejects.toThrow(/exceeds the .* server limit/);
  });

  it("refreshes Stalwart policy before sending a message", async () => {
    const fetcher = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(async () =>
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
        draftsMailboxId: "drafts",
        sentMailboxId: "sent",
        fromEmail: "alice@solace.onl",
        to: ["bob@solace.onl"],
        subject: "Hello",
        textBody: "x".repeat(5_000),
        identityId: "identity-1",
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
          draftsMailboxId: "drafts-1",
          sentMailboxId: "sent-1",
          fromEmail: "alice@solace.onl",
          to: ["bob@example.com"],
          subject: "Hello",
          textBody: "Hello",
          identityId: "identity-1",
        },
      ),
    ).rejects.toThrow("not submitted for delivery");
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
      >(async () =>
        new Response(
          JSON.stringify({
            methodResponses: [
              [
                "x:AccountSettings/get",
                {
                  list: [
                    {
                      encryptionAtRest: {
                        "@type": "Aes256",
                        publicKey: "pk-1",
                        encryptOnAppend: false,
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
                          "@type": "Aes256",
                          publicKey: "pk-1",
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
                "@type": "Aes256",
                publicKey: "pk-1",
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
