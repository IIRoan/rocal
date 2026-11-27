import { describe, expect, it, jest } from "@jest/globals";
import {
  buildSendMessageMethodCalls,
  createMailSendAttempt,
  sendJmapMessage,
  SENT_COPY_CREATION_ID,
  type OutgoingJmapMessage,
} from "../mail-jmap-email-set";
import type { JmapMethodCallLike } from "../mail-server-policy";

const entity = [
  'Content-Type: multipart/signed; micalg=pgp-sha512; protocol="application/pgp-signature"; boundary="b"',
  "",
  "--b",
  "Content-Type: text/plain",
  "",
  "Hi",
  "--b",
  "Content-Type: application/pgp-signature",
  "",
  "-----BEGIN PGP SIGNATURE-----",
  "",
  "AAAA",
  "-----END PGP SIGNATURE-----",
  "",
  "--b--",
  "",
].join("\r\n");

const message: OutgoingJmapMessage = {
  draftsMailboxId: "drafts",
  sentMailboxId: "sent",
  fromEmail: "alice@solace.onl",
  fromName: "Alice",
  to: ["Bob <bob@example.com>"],
  bcc: ["hidden@example.com"],
  subject: "Signed",
  textBody: "",
  identityId: "identity-1",
  signedMimeMessage: entity,
  sentCopyCiphertext: { blobId: "sealed-copy", size: 50 },
  contentFingerprint: "b".repeat(64),
  inReplyTo: ["parent@example.com"],
  references: ["root@example.com", "parent@example.com"],
  previousDraftId: "old-draft",
};

function setup(options: { refuse?: boolean } = {}) {
  const attempt = createMailSendAttempt(message.fromEmail);
  const request = jest.fn(async (_using: string[], calls: JmapMethodCallLike[]) => {
    const method = calls[0]?.[0];
    if (method === "Email/import")
      return {
        methodResponses: [
          ["Email/import", { created: { draft1: { id: "wire", threadId: "t" } } }, "c1"],
          ["Email/set", { created: { [SENT_COPY_CREATION_ID]: { id: "copy", threadId: "t" } } }, "c3"],
          options.refuse
            ? ["EmailSubmission/set", { notCreated: { s1: { type: "forbiddenToSend" } } }, "c2"]
            : ["EmailSubmission/set", { created: { s1: { id: "submission" } } }, "c2"],
        ] as JmapMethodCallLike[],
      };
    if (method === "Email/set")
      return { methodResponses: [[method, { destroyed: calls[0]?.[1].destroy }, "c1"]] as JmapMethodCallLike[] };
    throw new Error("unexpected request");
  });
  const uploadMessage = jest.fn(async (wire: string) => ({ blobId: "wire-blob", size: new TextEncoder().encode(wire).byteLength }));
  const context = { mailAccountId: "account", submissionAccountId: "account", policy: null, request, uploadMessage, attempt, onCleanupError: jest.fn() };
  return { context, request, uploadMessage };
}

describe("signed external send", () => {
  it("imports the signed bytes, stores the sealed Sent copy and destroys the plaintext after submission, in one request", () => {
    const calls = buildSendMessageMethodCalls(
      { ...message, messageId: "id@solace.onl", submissionToken: "a".repeat(32), hold: { until: "2030-01-01T10:00:00Z" } },
      { blobId: "wire-blob", size: 10 },
    );
    expect(calls.map(([method, , id]) => [method, id])).toEqual([
      ["Email/import", "c1"],
      ["Email/set", "c3"],
      ["EmailSubmission/set", "c2"],
    ]);
    expect(calls[0]?.[1]).toEqual({
      emails: { draft1: { blobId: "wire-blob", mailboxIds: { drafts: true }, keywords: { $seen: true, $draft: true } } },
    });
    expect(calls[1]?.[1]).toMatchObject({
      create: {
        [SENT_COPY_CREATION_ID]: {
          mailboxIds: { sent: true },
          keywords: { $seen: true, [`$solace-scheduled-${"a".repeat(32)}`]: true },
          messageId: ["id@solace.onl"],
          inReplyTo: ["parent@example.com"],
          bodyStructure: { type: "multipart/encrypted" },
        },
      },
    });
    expect(calls[2]?.[1]).toMatchObject({
      onSuccessDestroyEmail: ["#s1"],
      create: { s1: { emailId: "#draft1", envelope: { mailFrom: { parameters: { HOLDUNTIL: "2030-01-01T10:00:00Z" } } } } },
    });
  });

  it("refuses the Email/set transport and conflicting body parts", () => {
    expect(() => buildSendMessageMethodCalls(message)).toThrow("import transport");
    expect(() => buildSendMessageMethodCalls({ ...message, htmlBody: "<p>x</p>" }, { blobId: "b", size: 1 })).toThrow("Signed mail");
    expect(() => buildSendMessageMethodCalls({ ...message, sentCopyCiphertext: null }, { blobId: "b", size: 1 })).toThrow("Signed mail");
    expect(() => buildSendMessageMethodCalls({ ...message, textBody: "plain" }, { blobId: "b", size: 1 })).toThrow("Signed mail");
  });

  it("uploads the full RFC 5322 message with threading headers and reports the Sent copy", async () => {
    const { context, request, uploadMessage } = setup();
    await expect(sendJmapMessage(message, context)).resolves.toEqual({ emailId: "copy", threadId: "t", submissionId: "submission" });
    const wire = uploadMessage.mock.calls[0]?.[0] ?? "";
    expect(wire).toMatch(/^From: =\?UTF-8\?B\?QWxpY2U=\?=\r\n <alice@solace\.onl>\r\nTo: /);
    expect(wire).toContain(`Message-ID: <${context.attempt.messageId}>\r\n`);
    expect(wire).toContain("In-Reply-To: <parent@example.com>\r\nReferences: <root@example.com>\r\n <parent@example.com>\r\nMIME-Version: 1.0\r\n");
    expect(wire.endsWith(`MIME-Version: 1.0\r\n${entity}`)).toBe(true);
    expect(request.mock.calls[1]?.[1]).toEqual([["Email/set", { accountId: "account", destroy: ["old-draft"] }, "c1"]]);
  });

  it("caps a scheduled signed send at a day, before anything is uploaded", async () => {
    const { context, uploadMessage } = setup();
    const until = new Date(Date.now() + 2 * 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
    await expect(sendJmapMessage({ ...message, hold: { until } }, context)).rejects.toThrow("Invalid send time.");
    expect(uploadMessage).not.toHaveBeenCalled();
  });

  it("removes what it created when the server refuses the submission", async () => {
    const { context, request } = setup({ refuse: true });
    await expect(sendJmapMessage(message, context)).rejects.toThrow();
    expect(request.mock.calls[1]?.[1]).toEqual([["Email/set", { accountId: "account", destroy: ["wire", "copy"] }, "c1"]]);
  });

  it("refuses a malformed signed entity before upload", async () => {
    const { context, uploadMessage } = setup();
    await expect(sendJmapMessage({ ...message, signedMimeMessage: "Content-Type: text/plain\r\n\r\nHi" }, context)).rejects.toThrow("Signed message");
    expect(uploadMessage).not.toHaveBeenCalled();
  });
});
