import { describe, expect, it, jest } from "@jest/globals";
import {
  buildSendMessageMethodCalls,
  createMailSendAttempt,
  sendJmapMessage,
  type JmapRequest,
  type OutgoingJmapMessage,
} from "../mail-jmap-email-set";
import {
  resolveMailServerPolicy,
  type JmapMethodCallLike,
} from "../mail-server-policy";

const armor =
  "-----BEGIN PGP MESSAGE-----\n\nU3ludGhldGlj\n-----END PGP MESSAGE-----";
const message: OutgoingJmapMessage = {
  fromEmail: "sender@solace.test",
  to: ["receiver@solace.test"],
  bcc: ["hidden@solace.test"],
  subject: "Synthetic import",
  draftsMailboxId: "drafts",
  sentMailboxId: "sent",
  textBody: "",
  pgpMimeMessage: armor,
  identityId: "identity",
  sentCopyCiphertext: null,
  previousDraftId: "previous",
  contentFingerprint: "a".repeat(64),
  isCurrent: () => true,
};

function response(...methodResponses: JmapMethodCallLike[]) {
  return { methodResponses };
}

function harness() {
  const request = jest
    .fn<JmapRequest>()
    .mockResolvedValueOnce(
      response(
        [
          "Email/import",
          { created: { draft1: { id: "imported", threadId: "thread" } } },
          "c1",
        ],
        [
          "EmailSubmission/set",
          { created: { s1: { id: "submission" } } },
          "c2",
        ],
      ),
    )
    .mockResolvedValue(
      response(["Email/set", { destroyed: ["previous"] }, "c1"]),
    );
  const uploadMessage = jest.fn(async (wire: string) => ({
    blobId: "uploaded",
    size: new TextEncoder().encode(wire).length,
  }));
  const onCleanupError = jest.fn();
  return {
    request,
    uploadMessage,
    context: {
      mailAccountId: "account",
      submissionAccountId: "account",
      policy: null,
      request,
      uploadMessage,
      onCleanupError,
      attempt: createMailSendAttempt(message.fromEmail),
    },
    onCleanupError,
  };
}

describe("encrypted attachment import transport", () => {
  it("uploads complete RFC3156 bytes and submits only a blob reference", async () => {
    const { request, uploadMessage, context } = harness();
    await expect(sendJmapMessage(message, context)).resolves.toEqual({
      emailId: "imported",
      threadId: "thread",
      submissionId: "submission",
    });
    expect(uploadMessage).toHaveBeenCalledTimes(1);
    expect(uploadMessage.mock.calls[0]?.[0]).toContain(
      'protocol="application/pgp-encrypted"',
    );
    const calls = request.mock.calls[0]?.[1];
    expect(calls?.[0]).toEqual([
      "Email/import",
      {
        accountId: "account",
        emails: {
          draft1: {
            blobId: "uploaded",
            mailboxIds: { drafts: true },
            keywords: { $seen: true, $draft: true },
          },
        },
      },
      "c1",
    ]);
    expect(JSON.stringify(calls)).not.toContain("BEGIN PGP");
    expect(calls?.[1]?.[1]).toMatchObject({
      create: {
        s1: {
          emailId: "#draft1",
          identityId: "identity",
          envelope: {
            rcptTo: [
              { email: "receiver@solace.test" },
              { email: "hidden@solace.test" },
            ],
          },
        },
      },
      onSuccessUpdateEmail: {
        "#s1": {
          "mailboxIds/sent": true,
          "mailboxIds/drafts": null,
          "keywords/$draft": null,
        },
      },
    });
    expect(request.mock.calls[1]?.[1]).toEqual([
      ["Email/set", { accountId: "account", destroy: ["previous"] }, "c1"],
    ]);
  });

  it("removes a refused imported object while preserving the previous draft", async () => {
    const { request, context } = harness();
    request
      .mockReset()
      .mockResolvedValueOnce(
        response(
          ["Email/import", { created: { draft1: { id: "imported" } } }, "c1"],
          [
            "EmailSubmission/set",
            { notCreated: { s1: { type: "forbidden" } } },
            "c2",
          ],
        ),
      )
      .mockResolvedValue(
        response(["Email/set", { destroyed: ["imported"] }, "c1"]),
      );
    await expect(sendJmapMessage(message, context)).rejects.toThrow(
      "forbidden",
    );
    expect(request.mock.calls[1]?.[1]).toEqual([
      ["Email/set", { accountId: "account", destroy: ["imported"] }, "c1"],
    ]);
    expect(JSON.stringify(request.mock.calls)).not.toContain(
      '"destroy":["previous"]',
    );
  });

  it("keeps an accepted send successful when later draft cleanup fails", async () => {
    const { request, context, onCleanupError } = harness();
    request.mockRejectedValueOnce(new Error("unreachable"));
    await expect(sendJmapMessage(message, context)).resolves.toMatchObject({
      submissionId: "submission",
    });
    expect(onCleanupError).toHaveBeenCalled();
  });

  it.each([
    { pgpMimeMessage: armor, htmlBody: "<p>plaintext</p>" },
    {
      pgpMimeMessage: armor,
      attachments: [
        { blobId: "plaintext", name: "plain.txt", type: "text/plain", size: 8 },
      ],
    },
    {
      pgpMimeMessage: undefined,
      textBody: armor,
      htmlBody: "<p>plaintext</p>",
    },
    {
      pgpMimeMessage: undefined,
      textBody: armor,
      attachments: [
        { blobId: "plaintext", name: "plain.txt", type: "text/plain", size: 8 },
      ],
    },
    { pgpMimeMessage: armor, sentCopyCiphertext: { blobId: "other", size: 8 } },
  ])(
    "refuses plaintext parts or conflicting encrypted routes before upload",
    async (change) => {
      const { request, uploadMessage, context } = harness();
      await expect(
        sendJmapMessage({ ...message, ...change }, context),
      ).rejects.toThrow();
      expect(uploadMessage).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    },
  );

  it("does not place large encrypted attachments inside the JSON request budget", async () => {
    const { request, context } = harness();
    const policy = resolveMailServerPolicy({
      configPolicy: { maxRequestSizeBytes: 4096, maxMessageSizeBytes: 200_000 },
    });
    const large =
      "-----BEGIN PGP MESSAGE-----\n\n" +
      Array.from({ length: 660 }, () => "A".repeat(76)).join("\n") +
      "\n-----END PGP MESSAGE-----";
    await sendJmapMessage(
      { ...message, pgpMimeMessage: large },
      { ...context, policy },
    );
    expect(
      new TextEncoder().encode(JSON.stringify(request.mock.calls[0]?.[1]))
        .length,
    ).toBeLessThan(4096);
  });

  it("enforces the complete message limit before its blob upload", async () => {
    const { request, uploadMessage, context } = harness();
    const policy = resolveMailServerPolicy({
      configPolicy: { maxMessageSizeBytes: 300 },
    });
    await expect(
      sendJmapMessage(message, { ...context, policy }),
    ).rejects.toThrow("server limit");
    expect(uploadMessage).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("does not permit a raw encrypted payload through the Email/set builder", () => {
    expect(() => buildSendMessageMethodCalls(message)).toThrow(
      "import transport",
    );
  });
});
