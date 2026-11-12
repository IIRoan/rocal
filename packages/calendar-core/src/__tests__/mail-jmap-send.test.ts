import { describe, expect, it, jest } from "@jest/globals";
import {
  buildDraftMethodCalls,
  buildSendMessageMethodCalls,
  sendJmapMessage,
  createMailSendAttempt,
  createMailSendSessionId,
  createMailSendScopeLifetime,
  getCurrentMailComposeDraftId,
  isMailSendScopeOpen,
  bindMailSendOwner,
  discardMailSendAttempt,
  discardMailSendAction,
  withMailSendCommand,
  getMailSendAttemptStore,
  clearMailSendAttempts,
  completeMailSendAttempt,
  runMailSendAction,
  JmapHttpStatusError,
  type JmapRequest,
  type OutgoingJmapMessage,
} from "../mail-jmap-email-set";
import type { JmapMethodCallLike } from "../mail-server-policy";

const base = {
  draftsMailboxId: "drafts",
  fromEmail: "alice@solace.onl",
  to: ["bob@example.com"],
  subject: "Hi",
  textBody: "Hello",
  identityId: "identity-1",
  sentCopyCiphertext: null,
};

const pgpMimeBody = (blobId: string, size: number) => ({
  bodyStructure: {
    type: "multipart/encrypted",
    subParts: [
      { type: "application/pgp-encrypted", partId: "pgp-version" },
      { type: "application/octet-stream", blobId, size },
    ],
  },
  bodyValues: { "pgp-version": { value: "Version: 1\r\n" } },
});

function createdEmails(calls: ReturnType<typeof buildSendMessageMethodCalls>) {
  return calls[0][1].create as Record<string, Record<string, unknown>>;
}

describe("buildSendMessageMethodCalls", () => {
  it("creates the submitted email and an EmailSubmission with an explicit envelope", () => {
    const calls = buildSendMessageMethodCalls({
      ...base,
      to: ["User Two <user2@example.com>", "cara@example.com"],
      bcc: ["cara@example.com"],
    });

    expect(calls.map(([method, , id]) => [method, id])).toEqual([
      ["Email/set", "c1"],
      ["EmailSubmission/set", "c2"],
    ]);
    expect(createdEmails(calls).draft1).toEqual({
      mailboxIds: { drafts: true },
      keywords: { $seen: true, $draft: true },
      from: [{ email: "alice@solace.onl" }],
      to: [
        { name: "User Two", email: "user2@example.com" },
        { email: "cara@example.com" },
      ],
      bcc: [{ email: "cara@example.com" }],
      subject: "Hi",
      textBody: [{ partId: "text", type: "text/plain" }],
      bodyValues: { text: { value: "Hello" } },
    });
    expect(calls[1][1]).toEqual({
      create: {
        s1: {
          emailId: "#draft1",
          identityId: "identity-1",
          envelope: {
            mailFrom: { email: "alice@solace.onl" },
            rcptTo: [
              { email: "user2@example.com" },
              { email: "cara@example.com" },
            ],
          },
        },
      },
    });
  });

  it("builds html, file and inline attachments with CRLF bodies for plaintext sends", () => {
    const draft = createdEmails(
      buildSendMessageMethodCalls({
        ...base,
        textBody: "Line 1\nLine 2",
        htmlBody: '<p>Hi <img src="cid:img@solace"></p>',
        attachments: [
          {
            blobId: "blob-1",
            name: "a.pdf",
            type: "application/pdf",
            size: 10,
          },
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
    ).draft1;

    expect(draft).toEqual(
      expect.objectContaining({
        textBody: [{ partId: "text", type: "text/plain" }],
        htmlBody: [{ partId: "html", type: "text/html" }],
        bodyValues: {
          text: { value: "Line 1\r\nLine 2" },
          html: { value: '<p>Hi <img src="cid:img@solace"></p>' },
        },
        attachments: [
          {
            blobId: "blob-1",
            name: "a.pdf",
            type: "application/pdf",
            disposition: "attachment",
          },
          {
            blobId: "blob-img",
            name: "inline.png",
            type: "image/png",
            disposition: "inline",
            cid: "img@solace",
          },
        ],
      }),
    );
    expect(draft).not.toHaveProperty("bodyStructure");
  });

  it("sends internal mail as PGP/MIME and moves the encrypted submission to Sent", () => {
    const calls = buildSendMessageMethodCalls({
      ...base,
      to: ["bob@solace.onl"],
      textBody: "",
      sentMailboxId: "sent",
      pgpMimeCiphertext: { blobId: "blob-abc", size: 4096 },
      inReplyTo: ["msg-1@example.com"],
      references: ["root@example.com", "msg-1@example.com"],
      previousDraftId: "draft-old",
    });

    expect(calls[0][1]).not.toHaveProperty("destroy");
    expect(createdEmails(calls)).toEqual({
      draft1: expect.objectContaining({
        inReplyTo: ["msg-1@example.com"],
        references: ["root@example.com", "msg-1@example.com"],
        ...pgpMimeBody("blob-abc", 4096),
      }),
    });
    expect(createdEmails(calls).draft1).not.toHaveProperty("messageId");
    expect(calls[1][1]).toEqual(
      expect.objectContaining({
        onSuccessUpdateEmail: {
          "#s1": {
            "mailboxIds/sent": true,
            "mailboxIds/drafts": null,
            "keywords/$draft": null,
          },
        },
      }),
    );
    expect(calls[1][1]).not.toHaveProperty("onSuccessDestroyEmail");
  });

  it("destroys a plaintext submission once sent and keeps a self-encrypted copy in Sent", () => {
    const calls = buildSendMessageMethodCalls({
      ...base,
      fromName: "Alice",
      cc: ["carol@example.com"],
      sentMailboxId: "sent",
      sentCopyCiphertext: { blobId: "sealed-copy", size: 900 },
      inReplyTo: ["msg-1@example.com"],
      references: ["msg-1@example.com"],
    });
    const { draft1, sent1 } = createdEmails(calls);

    expect(calls[1][1]).toEqual(
      expect.objectContaining({ onSuccessDestroyEmail: ["#s1"] }),
    );
    expect(calls[1][1]).not.toHaveProperty("onSuccessUpdateEmail");
    expect(sent1).toEqual({
      mailboxIds: { sent: true },
      keywords: { $seen: true },
      messageId: draft1.messageId,
      inReplyTo: ["msg-1@example.com"],
      references: ["msg-1@example.com"],
      from: [{ email: "alice@solace.onl", name: "Alice" }],
      to: [{ email: "bob@example.com" }],
      cc: [{ email: "carol@example.com" }],
      subject: "Hi",
      ...pgpMimeBody("sealed-copy", 900),
    });
    expect(draft1.messageId).toEqual([
      expect.stringMatching(/^[0-9a-f]{32}@solace\.onl$/),
    ]);
    expect(JSON.stringify(sent1)).not.toContain("Hello");
  });

  it("never keeps the plaintext submission even without a Sent mailbox", () => {
    const calls = buildSendMessageMethodCalls({
      ...base,
      sentCopyCiphertext: { blobId: "sealed-copy", size: 900 },
    });

    expect(Object.keys(createdEmails(calls))).toEqual(["draft1"]);
    expect(calls[1][1]).toEqual(
      expect.objectContaining({ onSuccessDestroyEmail: ["#s1"] }),
    );
  });
});

describe("buildDraftMethodCalls", () => {
  it("stores a draft as PGP/MIME with readable headers and no plaintext body parts", () => {
    const calls = buildDraftMethodCalls({
      draftsMailboxId: "drafts",
      fromEmail: "alice@solace.onl",
      fromName: "Alice",
      to: ["bob@example.com"],
      bcc: ["eve@example.com"],
      subject: "Plans",
      ciphertext: { blobId: "sealed-draft", size: 512 },
      previousDraftId: "draft-old",
    });

    expect(calls).toEqual([
      [
        "Email/set",
        {
          create: {
            draft1: {
              mailboxIds: { drafts: true },
              keywords: { $draft: true },
              from: [{ email: "alice@solace.onl", name: "Alice" }],
              to: [{ email: "bob@example.com" }],
              bcc: [{ email: "eve@example.com" }],
              subject: "Plans",
              ...pgpMimeBody("sealed-draft", 512),
            },
          },
          destroy: ["draft-old"],
        },
        "c1",
      ],
    ]);
  });
});

describe("sendJmapMessage", () => {
  type Envelope = { methodResponses?: JmapMethodCallLike[] };
  const queued: JmapMethodCallLike = [
    "EmailSubmission/set",
    { created: { s1: { id: "sub-1" } } },
    "c2",
  ];
  const refused: JmapMethodCallLike = [
    "EmailSubmission/set",
    { notCreated: { s1: { type: "forbiddenToSend", description: "Quota" } } },
    "c2",
  ];
  const external = {
    ...base,
    sentMailboxId: "sent",
    sentCopyCiphertext: { blobId: "sealed-copy", size: 900 },
    previousDraftId: "draft-old",
  };

  function send(
    responses: Envelope[],
    message: OutgoingJmapMessage = external,
  ) {
    const request = jest.fn(
      async (_using: string[], _calls: JmapMethodCallLike[]) => {
        const next = responses.shift();
        if (!next) throw new Error("unexpected request");
        return next;
      },
    );
    const onCleanupError = jest.fn();
    const result = sendJmapMessage(message, {
      attempt: createMailSendAttempt(message.fromEmail),
      mailAccountId: "acc",
      submissionAccountId: "acc",
      policy: null,
      request,
      onCleanupError,
    });
    return { result, request, onCleanupError };
  }

  it("reports a queued message as sent when its Sent copy could not be stored", async () => {
    const { result, request, onCleanupError } = send([
      {
        methodResponses: [
          [
            "Email/set",
            {
              created: { draft1: { id: "plain-1", threadId: "t-1" } },
              notCreated: { sent1: { type: "tooLarge" } },
            },
            "c1",
          ],
          queued,
          ["Email/set", { destroyed: ["plain-1"] }, "c2"],
        ],
      },
      { methodResponses: [["Email/set", { destroyed: ["draft-old"] }, "c1"]] },
    ]);

    await expect(result).resolves.toEqual({
      emailId: "plain-1",
      threadId: "t-1",
      submissionId: "sub-1",
    });
    expect(onCleanupError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("tooLarge") }),
    );
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("destroys the draft it replaces only once the submission is queued, and a failed cleanup never fails the send", async () => {
    const { result, request, onCleanupError } = send([
      {
        methodResponses: [
          [
            "Email/set",
            {
              created: {
                draft1: { id: "plain-1" },
                sent1: { id: "copy-1", threadId: "t-2" },
              },
            },
            "c1",
          ],
          queued,
          ["Email/set", { destroyed: ["plain-1"] }, "c2"],
        ],
      },
      {
        methodResponses: [
          [
            "Email/set",
            { notDestroyed: { "draft-old": { type: "notFound" } } },
            "c1",
          ],
        ],
      },
    ]);

    await expect(result).resolves.toEqual({
      emailId: "copy-1",
      threadId: "t-2",
      submissionId: "sub-1",
    });
    const [[, sendCalls], [, cleanupCalls]] = request.mock.calls;
    expect(sendCalls[0]?.[1]).not.toHaveProperty("destroy");
    expect(cleanupCalls).toEqual([
      ["Email/set", { accountId: "acc", destroy: ["draft-old"] }, "c1"],
    ]);
    expect(onCleanupError).toHaveBeenCalledTimes(1);
  });

  it("keeps the previous draft and removes everything a refused send created", async () => {
    const { result, request } = send([
      {
        methodResponses: [
          [
            "Email/set",
            { created: { draft1: { id: "plain-1" }, sent1: { id: "copy-1" } } },
            "c1",
          ],
          refused,
        ],
      },
      {
        methodResponses: [
          ["Email/set", { destroyed: ["plain-1", "copy-1"] }, "c1"],
        ],
      },
    ]);

    await expect(result).rejects.toThrow("Quota");
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]?.[1]).toEqual([
      ["Email/set", { accountId: "acc", destroy: ["plain-1", "copy-1"] }, "c1"],
    ]);
  });

  it("removes the encrypted message of a refused internal send", async () => {
    const { result, request } = send(
      [
        {
          methodResponses: [
            ["Email/set", { created: { draft1: { id: "sealed-1" } } }, "c1"],
            refused,
          ],
        },
        { methodResponses: [["Email/set", { destroyed: ["sealed-1"] }, "c1"]] },
      ],
      {
        ...base,
        textBody: "",
        to: ["bob@solace.onl"],
        pgpMimeCiphertext: { blobId: "blob-abc", size: 4096 },
        sentCopyCiphertext: null,
      },
    );

    await expect(result).rejects.toThrow("Quota");
    expect(request.mock.calls[1]?.[1]).toEqual([
      ["Email/set", { accountId: "acc", destroy: ["sealed-1"] }, "c1"],
    ]);
  });

  it("fails when the server returns no submission without saying why", async () => {
    const { result } = send(
      [
        {
          methodResponses: [
            ["Email/set", {}, "c1"],
            ["EmailSubmission/set", { created: {} }, "c2"],
          ],
        },
      ],
      base,
    );

    await expect(result).rejects.toThrow("Could not confirm whether");
  });
});

describe("compose submission receipts", () => {
  const armor =
    "-----BEGIN PGP MESSAGE-----\n\nYWJj\n-----END PGP MESSAGE-----";
  const message: OutgoingJmapMessage = {
    ...base,
    to: ["bob@solace.onl"],
    textBody: "",
    pgpMimeMessage: armor,
    contentFingerprint: "a".repeat(64),
    sentMailboxId: "sent",
    previousDraftId: "source-draft",
  };

  function setup(
    options: {
      loseResponse?: boolean;
      accepted?: boolean;
      headerIndexed?: boolean;
      recentTotal?: number;
    } = {},
  ) {
    const attempt = createMailSendAttempt(message.fromEmail);
    let imported = false;
    let imports = 0;
    const request = jest.fn(
      async (_using: string[], calls: JmapMethodCallLike[]) => {
        const method = calls[0]?.[0];
        if (method === "Email/import") {
          imported = true;
          imports += 1;
          if (options.loseResponse)
            throw new Error("response lost after queue acceptance");
          return {
            methodResponses: [
              [
                "Email/import",
                {
                  created: { draft1: { id: "imported", threadId: "thread" } },
                },
                "c1",
              ],
              [
                "EmailSubmission/set",
                { created: { s1: { id: "submission" } } },
                "c2",
              ],
            ] as JmapMethodCallLike[],
          };
        }
        if (method === "Email/query" && calls[0]?.[1].position != null)
          return {
            methodResponses: [
              [
                method,
                {
                  ids:
                    imported && options.accepted !== false ? ["imported"] : [],
                  total: imported && options.accepted !== false ? options.recentTotal ?? 1 : 0,
                  position: calls[0]?.[1].position,
                },
                "confirmRecentEmails",
              ],
            ] as JmapMethodCallLike[],
          };
        if (method === "Email/query")
          return {
            methodResponses: [
              [
                method,
                {
                  ids:
                    imported &&
                    options.accepted !== false &&
                    options.headerIndexed !== false
                      ? ["imported"]
                      : [],
                  total:
                    imported &&
                    options.accepted !== false &&
                    options.headerIndexed !== false
                      ? 1
                      : 0,
                  position: 0,
                },
                "confirmEmails",
              ],
            ] as JmapMethodCallLike[],
          };
        if (method === "Email/get")
          return {
            methodResponses: [
              [
                method,
                {
                  list: [
                    {
                      id: "imported",
                      threadId: "thread",
                      messageId: [attempt.messageId],
                    },
                  ],
                },
                "confirmHeaders",
              ],
            ] as JmapMethodCallLike[],
          };
        if (method === "EmailSubmission/query")
          return {
            methodResponses: [
              [method, { ids: options.accepted === false ? [] : ["submission"], total: options.accepted === false ? 0 : 1, position: 0 }, "confirmSubmissions"],
            ] as JmapMethodCallLike[],
          };
        if (method === "EmailSubmission/get")
          return {
            methodResponses: [
              [
                method,
                {
                  list: [
                    {
                      id: "submission",
                      emailId: "imported",
                      undoStatus: "final",
                      envelope: { mailFrom: { parameters: { ENVID: attempt.submissionToken } } },
                    },
                  ],
                },
                "confirmReceipt",
              ],
            ] as JmapMethodCallLike[],
          };
        if (method === "Email/set")
          return {
            methodResponses: [
              [method, { destroyed: calls[0]?.[1].destroy }, "c1"],
            ] as JmapMethodCallLike[],
          };
        throw new Error("unexpected request");
      },
    );
    const uploadMessage = jest.fn(async (wire: string) => ({
      blobId: "wire-blob",
      size: new TextEncoder().encode(wire).byteLength,
    }));
    const context = {
      mailAccountId: "account",
      submissionAccountId: "account",
      policy: null,
      request,
      uploadMessage,
      attempt,
      onCleanupError: jest.fn(),
    };
    return { context, request, uploadMessage, imports: () => imports };
  }

  it("reconciles lost acceptance from headers and submission metadata without resubmitting", async () => {
    const { context, request, uploadMessage, imports } = setup({
      loseResponse: true,
    });
    await expect(sendJmapMessage(message, context)).rejects.toThrow(
      "Could not confirm whether",
    );
    expect(
      request.mock.calls.some(([, calls]) => calls[0]?.[0] === "Email/set"),
    ).toBe(false);
    await expect(sendJmapMessage(message, context)).resolves.toEqual({
      emailId: "imported",
      threadId: "thread",
      submissionId: "submission",
    });
    expect(imports()).toBe(1);
    expect(uploadMessage).toHaveBeenCalledTimes(1);
    expect(uploadMessage.mock.calls[0]?.[0]).toContain(
      `Message-ID: <${context.attempt.messageId}>`,
    );
    const calls = request.mock.calls.flatMap(([, calls]) => calls);
    expect(
      calls.find(([method]) => method === "Email/query")?.[1],
    ).toMatchObject({
      filter: { header: ["Message-ID", context.attempt.messageId] },
    });
    expect(
      calls.find(([method]) => method === "EmailSubmission/get")?.[1],
    ).toMatchObject({ properties: ["id", "emailId", "threadId", "undoStatus", "envelope"] });
    expect(calls.filter(([method]) => method === "Email/set")).toEqual([
      ["Email/set", { accountId: "account", destroy: ["source-draft"] }, "c1"],
    ]);
  });

  it("confirms through bounded header metadata when server Message-ID indexing is unavailable", async () => {
    const { context, request, imports, uploadMessage } = setup({
      loseResponse: true,
      headerIndexed: false,
    });
    await expect(sendJmapMessage(message, context)).rejects.toThrow(
      "Could not confirm whether",
    );
    await expect(sendJmapMessage(message, context)).resolves.toMatchObject({
      emailId: "imported",
      submissionId: "submission",
    });
    expect(
      request.mock.calls.some(
        ([, calls]) => calls[0]?.[2] === "confirmRecentEmails",
      ),
    ).toBe(true);
    expect(imports()).toBe(1);
    expect(uploadMessage).toHaveBeenCalledTimes(1);
  });

  it("confirms exact recent metadata even when the mailbox is larger than the scan cap", async () => {
    const { context, request, imports } = setup({ loseResponse: true, headerIndexed: false, recentTotal: 5_000 });
    await expect(sendJmapMessage(message, context)).rejects.toThrow("Could not confirm whether");
    await expect(sendJmapMessage(message, context)).resolves.toMatchObject({ submissionId: "submission" });
    expect(imports()).toBe(1);
    expect(request.mock.calls.filter(([, calls]) => calls[0]?.[2] === "confirmRecentEmails")).toHaveLength(1);
  });

  it.each([
    { to: ["changed@solace.onl"] },
    { cc: ["changed@solace.onl"] },
    { bcc: ["changed@solace.onl"] },
    { subject: "Edited subject" },
    { fromEmail: "other@solace.onl" },
    { fromName: "Other name" },
    { identityId: "other-identity" },
    { inReplyTo: ["other@solace.onl"] },
    { references: ["other@solace.onl"] },
    { contentFingerprint: "b".repeat(64) },
  ])(
    "preserves edited content when an earlier version was accepted: %p",
    async (edit) => {
      const { context, request, uploadMessage, imports } = setup({
        loseResponse: true,
      });
      await expect(sendJmapMessage(message, context)).rejects.toThrow(
        "Could not confirm whether",
      );
      await expect(
        sendJmapMessage({ ...message, ...edit }, context),
      ).rejects.toThrow("An earlier version");
      expect(imports()).toBe(1);
      expect(uploadMessage).toHaveBeenCalledTimes(1);
      expect(
        request.mock.calls.some(([, calls]) => calls[0]?.[0] === "Email/set"),
      ).toBe(false);
    },
  );

  it("never retries or destroys a source draft while the prior outcome is unknown", async () => {
    const { context, request, uploadMessage, imports } = setup({
      loseResponse: true,
      accepted: false,
    });
    await expect(sendJmapMessage(message, context)).rejects.toThrow(
      "Could not confirm whether",
    );
    await expect(sendJmapMessage(message, context)).rejects.toThrow(
      "Could not confirm whether",
    );
    expect(imports()).toBe(1);
    expect(uploadMessage).toHaveBeenCalledTimes(1);
    expect(
      request.mock.calls.some(([, calls]) => calls[0]?.[0] === "Email/set"),
    ).toBe(false);
  });

  it("coalesces simultaneous sends from one session", async () => {
    const { context, uploadMessage, imports } = setup();
    const [first, second] = await Promise.all([
      sendJmapMessage(message, context),
      sendJmapMessage(message, context),
    ]);
    expect(first).toEqual(second);
    expect(imports()).toBe(1);
    expect(uploadMessage).toHaveBeenCalledTimes(1);
  });

  it("validates raw bytes and metadata budgets before uploading", async () => {
    const { context, uploadMessage } = setup();
    const policy = (
      await import("../mail-server-policy")
    ).resolveMailServerPolicy({ emailSettings: { maxMessageSize: 100 } });
    await expect(
      sendJmapMessage(message, { ...context, policy }),
    ).rejects.toThrow("server limit");
    const metadataPolicy = {
      ...policy,
      limits: { ...policy.limits, maxMessageSizeBytes: 1_000_000 },
      maxRequestSizeBytes: 100,
    };
    await expect(
      sendJmapMessage(message, { ...context, policy: metadataPolicy }),
    ).rejects.toThrow("server limit");
    expect(uploadMessage).not.toHaveBeenCalled();
  });

  it("rejects plaintext beside imported ciphertext before uploading", async () => {
    const { context, uploadMessage, request } = setup();
    await expect(
      sendJmapMessage({ ...message, textBody: "must not disappear" }, context),
    ).rejects.toThrow("silently discard");
    expect(uploadMessage).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
});

describe("account send intent lifetime", () => {
  it("keeps the same attempt across client/store lookups and separates mailboxes", () => {
    clearMailSendAttempts();
    const scope = createMailSendSessionId();
    const first = getMailSendAttemptStore("account-one").get(scope, base.fromEmail);
    expect(getMailSendAttemptStore("account-one").get(scope, base.fromEmail)).toBe(first);
    expect(getMailSendAttemptStore("account-two").get(scope, base.fromEmail)).not.toBe(first);
    first.acknowledged = { emailId: "email", threadId: null, submissionId: "submission" };
    completeMailSendAttempt("account-one", scope);
    expect(() => getMailSendAttemptStore("account-one").get(scope, base.fromEmail)).toThrow("finished");
    clearMailSendAttempts();
    expect(getMailSendAttemptStore("account-one").get(scope, base.fromEmail).messageId).not.toBe(first.messageId);
  });

  it("tombstones discarded scopes before a new command can start", async () => {
    clearMailSendAttempts();
    const scope = createMailSendSessionId();
    discardMailSendAttempt(scope);
    expect(() => getMailSendAttemptStore("discarded-account").get(scope, base.fromEmail)).toThrow("finished");
    const activeScope = createMailSendSessionId();
    const attempt = getMailSendAttemptStore("discarded-account").get(activeScope, base.fromEmail);
    discardMailSendAttempt(activeScope);
    const request = jest.fn<JmapRequest>();
    await expect(sendJmapMessage(base, { attempt, request, mailAccountId: "discarded-account", submissionAccountId: "discarded-account", policy: null, onCleanupError: () => {} })).rejects.toThrow("closed");
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps a pending attempt on same-owner refresh and cancels it when the owner changes", () => {
    clearMailSendAttempts();
    bindMailSendOwner("opaque-owner-one");
    const scope = createMailSendSessionId();
    const previous = getMailSendAttemptStore("mail-account").get(scope, base.fromEmail);
    bindMailSendOwner("opaque-owner-one");
    expect(getMailSendAttemptStore("mail-account").get(scope, base.fromEmail)).toBe(previous);
    bindMailSendOwner("opaque-owner-two");
    expect(previous.cancelled).toBe(true);
    expect(getMailSendAttemptStore("mail-account").get(scope, base.fromEmail)).not.toBe(previous);
  });

  it("drops an explicitly discarded action before its queued callback can send", async () => {
    clearMailSendAttempts();
    const send = jest.fn(async () => {});
    const pending = runMailSendAction("action-owner", "opaque-action", send);
    discardMailSendAction("action-owner", "opaque-action");
    await expect(pending).rejects.toThrow("closed before sending");
    expect(send).not.toHaveBeenCalled();
  });

  it("blocks retirement immediately, revokes StrictMode replay and closes actual unmount", async () => {
    clearMailSendAttempts();
    const scope = createMailSendSessionId();
    const lifetime = createMailSendScopeLifetime();
    const firstCleanup = lifetime.activate(() => scope);
    firstCleanup();
    expect(isMailSendScopeOpen(scope)).toBe(false);
    const actualCleanup = lifetime.activate(() => scope);
    expect(isMailSendScopeOpen(scope)).toBe(true);
    await Promise.resolve();
    expect(isMailSendScopeOpen(scope)).toBe(true);
    actualCleanup();
    expect(isMailSendScopeOpen(scope)).toBe(false);
    await Promise.resolve();
    expect(() => getMailSendAttemptStore("strict-lifetime").get(scope, base.fromEmail)).toThrow("finished");
  });

  it("retires an old scope when a new identity replaces it", async () => {
    clearMailSendAttempts();
    const previous = createMailSendSessionId();
    const next = createMailSendSessionId();
    const lifetime = createMailSendScopeLifetime();
    lifetime.activate(() => previous)();
    lifetime.activate(() => next);
    await Promise.resolve();
    expect(isMailSendScopeOpen(previous)).toBe(false);
    expect(isMailSendScopeOpen(next)).toBe(true);
  });

  it("keeps one current draft reader without quick reply or older cleanup replacing it", () => {
    clearMailSendAttempts();
    let draftId = "first-draft";
    const first = createMailSendScopeLifetime();
    const firstClose = first.activate(() => "compose:first", () => draftId);
    expect(getCurrentMailComposeDraftId()).toBe("first-draft");
    createMailSendScopeLifetime().activate(() => "quick:reply");
    expect(getCurrentMailComposeDraftId()).toBe("first-draft");
    draftId = "saved-draft";
    expect(getCurrentMailComposeDraftId()).toBe("saved-draft");
    const secondClose = createMailSendScopeLifetime().activate(() => "compose:second", () => "replacement");
    firstClose();
    expect(getCurrentMailComposeDraftId()).toBe("replacement");
    secondClose();
    expect(getCurrentMailComposeDraftId()).toBeNull();
    first.activate(() => "compose:third", () => "third");
    clearMailSendAttempts();
    expect(getCurrentMailComposeDraftId()).toBeNull();
  });

  it("coalesces action double clicks, retains failures and allows run after undo", async () => {
    clearMailSendAttempts();
    const scopes: string[] = [];
    let finish: (() => void) | undefined;
    const send = jest.fn(async (scope: string) => {
      scopes.push(scope);
      await new Promise<void>((resolve) => { finish = resolve; });
    });
    const first = runMailSendAction("action-account", "simplelogin:opaque-message", send);
    const concurrent = runMailSendAction("action-account", "simplelogin:opaque-message", send);
    await Promise.resolve();
    finish?.();
    await Promise.all([first, concurrent]);
    expect(send).toHaveBeenCalledTimes(1);
    await runMailSendAction("action-account", "simplelogin:opaque-message", async (scope) => { scopes.push(scope); });
    expect(scopes[1]).not.toBe(scopes[0]);
    const failedScopes: string[] = [];
    await expect(runMailSendAction("action-account", "pending", async (scope) => { failedScopes.push(scope); throw new Error("unknown"); })).rejects.toThrow("unknown");
    await runMailSendAction("action-account", "pending", async (scope) => { failedScopes.push(scope); });
    expect(failedScopes[1]).toBe(failedScopes[0]);
  });
});

describe("external single-batch nonce receipts", () => {
  const message: OutgoingJmapMessage = { ...base, sentMailboxId: "sent", sentCopyCiphertext: { blobId: "sealed-self", size: 50 }, previousDraftId: "source-draft" };
  function harness(options: { loseResponse?: boolean; accepted?: boolean; wrongNonce?: boolean; status?: number; refuse?: string; cleanupFailure?: boolean; windowSize?: number; matchPosition?: number } = {}) {
    const attempt = createMailSendAttempt(message.fromEmail);
    let batches = 0;
    let submissions = 0;
    let status = options.status;
    let refuse = options.refuse;
    let lose = options.loseResponse;
    const request = jest.fn<JmapRequest>(async (_using, calls) => {
      const call = calls[0];
      if (!call) throw new Error("Missing call");
      const [method, params, id] = call;
      const reply = (result: Record<string, unknown>) => ({ methodResponses: [[method, result, id] as JmapMethodCallLike] });
      if (method === "Email/set" && params.create) {
        expect(calls.map(([name]) => name)).toEqual(["Email/set", "EmailSubmission/set"]);
        const create = params.create as Record<string, Record<string, unknown>>;
        expect(create.sent1).toMatchObject({ mailboxIds: { sent: true }, keywords: { $seen: true } });
        const submission = calls[1]?.[1].create as { s1: { emailId: string; envelope: { mailFrom: { parameters: { ENVID: string } } } } };
        expect(submission.s1.emailId).toBe("#draft1");
        expect(submission.s1.envelope.mailFrom.parameters.ENVID).toBe(attempt.submissionToken);
        batches += 1;
        if (status) { const rejected = status; status = undefined; throw new JmapHttpStatusError(rejected, `Rejected ${rejected}`); }
        const created: JmapMethodCallLike = [method, { created: { draft1: { id: "original", threadId: "same-thread" }, sent1: { id: "stored", threadId: "same-thread" } } }, id];
        if (refuse) { const type = refuse; refuse = undefined; return { methodResponses: [created, ["error", { type }, "c2"]] }; }
        if (options.accepted !== false) submissions += 1;
        if (lose) { lose = false; throw new Error("Lost batch response"); }
        return { methodResponses: [created, ["EmailSubmission/set", { created: { s1: { id: "submission" } } }, "c2"]] };
      }
      if (method === "EmailSubmission/query") {
        expect(params.filter).toEqual({ after: new Date((attempt.requestedAt ?? 0) - 48 * 60 * 60_000).toISOString(), before: new Date((attempt.requestedAt ?? 0) + 48 * 60 * 60_000).toISOString() });
        expect(params).not.toHaveProperty("sort");
        const position = Number(params.position ?? 0);
        if (options.windowSize) {
          const length = Math.min(Number(params.limit), options.windowSize - position);
          const ids = Array.from({ length: Math.max(0, length) }, (_, index) => position + index === options.matchPosition ? "submission" : `noise-${position + index}`);
          return reply({ ids, total: options.windowSize, position });
        }
        return reply({ ids: options.accepted === false ? [] : ["submission"], total: options.accepted === false ? 0 : 1, position: 0 });
      }
      if (method === "EmailSubmission/get") return reply({ list: (params.ids as string[]).map((submissionId) => ({ id: submissionId, emailId: "original", threadId: "same-thread", undoStatus: "final", envelope: { mailFrom: { parameters: { ENVID: options.wrongNonce || submissionId !== "submission" ? "other-nonce" : attempt.submissionToken } } } })) });
      if (method === "Email/query") return reply({ ids: ["stored"], total: 1, position: 0 });
      if (method === "Email/get") return reply({ list: [{ id: "stored", threadId: "same-thread", messageId: [attempt.messageId] }] });
      if (method === "Email/set" && params.destroy) {
        if (options.cleanupFailure) throw new Error("Cleanup failed");
        return reply({ destroyed: params.destroy });
      }
      throw new Error("Unexpected call");
    });
    return { request, attempt, context: { mailAccountId: "external-account", submissionAccountId: "external-account", attempt, request, policy: null, onCleanupError: jest.fn() }, batches: () => batches, submissions: () => submissions };
  }

  it("submits external mail in one request and recovers its exact nonce after response loss", async () => {
    const h = harness({ loseResponse: true });
    await expect(sendJmapMessage(message, h.context)).rejects.toThrow("Could not confirm whether");
    expect(JSON.stringify(h.request.mock.calls)).not.toContain('"destroy":["source-draft"]');
    await expect(sendJmapMessage(message, h.context)).resolves.toEqual({ emailId: "stored", threadId: "same-thread", submissionId: "submission" });
    expect(h.batches()).toBe(1);
    expect(h.submissions()).toBe(1);
  });

  it.each([{ accepted: false }, { wrongNonce: true }])("does not infer acceptance from a Sent copy or the same thread: %p", async (options) => {
    const h = harness({ loseResponse: true, ...options });
    await expect(sendJmapMessage(message, h.context)).rejects.toThrow("Could not confirm whether");
    await expect(sendJmapMessage(message, h.context)).rejects.toThrow("A copy in Sent does not confirm queue acceptance or delivery");
    expect(h.batches()).toBe(1);
    expect(JSON.stringify(h.request.mock.calls)).not.toContain('"destroy":["source-draft"]');
  });

  it("paginates only the original time window and finds the exact nonce on a later page", async () => {
    const h = harness({ loseResponse: true, windowSize: 250, matchPosition: 150 });
    await expect(sendJmapMessage(message, h.context)).rejects.toThrow("Could not confirm whether");
    const originalTime = h.attempt.requestedAt;
    const now = jest.spyOn(Date, "now").mockReturnValue((originalTime ?? 0) + 86_400_000);
    try {
      await expect(sendJmapMessage(message, h.context)).resolves.toMatchObject({ submissionId: "submission" });
      expect(h.attempt.requestedAt).toBe(originalTime);
      expect(h.request.mock.calls.filter(([, calls]) => calls[0]?.[0] === "EmailSubmission/query")).toHaveLength(2);
      expect(h.batches()).toBe(1);
    } finally { now.mockRestore(); }
  });

  it("respects configured query and get limits during receipt confirmation", async () => {
    const h = harness({ loseResponse: true, windowSize: 6, matchPosition: 3 });
    const policy = (await import("../mail-server-policy")).resolveMailServerPolicy({ jmapSettings: { getMaxResults: 2, queryMaxResults: 5 } });
    const context = { ...h.context, policy };
    await expect(sendJmapMessage(message, context)).rejects.toThrow("Could not confirm whether");
    await expect(sendJmapMessage(message, context)).resolves.toMatchObject({ submissionId: "submission" });
    for (const [, calls] of h.request.mock.calls) for (const [method, params] of calls) {
      if (method.endsWith("/query")) expect(params.limit).toBeLessThanOrEqual(2);
      if (method.endsWith("/get")) expect((params.ids as string[]).length).toBeLessThanOrEqual(2);
    }
    expect(h.batches()).toBe(1);
  });

  it.each([-36, 36])("allows a device clock skew of %s hours without weakening nonce matching", async (hours) => {
    const h = harness({ loseResponse: true });
    await expect(sendJmapMessage(message, h.context)).rejects.toThrow("Could not confirm whether");
    const serverTime = (h.attempt.requestedAt ?? 0) + hours * 60 * 60_000;
    await expect(sendJmapMessage(message, h.context)).resolves.toMatchObject({ submissionId: "submission" });
    const query = h.request.mock.calls.find(([, calls]) => calls[0]?.[0] === "EmailSubmission/query")?.[1][0]?.[1].filter as { after: string; before: string };
    expect(Date.parse(query.after)).toBeLessThan(serverTime);
    expect(Date.parse(query.before)).toBeGreaterThan(serverTime);
    expect(h.batches()).toBe(1);
  });

  it.each([null, "different-draft"])("cleans the accepted draft after its editor retires while current draft is %s", async (currentId) => {
    const h = harness();
    await expect(sendJmapMessage({ ...message, isUiCurrent: () => false, getCurrentDraftId: () => currentId }, h.context)).resolves.toMatchObject({ submissionId: "submission" });
    expect(h.request.mock.calls.some(([, calls]) => JSON.stringify(calls[0]?.[1].destroy) === '["source-draft"]')).toBe(true);
  });

  it("cleans its own settled draft on ordinary same-editor success", async () => {
    const h = harness();
    await expect(sendJmapMessage({ ...message, isUiCurrent: () => true, getCurrentDraftId: () => "source-draft" }, h.context)).resolves.toMatchObject({ submissionId: "submission" });
    expect(h.request.mock.calls.some(([, calls]) => JSON.stringify(calls[0]?.[1].destroy) === '["source-draft"]')).toBe(true);
  });

  it("preserves the settled draft if a replacement editor is currently using that same ID", async () => {
    const h = harness();
    await expect(sendJmapMessage({ ...message, isUiCurrent: () => false, getCurrentDraftId: () => "source-draft" }, h.context)).resolves.toMatchObject({ submissionId: "submission" });
    expect(h.request).toHaveBeenCalledTimes(1);
  });

  it("keeps an over-cap nonce search unknown without retrying the submission", async () => {
    const h = harness({ loseResponse: true, windowSize: 2_000, matchPosition: 1_500 });
    await expect(sendJmapMessage(message, h.context)).rejects.toThrow("Could not confirm whether");
    await expect(sendJmapMessage(message, h.context)).rejects.toThrow("Could not confirm whether");
    expect(h.request.mock.calls.filter(([, calls]) => calls[0]?.[0] === "EmailSubmission/query")).toHaveLength(10);
    expect(h.batches()).toBe(1);
  });

  it.each([400, 401, 403, 413, 429])("resets a definitive HTTP%s refusal without any mailbox scan", async (status) => {
    const h = harness({ status });
    await expect(sendJmapMessage(message, h.context)).rejects.toThrow(`Rejected ${status}`);
    expect(h.attempt.mayHaveSubmitted).toBe(false);
    expect(h.request).toHaveBeenCalledTimes(1);
    await expect(sendJmapMessage(message, h.context)).resolves.toMatchObject({ submissionId: "submission" });
    expect(h.request.mock.calls.some(([, calls]) => calls[0]?.[0].endsWith("/query"))).toBe(false);
    expect(h.submissions()).toBe(1);
  });

  it.each(["invalidResultReference", "accountNotSupportedByMethod", "accountReadOnly", "requestTooLarge"])("allows explicit retry after definitive c2 %s", async (refuse) => {
    const h = harness({ refuse });
    await expect(sendJmapMessage(message, h.context)).rejects.toThrow(refuse);
    expect(h.attempt.mayHaveSubmitted).toBe(false);
    await expect(sendJmapMessage(message, h.context)).resolves.toMatchObject({ submissionId: "submission" });
    expect(h.submissions()).toBe(1);
  });

  it("keeps current edits and draft when the earlier accepted version already has its encrypted Sent copy", async () => {
    const h = harness({ loseResponse: true });
    await expect(sendJmapMessage(message, h.context)).rejects.toThrow("Could not confirm whether");
    await expect(sendJmapMessage({ ...message, textBody: "New edits", previousDraftId: "current-draft", isUiCurrent: () => false, getCurrentDraftId: () => "other-draft" }, h.context)).rejects.toThrow("An earlier version");
    expect(h.submissions()).toBe(1);
    expect(JSON.stringify(h.request.mock.calls)).not.toContain('"destroy":["current-draft"]');
    expect(h.request.mock.calls.some(([, calls]) => calls[0]?.[1].update)).toBe(false);
  });

  it("keeps known acceptance successful when encrypted source-draft cleanup fails", async () => {
    const h = harness({ cleanupFailure: true });
    await expect(sendJmapMessage(message, h.context)).resolves.toMatchObject({ submissionId: "submission" });
    await expect(sendJmapMessage(message, h.context)).resolves.toMatchObject({ submissionId: "submission" });
    expect(h.submissions()).toBe(1);
    expect(h.context.onCleanupError).toHaveBeenCalled();
  });

  it("finishes an authorized in-flight command after discard while preserving a replacement draft", async () => {
    clearMailSendAttempts();
    const scope = createMailSendSessionId();
    const attempt = getMailSendAttemptStore("discard-in-flight").get(scope, message.fromEmail);
    let release: (() => void) | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const request = jest.fn<JmapRequest>(async () => {
      markStarted?.();
      await new Promise<void>((resolve) => { release = resolve; });
      return { methodResponses: [["Email/set", { created: { draft1: { id: "original" }, sent1: { id: "stored" } } }, "c1"], ["EmailSubmission/set", { created: { s1: { id: "accepted" } } }, "c2"]] };
    });
    const sending = withMailSendCommand(attempt, () => sendJmapMessage({ ...message, isUiCurrent: () => isMailSendScopeOpen(scope), getCurrentDraftId: () => "source-draft" }, { attempt, request, mailAccountId: "discard-in-flight", submissionAccountId: "discard-in-flight", policy: null, onCleanupError: () => {} }));
    await started;
    discardMailSendAttempt(scope);
    expect(attempt.cancelled).toBe(false);
    expect(() => getMailSendAttemptStore("discard-in-flight").get(scope, message.fromEmail)).toThrow("finished");
    release?.();
    await expect(sending).resolves.toMatchObject({ emailId: "stored", submissionId: "accepted" });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each(["", "abc", "A".repeat(64)])("rejects a malformed present fingerprint before submitting", async (contentFingerprint) => {
    const h = harness();
    await expect(sendJmapMessage({ ...message, contentFingerprint }, h.context)).rejects.toThrow("fingerprint");
    expect(h.request).not.toHaveBeenCalled();
  });
});
