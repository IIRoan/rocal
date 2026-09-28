import { resolveMailServerPolicy } from "@workspace/calendar-core";
import type { JmapSession } from "./types";
import {
  createPendingComposeAttachment,
  toJmapAttachmentInput,
} from "./compose-attachments";
import {
  buildBearerAuthHeader,
  buildSendMessageMethodCalls,
  getPrimaryMailAccountId,
  normalizeJmapSession,
  StalwartJmapClient,
} from "./jmap-client";

describe("buildBearerAuthHeader", () => {
  it("prefixes and trims the access token", () => {
    expect(buildBearerAuthHeader("  abc123  ")).toBe("Bearer abc123");
  });
});

describe("normalizeJmapSession", () => {
  const session: JmapSession = {
    accounts: { acc1: { name: "Primary" } },
    primaryAccounts: { "urn:ietf:params:jmap:mail": "acc1" },
    apiUrl: "https://mail.internal/jmap/",
    downloadUrl: "https://mail.internal/download/{blobId}",
    uploadUrl: "https://mail.internal/upload/",
    eventSourceUrl: "https://mail.internal/eventsource/",
  };

  it("rewrites all endpoint origins to the discovery base URL", () => {
    const result = normalizeJmapSession(session, "https://proxy.example.com/");
    expect(result.apiUrl).toBe("https://proxy.example.com/jmap/");
    expect(result.downloadUrl).toBe(
      "https://proxy.example.com/download/{blobId}",
    );
    expect(result.uploadUrl).toBe("https://proxy.example.com/upload/");
    expect(result.eventSourceUrl).toBe("https://proxy.example.com/eventsource/");
  });

  it("preserves non-endpoint fields", () => {
    const result = normalizeJmapSession(session, "https://proxy.example.com");
    expect(result.accounts).toEqual(session.accounts);
    expect(result.primaryAccounts).toEqual(session.primaryAccounts);
  });
});

describe("getPrimaryMailAccountId", () => {
  it("prefers the standard mail capability account", () => {
    expect(
      getPrimaryMailAccountId({
        accounts: { a: {}, b: {} },
        primaryAccounts: {
          "urn:ietf:params:jmap:mail": "a",
          "urn:stalwart:jmap": "b",
        },
      }),
    ).toBe("a");
  });

  it("falls back to the stalwart capability, then the first account", () => {
    expect(
      getPrimaryMailAccountId({
        accounts: { first: {} },
        primaryAccounts: { "urn:stalwart:jmap": "stalwart-acc" },
      }),
    ).toBe("stalwart-acc");

    expect(
      getPrimaryMailAccountId({
        accounts: { first: {}, second: {} },
        primaryAccounts: {},
      }),
    ).toBe("first");
  });

  it("returns null when there are no accounts", () => {
    expect(
      getPrimaryMailAccountId({ accounts: {}, primaryAccounts: {} }),
    ).toBeNull();
  });
});

describe("buildSendMessageMethodCalls", () => {
  const base = {
    draftsMailboxId: "drafts",
    fromEmail: "me@example.com",
    to: ["you@example.com"],
    subject: "Hi",
    textBody: "Hello",
    identityId: "identity-1",
  };

  it("creates an Email/set draft and an EmailSubmission/set call", () => {
    const calls = buildSendMessageMethodCalls(base);
    expect(calls).toHaveLength(2);

    const [emailSet, submissionSet] = calls;
    expect(emailSet[0]).toBe("Email/set");
    expect(submissionSet[0]).toBe("EmailSubmission/set");

    const draft = (emailSet[1].create as Record<string, any>).draft1;
    expect(draft.mailboxIds).toEqual({ drafts: true });
    expect(draft.from).toEqual([{ email: "me@example.com" }]);
    expect(draft.to).toEqual([{ email: "you@example.com" }]);
    expect(draft.subject).toBe("Hi");
    expect(draft.bodyStructure).toBeUndefined();
    expect(draft.textBody).toEqual([{ partId: "text", type: "text/plain" }]);
    expect(draft.bodyValues.text.value).toBe("Hello");
  });

  it("parses display-name recipients and sets an explicit submission envelope", () => {
    const calls = buildSendMessageMethodCalls({
      ...base,
      to: ["User Two <user2@solace.onl>"],
    });
    const draft = (calls[0][1].create as Record<string, any>).draft1;
    const submission = (calls[1][1].create as Record<string, any>).s1;

    expect(draft.to).toEqual([
      { name: "User Two", email: "user2@solace.onl" },
    ]);
    expect(submission.envelope).toEqual({
      mailFrom: { email: "me@example.com" },
      rcptTo: [{ email: "user2@solace.onl" }],
    });
  });

  it("moves the message out of drafts into sent on success", () => {
    const calls = buildSendMessageMethodCalls({
      ...base,
      sentMailboxId: "sent",
    });
    const submissionParams = calls[1][1] as Record<string, any>;
    expect(submissionParams.onSuccessUpdateEmail["#s1"]).toEqual({
      "mailboxIds/sent": true,
      "mailboxIds/drafts": null,
      "keywords/$draft": null,
    });
  });

  it("omits cc/bcc and reply headers when not provided", () => {
    const draft = (
      buildSendMessageMethodCalls(base)[0][1].create as Record<string, any>
    ).draft1;
    expect(draft).not.toHaveProperty("cc");
    expect(draft).not.toHaveProperty("bcc");
    expect(draft).not.toHaveProperty("inReplyTo");
    expect(draft).not.toHaveProperty("references");
  });

  it("includes cc, bcc, and threading headers when present", () => {
    const draft = (
      buildSendMessageMethodCalls({
        ...base,
        cc: ["cc@example.com"],
        bcc: ["bcc@example.com"],
        inReplyTo: ["<msg-1@example.com>"],
        references: ["<root@example.com>"],
      })[0][1].create as Record<string, any>
    ).draft1;
    expect(draft.cc).toEqual([{ email: "cc@example.com" }]);
    expect(draft.bcc).toEqual([{ email: "bcc@example.com" }]);
    expect(draft.inReplyTo).toEqual(["<msg-1@example.com>"]);
    expect(draft.references).toEqual(["<root@example.com>"]);
  });

  it("uses top-level attachments when present", () => {
    const draft = (
      buildSendMessageMethodCalls({
        ...base,
        attachments: [
          { blobId: "blob-1", name: "a.pdf", type: "application/pdf", size: 10 },
        ],
      })[0][1].create as Record<string, any>
    ).draft1;
    expect(draft.bodyStructure).toBeUndefined();
    expect(draft.attachments).toEqual([
      {
        blobId: "blob-1",
        name: "a.pdf",
        type: "application/pdf",
        disposition: "attachment",
      },
    ]);
  });

  it("adds an htmlBody part and html bodyValues when HTML is provided", () => {
    const draft = (
      buildSendMessageMethodCalls({
        ...base,
        htmlBody: "<p>Hello <strong>world</strong></p>",
      })[0][1].create as Record<string, any>
    ).draft1;
    expect(draft.htmlBody).toEqual([{ partId: "html", type: "text/html" }]);
    expect(draft.bodyValues.html.value).toBe(
      "<p>Hello <strong>world</strong></p>",
    );
    expect(draft.textBody).toEqual([{ partId: "text", type: "text/plain" }]);
    expect(draft.bodyValues.text.value).toBe("Hello");
  });

  it("keeps htmlBody and top-level attachments on the same draft", () => {
    const draft = (
      buildSendMessageMethodCalls({
        ...base,
        htmlBody: "<p>Hi</p>",
        attachments: [
          { blobId: "blob-2", name: "note.txt", type: "text/plain", size: 4 },
        ],
      })[0][1].create as Record<string, any>
    ).draft1;
    expect(draft.htmlBody).toEqual([{ partId: "html", type: "text/html" }]);
    expect(draft.attachments).toEqual([
      {
        blobId: "blob-2",
        name: "note.txt",
        type: "text/plain",
        disposition: "attachment",
      },
    ]);
  });
});

describe("ensureEncryptOnAppendDisabled", () => {
  const session: JmapSession = {
    apiUrl: "http://localhost:4001/api/mail/jmap/",
    accounts: { acc1: { name: "alice@solace.onl" } },
    primaryAccounts: { "urn:ietf:params:jmap:mail": "acc1" },
  };

  it("is a no-op when encryptOnAppend is already disabled", async () => {
    const fetcher = jest.fn(async () =>
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
      getAccessToken: async () => "mail-access-token",
      fetcher,
    });

    await client.ensureEncryptOnAppendDisabled(session);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("throws when Stalwart refuses to disable encryptOnAppend", async () => {
    const fetcher = jest
      .fn()
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
                {
                  notUpdated: {
                    singleton: { description: "Permission denied" },
                  },
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
      getAccessToken: async () => "mail-access-token",
      fetcher,
    });

    await expect(client.ensureEncryptOnAppendDisabled(session)).rejects.toThrow(
      "Permission denied",
    );
  });
});

function jsonOk(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function parseJmapRequest(init?: RequestInit) {
  return JSON.parse(String(init?.body)) as {
    using: string[];
    methodCalls: Array<[string, Record<string, any>, string]>;
  };
}

describe("StalwartJmapClient mailbox and send implementations", () => {
  const session: JmapSession = {
    apiUrl: "http://localhost:4001/api/mail/jmap/",
    uploadUrl: "http://localhost:4001/api/mail/jmap/upload/{accountId}",
    accounts: { acc1: { name: "alice@solace.onl" } },
    primaryAccounts: { "urn:ietf:params:jmap:mail": "acc1" },
  };

  function createClient(
    fetcher: jest.MockedFunction<(url: string, init?: RequestInit) => Promise<Response>>,
  ) {
    return new StalwartJmapClient({
      baseUrl: "http://localhost:4001/api/mail/jmap",
      getAccessToken: async () => "mail-access-token",
      fetcher,
    });
  }

  it("creates a mailbox with Mailbox/set and returns the created folder", async () => {
    const fetcher = jest.fn(async (_url: string, _init?: RequestInit) =>
      jsonOk({
        methodResponses: [
          [
            "Mailbox/set",
            {
              created: {
                new: { id: "mbx-9", name: "Projects", role: null },
              },
            },
            "c1",
          ],
        ],
      }),
    );
    const created = await createClient(fetcher).createMailbox(
      session,
      "Projects",
    );

    expect(created).toMatchObject({ id: "mbx-9", name: "Projects", role: null });
    const request = parseJmapRequest(fetcher.mock.calls[0][1]);
    expect(request.methodCalls[0][0]).toBe("Mailbox/set");
    expect(request.methodCalls[0][1]).toEqual({
      accountId: "acc1",
      create: { new: { name: "Projects" } },
    });
  });

  it("renames, deletes, and reorders mailboxes through Mailbox/set", async () => {
    const fetcher = jest.fn(async (_url: string, _init?: RequestInit) =>
      jsonOk({ methodResponses: [["Mailbox/set", {}, "c1"]] }),
    );
    const client = createClient(fetcher);

    await client.renameMailbox(session, "mbx-9", "Work");
    await client.deleteMailbox(session, "mbx-9");
    await client.updateMailboxSortOrders(session, [
      { id: "mbx-1", sortOrder: 0 },
      { id: "mbx-2", sortOrder: 1 },
    ]);
    await client.updateMailboxSortOrders(session, []);

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(parseJmapRequest(fetcher.mock.calls[0][1]).methodCalls[0][1]).toEqual({
      accountId: "acc1",
      update: { "mbx-9": { name: "Work" } },
    });
    expect(parseJmapRequest(fetcher.mock.calls[1][1]).methodCalls[0][1]).toEqual({
      accountId: "acc1",
      destroy: ["mbx-9"],
    });
    expect(parseJmapRequest(fetcher.mock.calls[2][1]).methodCalls[0][1]).toEqual({
      accountId: "acc1",
      update: {
        "mbx-1": { sortOrder: 0 },
        "mbx-2": { sortOrder: 1 },
      },
    });
  });

  it("uploads a blob, then sends HTML plus that attachment over JMAP", async () => {
    const pending = createPendingComposeAttachment({
      name: "notes.txt",
      type: "text/plain",
      bytes: new Uint8Array([110, 111, 116, 101]),
    });
    const fetcher = jest.fn(async (url: string, _init?: RequestInit) => {
      if (String(url).includes("/upload/")) {
        return jsonOk({
          blobId: "blob-uploaded",
          type: "text/plain",
          size: pending.bytes.byteLength,
        });
      }
      return jsonOk({
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
          [
            "EmailSubmission/set",
            { created: { s1: { id: "sub-1" } } },
            "c2",
          ],
        ],
      });
    });
    const client = createClient(fetcher);
    client.setMailServerPolicy(resolveMailServerPolicy());

    const uploaded = await client.uploadBlob(
      session,
      pending.bytes,
      pending.type,
    );
    expect(uploaded.blobId).toBe("blob-uploaded");
    expect(fetcher.mock.calls[0][0]).toBe(
      "http://localhost:4001/api/mail/jmap/upload/acc1",
    );
    expect(fetcher.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer mail-access-token",
          "Content-Type": "text/plain",
        }),
      }),
    );

    const sent = await client.sendMessage(session, {
      draftsMailboxId: "drafts",
      sentMailboxId: "sent",
      fromEmail: "me@example.com",
      to: ["you@example.com"],
      subject: "Notes",
      textBody: "Hello world",
      htmlBody: "<p>Hello <strong>world</strong></p>",
      identityId: "identity-1",
      attachments: [toJmapAttachmentInput(pending, uploaded.blobId)],
    });
    expect(sent).toEqual({
      emailId: "email-1",
      threadId: "thread-1",
      submissionId: "sub-1",
    });

    const sendRequest = parseJmapRequest(fetcher.mock.calls[1][1]);
    expect(sendRequest.methodCalls.map((call) => call[0])).toEqual([
      "Email/set",
      "EmailSubmission/set",
    ]);
    const draft = sendRequest.methodCalls[0][1].create.draft1;
    expect(draft.htmlBody).toEqual([{ partId: "html", type: "text/html" }]);
    expect(draft.bodyValues.html.value).toBe(
      "<p>Hello <strong>world</strong></p>",
    );
    expect(draft.attachments).toEqual([
      {
        blobId: "blob-uploaded",
        name: "notes.txt",
        type: "text/plain",
        disposition: "attachment",
      },
    ]);
  });
});

describe("StalwartJmapClient undo, delete, and field search", () => {
  const session: JmapSession = {
    apiUrl: "http://localhost:4001/api/mail/jmap/",
    accounts: { acc1: { name: "alice@solace.onl" } },
    primaryAccounts: { "urn:ietf:params:jmap:mail": "acc1" },
  };

  function createClient(
    fetcher: jest.MockedFunction<(url: string, init?: RequestInit) => Promise<Response>>,
  ) {
    return new StalwartJmapClient({
      baseUrl: "http://localhost:4001/api/mail/jmap",
      getAccessToken: async () => "mail-access-token",
      fetcher,
    });
  }

  it("restores every original mailbox when undoing a move", async () => {
    const fetcher = jest.fn(async (_url: string, _init?: RequestInit) =>
      jsonOk({ methodResponses: [["Email/set", { updated: { m1: null } }, "c1"]] }),
    );
    await createClient(fetcher).restoreMessageMailboxes(session, [
      { id: "m1", mailboxIds: { inbox: true, project: true } },
    ]);

    expect(parseJmapRequest(fetcher.mock.calls[0][1]).methodCalls[0]).toEqual([
      "Email/set",
      {
        accountId: "acc1",
        update: { m1: { mailboxIds: { inbox: true, project: true } } },
      },
      "c1",
    ]);
  });

  it("surfaces a refused restore instead of reporting success", async () => {
    const fetcher = jest.fn(async (_url: string, _init?: RequestInit) =>
      jsonOk({
        methodResponses: [
          [
            "Email/set",
            { notUpdated: { m1: { type: "notFound", description: "Gone" } } },
            "c1",
          ],
        ],
      }),
    );
    await expect(
      createClient(fetcher).restoreMessageMailboxes(session, [
        { id: "m1", mailboxIds: { inbox: true } },
      ]),
    ).rejects.toThrow("Gone");
  });

  it("skips the request when there is nothing to restore or destroy", async () => {
    const fetcher = jest.fn(async (_url: string, _init?: RequestInit) =>
      jsonOk({ methodResponses: [] }),
    );
    const client = createClient(fetcher);
    await client.restoreMessageMailboxes(session, []);
    await client.bulkDestroyMessages(session, []);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects a bulk delete the server refused", async () => {
    const fetcher = jest.fn(async (_url: string, _init?: RequestInit) =>
      jsonOk({
        methodResponses: [
          [
            "Email/set",
            { notDestroyed: { m2: { type: "forbidden", description: "Denied" } } },
            "c1",
          ],
        ],
      }),
    );
    await expect(
      createClient(fetcher).bulkDestroyMessages(session, ["m1", "m2"]),
    ).rejects.toThrow("Denied");
    expect(parseJmapRequest(fetcher.mock.calls[0][1]).methodCalls[0][1]).toEqual({
      accountId: "acc1",
      destroy: ["m1", "m2"],
    });
  });

  it("empties a mailbox by querying and destroying until no ids remain", async () => {
    const fetcher = jest
      .fn<Promise<Response>, [string, RequestInit?]>()
      .mockResolvedValueOnce(
        jsonOk({
          methodResponses: [["Email/query", { ids: ["m1", "m2"], total: 2 }, "q1"]],
        }),
      )
      .mockResolvedValueOnce(
        jsonOk({ methodResponses: [["Email/set", { destroyed: ["m1", "m2"] }, "c1"]] }),
      );
    const count = await createClient(fetcher).emptyMailbox(session, "trash");

    expect(count).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const query = parseJmapRequest(fetcher.mock.calls[0][1]).methodCalls[0];
    expect(query[0]).toBe("Email/query");
    expect(query[1].filter).toEqual({ inMailbox: "trash" });
    expect(parseJmapRequest(fetcher.mock.calls[1][1]).methodCalls[0][1]).toEqual({
      accountId: "acc1",
      destroy: ["m1", "m2"],
    });
  });

  it("sends the field filter to Email/query and returns fetched messages", async () => {
    const fetcher = jest.fn(async (_url: string, _init?: RequestInit) =>
      jsonOk({
        methodResponses: [
          ["Email/query", { ids: ["m1"], total: 1 }, "q1"],
          ["Email/get", { list: [{ id: "m1", subject: "Invoice" }] }, "g1"],
        ],
      }),
    );
    const filter = {
      inMailbox: "inbox",
      from: "alice@example.com",
      after: "2026-02-28T23:00:00Z",
    };
    const result = await createClient(fetcher).searchMailboxMessagesWithFilter(
      session,
      "inbox",
      filter,
      40,
      40,
    );

    expect(result.total).toBe(1);
    expect(result.messages.map((message) => message.id)).toEqual(["m1"]);
    const [queryCall, getCall] = parseJmapRequest(fetcher.mock.calls[0][1]).methodCalls;
    expect(queryCall[1].filter).toEqual(filter);
    expect(queryCall[1]).toMatchObject({ position: 40, limit: 40, calculateTotal: true });
    expect(getCall[1]["#ids"]).toEqual({
      resultOf: "q1",
      name: "Email/query",
      path: "/ids",
    });
  });

  it("caps body values on mailbox pages only when asked", async () => {
    const fetcher = jest.fn(async (_url: string, _init?: RequestInit) =>
      jsonOk({
        methodResponses: [
          ["Email/query", { ids: [], total: 0 }, "q1"],
          ["Email/get", { list: [] }, "g1"],
        ],
      }),
    );
    const client = createClient(fetcher);
    await client.getMailboxMessages(session, "inbox", { position: 0 });
    await client.getMailboxMessages(session, "inbox", {
      position: 30,
      maxBodyValueBytes: 32768,
    });

    const firstGet = parseJmapRequest(fetcher.mock.calls[0][1]).methodCalls[1][1];
    const olderGet = parseJmapRequest(fetcher.mock.calls[1][1]).methodCalls[1][1];
    expect(firstGet).not.toHaveProperty("maxBodyValueBytes");
    expect(olderGet).toMatchObject({
      fetchAllBodyValues: true,
      maxBodyValueBytes: 32768,
    });
  });

  it("loads several threads with one Thread/get and one Email/get", async () => {
    const fetcher = jest.fn(async (_url: string, init?: RequestInit) => {
      const [method] = parseJmapRequest(init).methodCalls[0];
      return jsonOk({
        methodResponses:
          method === "Thread/get"
            ? [
                [
                  "Thread/get",
                  {
                    list: [
                      { id: "t1", emailIds: ["m1", "m2"] },
                      { id: "t2", emailIds: ["m3", "gone"] },
                    ],
                  },
                  "c1",
                ],
              ]
            : [
                [
                  "Email/get",
                  { list: [{ id: "m3" }, { id: "m1" }, { id: "m2" }] },
                  "c1",
                ],
              ],
      });
    });

    const threads = await createClient(fetcher).getThreadsMessages(session, [
      "t1",
      "t2",
    ]);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(parseJmapRequest(fetcher.mock.calls[0][1]).methodCalls[0][1]).toEqual({
      accountId: "acc1",
      ids: ["t1", "t2"],
    });
    expect(
      parseJmapRequest(fetcher.mock.calls[1][1]).methodCalls[0][1].ids,
    ).toEqual(["m1", "m2", "m3", "gone"]);
    expect(threads.get("t1")?.map((message) => message.id)).toEqual(["m1", "m2"]);
    expect(threads.get("t2")?.map((message) => message.id)).toEqual(["m3"]);
  });

  it("skips the network for an empty thread list", async () => {
    const fetcher = jest.fn(async (_url: string, _init?: RequestInit) =>
      jsonOk({ methodResponses: [] }),
    );

    const threads = await createClient(fetcher).getThreadsMessages(session, []);

    expect(threads.size).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("StalwartJmapClient parallel chunked requests", () => {
  const session: JmapSession = {
    apiUrl: "http://localhost:4001/api/mail/jmap/",
    accounts: { acc1: { name: "alice@solace.onl" } },
    primaryAccounts: { "urn:ietf:params:jmap:mail": "acc1" },
  };

  function createClient(
    fetcher: jest.MockedFunction<
      (url: string, init?: RequestInit) => Promise<Response>
    >,
  ) {
    return new StalwartJmapClient({
      baseUrl: "http://localhost:4001/api/mail/jmap",
      getAccessToken: async () => "mail-access-token",
      fetcher,
    });
  }

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

  it("fetches message chunks in parallel and keeps result order", async () => {
    const tracker = trackConcurrency();
    const fetcher = jest.fn(async (_url: string, init?: RequestInit) =>
      tracker.run(() => {
        const ids = (parseJmapRequest(init).methodCalls[0][1].ids ??
          []) as string[];
        return jsonOk({
          methodResponses: [
            ["Email/get", { list: ids.map((id) => ({ id })) }, "c1"],
          ],
        });
      }),
    );
    const client = createClient(fetcher);
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

  it("splits independent method calls into parallel requests", async () => {
    const tracker = trackConcurrency();
    const fetcher = jest.fn(async (_url: string, init?: RequestInit) =>
      tracker.run(() => {
        const method = parseJmapRequest(init).methodCalls[0][0];
        return jsonOk({
          methodResponses: [
            [
              method,
              {
                list:
                  method === "x:Email/get"
                    ? [{ getMaxResults: 50 }]
                    : [{ maxMethodCalls: 16 }],
              },
              "c1",
            ],
          ],
        });
      }),
    );
    const client = createClient(fetcher);
    client.setMailServerPolicy(
      resolveMailServerPolicy({ jmapSettings: { maxMethodCalls: 1 } }),
    );

    const singletons = await client.getStalwartPolicySingletons(session);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(tracker.getPeak()).toBe(2);
    expect(singletons.emailSettings).toEqual({ getMaxResults: 50 });
    expect(singletons.jmapSettings).toEqual({ maxMethodCalls: 16 });
  });
});
