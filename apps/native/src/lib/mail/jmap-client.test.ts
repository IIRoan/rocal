import type { JmapSession } from "./types";
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
    expect(draft.bodyStructure).toEqual({ type: "text/plain", partId: "text" });
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

  it("builds a multipart/mixed body when attachments are present", () => {
    const draft = (
      buildSendMessageMethodCalls({
        ...base,
        attachments: [
          { blobId: "blob-1", name: "a.pdf", type: "application/pdf", size: 10 },
        ],
      })[0][1].create as Record<string, any>
    ).draft1;
    expect(draft.bodyStructure.type).toBe("multipart/mixed");
    expect(draft.bodyStructure.subParts).toEqual([
      { type: "text/plain", partId: "text" },
      {
        type: "application/pdf",
        blobId: "blob-1",
        name: "a.pdf",
        size: 10,
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
