import type { JmapEmailMessage } from "./types";
import {
  classifyMessageEncryption,
  extractMessageBodies,
  isEncryptedState,
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

describe("isEncryptedState", () => {
  it("treats every non-plain state as encrypted", () => {
    expect(isEncryptedState("plain")).toBe(false);
    expect(isEncryptedState("inline_pgp")).toBe(true);
    expect(isEncryptedState("pgp_mime")).toBe(true);
    expect(isEncryptedState("unknown_encrypted")).toBe(true);
  });
});
