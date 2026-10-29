import { describe, expect, it } from "@jest/globals";
import {
  buildDraftMethodCalls,
  buildSendMessageMethodCalls,
  buildUnsentMessageCleanupMethodCall,
} from "../mail-jmap-email-set";

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

    expect(calls[0][1].destroy).toEqual(["draft-old"]);
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

describe("buildUnsentMessageCleanupMethodCall", () => {
  const sentEmails = [
    "Email/set",
    { created: { draft1: { id: "plain-1" }, sent1: { id: "copy-1" } } },
    "c1",
  ] as [string, unknown, string];

  it("does nothing once the submission was created", () => {
    expect(
      buildUnsentMessageCleanupMethodCall({
        accountId: "acc",
        draftsMailboxId: "drafts",
        methodResponses: [
          sentEmails,
          ["EmailSubmission/set", { created: { s1: { id: "sub-1" } } }, "c2"],
        ],
      }),
    ).toBeNull();
  });

  it("drops the plaintext email and keeps the encrypted copy as the draft when the server refuses the submission", () => {
    expect(
      buildUnsentMessageCleanupMethodCall({
        accountId: "acc",
        draftsMailboxId: "drafts",
        methodResponses: [
          sentEmails,
          [
            "EmailSubmission/set",
            { created: null, notCreated: { s1: { type: "forbiddenFrom" } } },
            "c2",
          ],
        ],
      }),
    ).toEqual([
      "Email/set",
      {
        accountId: "acc",
        destroy: ["plain-1"],
        update: {
          "copy-1": {
            mailboxIds: { drafts: true },
            keywords: { $draft: true, $seen: true },
          },
        },
      },
      "c1",
    ]);
  });

  it("does nothing when no email was created", () => {
    expect(
      buildUnsentMessageCleanupMethodCall({
        accountId: "acc",
        draftsMailboxId: "drafts",
        methodResponses: [["error", { type: "serverFail" }, "c1"]],
      }),
    ).toBeNull();
  });
});
