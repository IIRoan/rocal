import { getMailSecurityNotice } from "../encryption-notices";

const mail = {
  messageState: "plain" as const,
  accountEncryptedAtRest: false,
  signatureVerificationState: "not_signed" as const,
  decryptionFailed: false,
};

describe("mail encryption notices", () => {
  it("does not treat a mailbox setting as proof that a plaintext message is encrypted", () => {
    const notice = getMailSecurityNotice({
      ...mail,
      accountEncryptedAtRest: true,
    });
    expect(notice.label).toBe("Mailbox encryption enabled");
    expect(notice.description).toContain(
      "does not confirm encryption of this message",
    );
    expect(notice.description).toContain("drafts and sent mail");
  });

  it("does not infer end-to-end origin or attachment protection from inline PGP", () => {
    const notice = getMailSecurityNotice({
      ...mail,
      messageState: "inline_pgp",
    });
    expect(notice.description).toContain(
      "other body parts and attachments may be readable",
    );
    expect(notice.description).toContain("before delivery is not confirmed");
    expect(notice.description).not.toContain("sender encrypted");
  });

  it("allows for server-side encryption when PGP is detected with mailbox encryption enabled", () => {
    const notice = getMailSecurityNotice({
      ...mail,
      messageState: "pgp_mime",
      accountEncryptedAtRest: true,
    });
    expect(notice.description).toContain("after receipt");
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
      "message body and other attachments is not confirmed",
    );
  });

  it("does not claim plaintext mail was unencrypted in transit", () => {
    const notice = getMailSecurityNotice(mail);
    expect(notice.label).toBe("No message encryption detected");
    expect(notice.description).toContain("Transport encryption is separate");
    expect(notice.description).not.toContain("readable in transit");
  });

  it("does not claim successful encryption when local decryption failed", () => {
    expect(
      getMailSecurityNotice({
        ...mail,
        messageState: "inline_pgp",
        accountEncryptedAtRest: true,
        decryptionFailed: true,
      }),
    ).toMatchObject({ label: "Decryption failed", tone: "warning" });
  });
});
