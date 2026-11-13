import {
  getMailSecurityNotice,
  MAIL_ENCRYPTION_HINT,
  resolveMailMessageContext,
  resolveMailReadState,
} from "../encryption-notices";
import { getMailReadLimitNotice } from "../mail-mime-limits";

const mail = {
  messageState: "plain" as const,
  accountEncryptedAtRest: false,
  signatureVerificationState: "not_signed" as const,
  readState: "decrypted" as const,
};

describe("mail encryption notices", () => {
  it("does not treat a mailbox setting as proof that a plaintext message is encrypted", () => {
    const notice = getMailSecurityNotice({
      ...mail,
      accountEncryptedAtRest: true,
    });
    expect(notice.label).toBe("Mailbox encryption enabled");
    expect(notice.description).toContain(
      "No encrypted message body was detected in this message.",
    );
  });

  it("does not infer end-to-end origin or attachment protection from inline PGP", () => {
    const notice = getMailSecurityNotice({
      ...mail,
      messageState: "inline_pgp",
    });
    expect(notice.description).toContain(
      "Content and attachments outside that payload are not protected by it.",
    );
    expect(notice.description).not.toContain("sender encrypted");
  });

  it("states that incoming mail is encrypted after receipt when mailbox encryption is enabled", () => {
    const notice = getMailSecurityNotice({
      ...mail,
      messageState: "pgp_mime",
      accountEncryptedAtRest: true,
    });
    expect(notice.description).toContain(
      "Solace encrypts ordinary incoming mail after receipt.",
    );
  });

  it("keeps failed signature warnings visible when mailbox encryption is enabled", () => {
    const notice = getMailSecurityNotice({
      ...mail,
      messageState: "pgp_mime",
      accountEncryptedAtRest: true,
      signatureVerificationState: "failed",
    });
    expect(notice.label).toBe("PGP encrypted, signature check failed");
    expect(notice.tone).toBe("warning");
  });

  it("keeps missing-key signatures separate from verified signatures", () => {
    const unverified = getMailSecurityNotice({
      ...mail,
      messageState: "inline_pgp",
      signatureVerificationState: "unverified",
    });
    const verified = getMailSecurityNotice({
      ...mail,
      messageState: "inline_pgp",
      signatureVerificationState: "verified",
    });
    expect(unverified.label).toContain("not verified");
    expect(verified.label).toBe("PGP encrypted & verified");
  });

  it("does not claim that a possible encrypted attachment protects the message body", () => {
    const notice = getMailSecurityNotice({
      ...mail,
      messageState: "unknown_encrypted",
      accountEncryptedAtRest: true,
    });
    expect(notice.label).toBe("Encryption unconfirmed");
    expect(notice.description).toContain(
      "does not establish encryption of the message body",
    );
  });

  it("does not claim plaintext mail was unencrypted in transit", () => {
    const notice = getMailSecurityNotice(mail);
    expect(notice.label).toBe("No message encryption detected");
    expect(notice.description).toContain("transport encryption");
    expect(notice.description).not.toContain("readable in transit");
  });

  it("does not claim successful encryption when local decryption failed", () => {
    expect(
      getMailSecurityNotice({
        ...mail,
        messageState: "inline_pgp",
        accountEncryptedAtRest: true,
        readState: "failed",
      }),
    ).toMatchObject({ label: "Decryption failed", tone: "warning" });
  });

  it("describes body and attachment protection after encrypted MIME is opened", () => {
    const notice = getMailSecurityNotice({ ...mail, messageState: "pgp_mime" });
    expect(notice.description).toContain(
      "The body and attachments inside the encrypted MIME payload are protected.",
    );
    expect(notice.description).not.toContain("readable");
  });

  it.each(["draft", "sent"] as const)(
    "explains device encryption for %s copies without assigning an encryption origin",
    (messageContext) => {
      const notice = getMailSecurityNotice({
        ...mail,
        messageState: "pgp_mime",
        accountEncryptedAtRest: true,
        messageContext,
      });
      expect(notice.description).toContain("on your device before saving them");
      expect(notice.description).not.toContain("after receipt");
    },
  );

  it("does not treat a Sent mailbox location as proof of encryption", () => {
    const notice = getMailSecurityNotice({ ...mail, messageContext: "sent" });
    expect(notice.label).toBe("No message encryption detected");
  });

  it("does not claim decryption before the payload has been opened", () => {
    expect(
      getMailSecurityNotice({
        ...mail,
        messageState: "pgp_mime",
        readState: "pending",
      }),
    ).toMatchObject({ label: "PGP content detected", tone: "plain" });
  });

  it("separates a reading limit from a cryptographic failure, including formatted web errors", () => {
    const error = new Error("Mail MIME exceeds its structural limit.");
    const notice = getMailReadLimitNotice(error);
    for (const readError of [error, notice]) {
      const readState = resolveMailReadState({
        error: readError,
        decrypted: false,
      });
      expect(readState).toBe("read_limit");
      expect(
        getMailSecurityNotice({ ...mail, messageState: "pgp_mime", readState }),
      ).toMatchObject({ label: "Reading limit reached", tone: "plain" });
    }
    expect(
      resolveMailReadState({
        error: new Error("Bad ciphertext"),
        decrypted: false,
      }),
    ).toBe("failed");
    expect(
      resolveMailReadState({
        error: null,
        decrypted: true,
        isDecrypting: true,
      }),
    ).toBe("pending");
    expect(resolveMailReadState({ error: null, decrypted: true })).toBe(
      "decrypted",
    );
  });

  it("uses message membership rather than the currently open folder for copy context", () => {
    const mailboxes = [{ id: "sent", role: "sent" }];
    expect(
      resolveMailMessageContext({ keywords: { $draft: true } }, mailboxes),
    ).toBe("draft");
    expect(
      resolveMailMessageContext({ mailboxIds: { sent: true } }, mailboxes),
    ).toBe("sent");
    expect(
      resolveMailMessageContext({ mailboxIds: { inbox: true } }, mailboxes),
    ).toBe("received");
  });

  it("uses factual encryption copy for every message and reader state", () => {
    expect(MAIL_ENCRYPTION_HINT).toContain("attachments");
    for (const messageState of [
      "plain",
      "inline_pgp",
      "pgp_mime",
      "internal_e2ee",
      "unknown_encrypted",
    ] as const) {
      for (const readState of [
        "pending",
        "decrypted",
        "read_limit",
        "failed",
      ] as const) {
        const notice = getMailSecurityNotice({
          ...mail,
          messageState,
          readState,
          accountEncryptedAtRest: true,
        });
        expect(`${notice.label} ${notice.description}`).not.toMatch(/\bmay\b/i);
      }
    }
    expect(MAIL_ENCRYPTION_HINT).not.toMatch(/\bmay\b/i);
  });
});
