import {
  buildPgpMimeMessage,
  type EncryptedMimeHeaders,
} from "../mail-pgp-mime";

const armor =
  "-----BEGIN PGP MESSAGE-----\n\nU3ludGhldGljIHRlc3QgY2lwaGVydGV4dA==\n-----END PGP MESSAGE-----";
const headers: EncryptedMimeHeaders = {
  fromEmail: "sender@solace.test",
  fromName: "Synthetic sender",
  to: ["Receiver <receiver@solace.test>"],
  cc: ["copy@solace.test"],
  bcc: ["hidden@solace.test"],
  subject: "Synthetic subject",
  messageId: "synthetic@solace.test",
  inReplyTo: ["parent@solace.test"],
  references: ["first@solace.test", "parent@solace.test"],
};

function decodeWords(value: string): string {
  return [...value.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)]
    .map((match) =>
      new TextDecoder().decode(
        Uint8Array.from(atob(match[1] ?? ""), (char) => char.charCodeAt(0)),
      ),
    )
    .join("");
}

describe("RFC 3156 import message", () => {
  it("carries explicit protocol, envelope headers and stable reply identifiers", () => {
    const wire = buildPgpMimeMessage(
      headers,
      armor,
      new Date("2026-01-01T12:00:00Z"),
    );
    expect(wire).toContain('protocol="application/pgp-encrypted"');
    expect(wire).toContain("Message-ID: <synthetic@solace.test>\r\n");
    expect(wire).toContain("In-Reply-To: <parent@solace.test>\r\n");
    expect(wire).toContain("Date: Thu, 01 Jan 2026 12:00:00 +0000\r\n");
    expect(wire).toContain("Bcc: <hidden@solace.test>\r\n");
    expect(wire).toContain(armor.replace(/\n/g, "\r\n"));
    expect(wire.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("folds long Unicode subjects at code point boundaries and preserves their meaning", () => {
    const subject = "Résumé 🦉 日本語 ".repeat(30);
    const wire = buildPgpMimeMessage({ ...headers, subject }, armor);
    const subjectHeader = wire.slice(
      wire.indexOf("Subject: "),
      wire.indexOf("\r\nDate:"),
    );
    expect(decodeWords(subjectHeader)).toBe(subject);
    expect(subjectHeader.split("\r\n").every((line) => line.length <= 76)).toBe(
      true,
    );
    for (const word of subjectHeader.match(/=\?UTF-8\?B\?[^?]+\?=/g) ?? []) {
      expect(word.length).toBeLessThanOrEqual(75);
      expect(decodeWords(word)).not.toContain("�");
    }
  });

  it.each([
    { to: ["Name\r\nBcc: victim@example.test <receiver@solace.test>"] },
    { fromEmail: "sender@solace.test\r\nX-Injected: yes" },
    { messageId: "id@solace.test\r\nX-Injected: yes" },
  ])("rejects header injection before upload", (change) => {
    expect(() =>
      buildPgpMimeMessage({ ...headers, ...change }, armor),
    ).toThrow();
  });

  it("normalizes pasted subject/name whitespace without emitting injected headers", () => {
    const wire = buildPgpMimeMessage(
      {
        ...headers,
        subject: "a\tvalue\r\nBcc: text",
        fromName: "Name\nX-Injected: text",
      },
      armor,
    );
    expect(wire).not.toContain("\r\nX-Injected:");
    expect((wire.match(/\r\nBcc:/g) ?? []).length).toBe(1);
    const subject = wire.slice(
      wire.indexOf("Subject: "),
      wire.indexOf("\r\nDate:"),
    );
    expect(decodeWords(subject)).toBe("a value Bcc: text");
  });

  it("drops malformed received references and retains the root plus recent identifiers", () => {
    const references = [
      "bad id",
      "bad\r\nX: value",
      ...Array.from({ length: 120 }, (_, index) => `r${index}@solace.test`),
    ];
    const wire = buildPgpMimeMessage({ ...headers, references }, armor);
    expect(wire).toContain("References: <r0@solace.test>\r\n");
    expect(wire).not.toContain("<r1@solace.test>");
    expect(wire).toContain("<r119@solace.test>");
    expect(wire).not.toContain("bad id");
  });

  it("rejects incomplete or suffixed armor instead of importing a partial object", () => {
    expect(() => buildPgpMimeMessage(headers, armor.slice(0, -10))).toThrow();
    expect(() =>
      buildPgpMimeMessage(headers, armor + "\r\nnot ciphertext"),
    ).toThrow();
    expect(() =>
      buildPgpMimeMessage(
        headers,
        "-----BEGIN PGP MESSAGE-----\n\n" +
          "A".repeat(999) +
          "\n-----END PGP MESSAGE-----",
      ),
    ).toThrow("overlong armor line");
  });
});

it("rejects an overlong sender address before constructing the imported message", () => {
  expect(() =>
    buildPgpMimeMessage(
      {
        fromEmail: `${"a".repeat(255)}@solace.test`,
        to: ["peer@solace.test"],
        subject: "Subject",
        messageId: "fixture@solace.test",
      },
      "-----BEGIN PGP MESSAGE-----\n\nYWJj\n-----END PGP MESSAGE-----",
    ),
  ).toThrow("invalid address");
});
