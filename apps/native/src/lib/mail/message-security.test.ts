import type { JmapEmailMessage } from "./types";
import {
  classifyMessageEncryption,
  extractMessageBodies,
  isEncryptedState,
  isHiddenAttachment,
  messageHasVisibleAttachments,
  resolveDisplayAttachments,
} from "./message-security";

function message(
  partial: Partial<JmapEmailMessage>,
): JmapEmailMessage {
  return { id: "msg-1", ...partial };
}

describe("extractMessageBodies", () => {
  it("reads text and html parts from bodyValues", () => {
    const result = extractMessageBodies(
      message({
        textBody: [{ partId: "t" }],
        htmlBody: [{ partId: "h" }],
        bodyValues: {
          t: { value: "plain text" },
          h: { value: "<p>html</p>" },
        },
      }),
    );
    expect(result).toEqual({ text: "plain text", html: "<p>html</p>" });
  });

  it("falls back to the first non-empty body value, stripping html", () => {
    const result = extractMessageBodies(
      message({
        bodyValues: {
          x: { value: "<div>Hello <b>world</b></div>" },
        },
      }),
    );
    expect(result.html).toBe("<div>Hello <b>world</b></div>");
    expect(result.text).toBe("Hello world");
  });

  it("treats a plain fallback value as text only", () => {
    const result = extractMessageBodies(
      message({ bodyValues: { x: { value: "just words" } } }),
    );
    expect(result).toEqual({ text: "just words", html: null });
  });

  it("returns nulls when there is no body content", () => {
    expect(extractMessageBodies(message({}))).toEqual({
      text: null,
      html: null,
    });
  });
});

describe("classifyMessageEncryption", () => {
  it("classifies plaintext messages as plain", () => {
    expect(
      classifyMessageEncryption(
        message({
          textBody: [{ partId: "t" }],
          bodyValues: { t: { value: "hello there" } },
        }),
      ),
    ).toBe("plain");
  });

  it("detects inline PGP message blocks", () => {
    expect(
      classifyMessageEncryption(
        message({
          textBody: [{ partId: "t" }],
          bodyValues: {
            t: { value: "before\n-----BEGIN PGP MESSAGE-----\nx" },
          },
        }),
      ),
    ).toBe("inline_pgp");
  });

  it("detects multipart/encrypted PGP MIME", () => {
    expect(
      classifyMessageEncryption(
        message({ bodyStructure: { type: "multipart/encrypted" } }),
      ),
    ).toBe("pgp_mime");
  });

  it.each([
    ["application/pgp-encrypted", "blob"],
    ["application/pgp-keys", "key"],
  ])("flags attachments with PGP mime type %s", (type, name) => {
    expect(
      classifyMessageEncryption(message({ attachments: [{ type, name }] })),
    ).toBe("unknown_encrypted");
  });

  it.each([["secret.asc"], ["secret.pgp"], ["secret.gpg"]])(
    "flags %s attachments as encrypted",
    (name) => {
      expect(
        classifyMessageEncryption(
          message({ attachments: [{ name, type: "application/octet-stream" }] }),
        ),
      ).toBe("unknown_encrypted");
    },
  );

  it("does not flag generic binary or smime signature attachments", () => {
    expect(
      classifyMessageEncryption(
        message({
          attachments: [
            { name: "report.pdf", type: "application/octet-stream" },
            { name: "smime.p7s", type: "application/pkcs7-signature" },
          ],
        }),
      ),
    ).toBe("plain");
  });
});

describe("isHiddenAttachment", () => {
  it.each([
    [{ type: "application/pgp-encrypted", name: "x" }, true],
    [{ type: "application/pgp-keys", name: "key" }, true],
    [{ type: "application/octet-stream", name: "encrypted.asc" }, true],
    [{ type: "application/octet-stream", name: "file.pgp" }, true],
    [{ type: "application/octet-stream", name: "file.gpg" }, true],
    [{ type: "application/pdf", name: "report.pdf" }, false],
    [{ type: "application/pkcs7-signature", name: "smime.p7s" }, false],
  ])("flags %j as hidden=%s", (attachment, hidden) => {
    expect(isHiddenAttachment(attachment)).toBe(hidden);
  });
});

describe("messageHasVisibleAttachments", () => {
  it("ignores hidden PGP control attachments", () => {
    expect(
      messageHasVisibleAttachments({
        attachments: [
          { name: "encrypted.asc", type: "application/octet-stream" },
        ],
      }),
    ).toBe(false);
    expect(
      messageHasVisibleAttachments({
        attachments: [{ name: "logo.png", type: "image/png" }],
      }),
    ).toBe(true);
  });
});

describe("resolveDisplayAttachments", () => {
  const pdf = { name: "doc.pdf", type: "application/pdf" };
  const pgpControl = { name: "encrypted.asc", type: "application/octet-stream" };

  it("hides envelope attachments while PGP/MIME decrypts", () => {
    expect(
      resolveDisplayAttachments({
        encryption: "pgp_mime",
        isDecrypting: true,
        decryptSucceeded: false,
        messageAttachments: [pgpControl, pdf],
      }),
    ).toEqual([]);
  });

  it("uses decrypted attachments after PGP/MIME decrypt", () => {
    expect(
      resolveDisplayAttachments({
        encryption: "pgp_mime",
        isDecrypting: false,
        decryptSucceeded: true,
        decryptedAttachments: [pdf],
        messageAttachments: [pgpControl],
      }),
    ).toEqual([pdf]);
  });

  it("does not fall back to envelope attachments after PGP/MIME decrypt", () => {
    expect(
      resolveDisplayAttachments({
        encryption: "pgp_mime",
        isDecrypting: false,
        decryptSucceeded: true,
        decryptedAttachments: [],
        messageAttachments: [pgpControl, pdf],
      }),
    ).toEqual([]);
  });

  it("filters hidden parts on plain messages", () => {
    expect(
      resolveDisplayAttachments({
        encryption: "plain",
        isDecrypting: false,
        decryptSucceeded: false,
        messageAttachments: [pgpControl, pdf],
      }),
    ).toEqual([pdf]);
  });
});

describe("isEncryptedState", () => {
  it("treats every non-plain state as encrypted", () => {
    expect(isEncryptedState("plain")).toBe(false);
    expect(isEncryptedState("inline_pgp")).toBe(true);
    expect(isEncryptedState("pgp_mime")).toBe(true);
    expect(isEncryptedState("unknown_encrypted")).toBe(true);
  });
});
