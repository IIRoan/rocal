import { describe, expect, it, jest } from "@jest/globals";
import {
  buildDraftMethodCalls,
  buildSendMessageMethodCalls,
  sendJmapMessage,
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
            rcptTo: [{ email: "user2@example.com" }, { email: "cara@example.com" }],
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
          { blobId: "blob-1", name: "a.pdf", type: "application/pdf", size: 10 },
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
          { blobId: "blob-1", name: "a.pdf", type: "application/pdf", disposition: "attachment" },
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
  const queued: JmapMethodCallLike = ["EmailSubmission/set", { created: { s1: { id: "sub-1" } } }, "c2"];
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

  function send(responses: Envelope[], message: OutgoingJmapMessage = external) {
    const request = jest.fn(async (_using: string[], _calls: JmapMethodCallLike[]) => {
      const next = responses.shift();
      if (!next) throw new Error("unexpected request");
      return next;
    });
    const onCleanupError = jest.fn();
    const result = sendJmapMessage(message, {
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
            { created: { draft1: { id: "plain-1", threadId: "t-1" } }, notCreated: { sent1: { type: "tooLarge" } } },
            "c1",
          ],
          queued,
          ["Email/set", { destroyed: ["plain-1"] }, "c2"],
        ],
      },
      { methodResponses: [["Email/set", { destroyed: ["draft-old"] }, "c1"]] },
    ]);

    await expect(result).resolves.toEqual({ emailId: "plain-1", threadId: "t-1", submissionId: "sub-1" });
    expect(onCleanupError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("tooLarge") }));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("destroys the draft it replaces only once the submission is queued, and a failed cleanup never fails the send", async () => {
    const { result, request, onCleanupError } = send([
      {
        methodResponses: [
          ["Email/set", { created: { draft1: { id: "plain-1" }, sent1: { id: "copy-1", threadId: "t-2" } } }, "c1"],
          queued,
          ["Email/set", { destroyed: ["plain-1"] }, "c2"],
        ],
      },
      { methodResponses: [["Email/set", { notDestroyed: { "draft-old": { type: "notFound" } } }, "c1"]] },
    ]);

    await expect(result).resolves.toEqual({ emailId: "copy-1", threadId: "t-2", submissionId: "sub-1" });
    const [[, sendCalls], [, cleanupCalls]] = request.mock.calls;
    expect(sendCalls[0]?.[1]).not.toHaveProperty("destroy");
    expect(cleanupCalls).toEqual([["Email/set", { accountId: "acc", destroy: ["draft-old"] }, "c1"]]);
    expect(onCleanupError).toHaveBeenCalledTimes(1);
  });

  it("keeps the previous draft and removes everything a refused send created", async () => {
    const { result, request } = send([
      {
        methodResponses: [
          ["Email/set", { created: { draft1: { id: "plain-1" }, sent1: { id: "copy-1" } } }, "c1"],
          refused,
        ],
      },
      { methodResponses: [["Email/set", { destroyed: ["plain-1", "copy-1"] }, "c1"]] },
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
        { methodResponses: [["Email/set", { created: { draft1: { id: "sealed-1" } } }, "c1"], refused] },
        { methodResponses: [["Email/set", { destroyed: ["sealed-1"] }, "c1"]] },
      ],
      { ...base, to: ["bob@solace.onl"], pgpMimeCiphertext: { blobId: "blob-abc", size: 4096 }, sentCopyCiphertext: null },
    );

    await expect(result).rejects.toThrow("Quota");
    expect(request.mock.calls[1]?.[1]).toEqual([["Email/set", { accountId: "acc", destroy: ["sealed-1"] }, "c1"]]);
  });

  it("fails when the server returns no submission without saying why", async () => {
    const { result } = send(
      [{ methodResponses: [["Email/set", {}, "c1"], ["EmailSubmission/set", { created: {} }, "c2"]] }],
      base,
    );

    await expect(result).rejects.toThrow("not submitted for delivery");
  });
});
