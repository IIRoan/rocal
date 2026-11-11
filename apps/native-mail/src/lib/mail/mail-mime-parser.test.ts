import {
  buildOutgoingMimeMessage,
  looksLikeMimeMessage,
} from "@workspace/calendar-core";
import { parseMimeBody } from "./mail-mime-parser";

describe("parseMimeBody", () => {
  it("decodes quoted-printable UTF8, literal Unicode and soft line breaks together", () => {
    const mime =
      "Content-Type: text/plain; charset=utf-8\nContent-Transfer-Encoding: quoted-printable\n\ncafé =E2=82=AC =E2=\n=82=AC";
    expect(parseMimeBody(mime).text).toBe("café € €");
  });

  it("decodes quoted-printable binary attachment bytes without stringifying them", () => {
    const mime =
      "Content-Type: application/octet-stream\nContent-Disposition: attachment; filename=test.bin\nContent-Transfer-Encoding: quoted-printable\n\n=00=FF=41=\nZ";
    expect(parseMimeBody(mime).attachments[0]?.content).toEqual(
      new Uint8Array([0, 255, 65, 90]),
    );
  });

  it("keeps a newline-heavy multipart body readable without an array per line", () => {
    const body = "\n".repeat(2_000_000) + "tail";
    const mime = `Content-Type: multipart/mixed; boundary=flood\n\n--flood\nContent-Type: text/plain\n\n${body}\n--flood--`;
    expect(parseMimeBody(mime).text).toBe(body);
  });

  it("parses encrypted compose MIME from buildOutgoingMimeMessage", () => {
    const mime = buildOutgoingMimeMessage({
      text: "Hello world",
      html: "<p>Hello <strong>world</strong></p>",
    });

    expect(looksLikeMimeMessage(mime)).toBe(true);
    expect(parseMimeBody(mime)).toEqual({
      text: "Hello world",
      html: "<p>Hello <strong>world</strong></p>",
      attachments: [],
    });
  });

  it("extracts text and html from multipart/alternative", () => {
    const mime = [
      "Content-Type: multipart/alternative; boundary=alt",
      "",
      "--alt",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Plain body",
      "--alt",
      "Content-Type: text/html; charset=utf-8",
      "",
      "<p>HTML body</p>",
      "--alt--",
    ].join("\n");

    expect(parseMimeBody(mime)).toEqual({
      text: "Plain body",
      html: "<p>HTML body</p>",
      attachments: [],
    });
  });

  it("extracts base64 attachment with disposition attachment", () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    const base64 = btoa(String.fromCharCode(...pdfBytes));
    const mime = [
      "Content-Type: multipart/mixed; boundary=mix",
      "",
      "--mix",
      "Content-Type: text/plain",
      "",
      "See attached.",
      "--mix",
      'Content-Type: application/pdf; name="doc.pdf"',
      'Content-Disposition: attachment; filename="doc.pdf"',
      "Content-Transfer-Encoding: base64",
      "",
      base64,
      "--mix--",
    ].join("\n");

    const parsed = parseMimeBody(mime);
    expect(parsed.text).toBe("See attached.");
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0]?.name).toBe("doc.pdf");
    expect(parsed.attachments[0]?.type).toBe("application/pdf");
    expect(parsed.attachments[0]?.content).toBeInstanceOf(Uint8Array);
    expect(
      new Uint8Array(parsed.attachments[0]!.content as Uint8Array),
    ).toEqual(pdfBytes);
  });

  it("does not treat inline related parts as attachments", () => {
    const mime = [
      "Content-Type: multipart/related; boundary=rel",
      "",
      "--rel",
      "Content-Type: text/html",
      "",
      '<img src="cid:logo">',
      "--rel",
      'Content-Type: image/png; name="logo.png"',
      "Content-Disposition: inline; filename=logo.png",
      "Content-Transfer-Encoding: base64",
      "",
      "iVBORw0KGgo=",
      "--rel--",
    ].join("\n");

    const parsed = parseMimeBody(mime);
    expect(parsed.attachments).toHaveLength(0);
    expect(parsed.html).toContain("cid:logo");
  });

  it("ignores parts with filename but no attachment disposition", () => {
    const mime = [
      "Content-Type: multipart/mixed; boundary=mix",
      "",
      "--mix",
      'Content-Type: image/png; name="inline.png"',
      "Content-Disposition: inline",
      "Content-Transfer-Encoding: base64",
      "",
      "iVBORw0KGgo=",
      "--mix--",
    ].join("\n");

    expect(parseMimeBody(mime).attachments).toHaveLength(0);
  });
});
it("preserves attached messages as opaque files rather than recursively parsing their contents", () => {
  let message = "Content-Type: text/plain\n\nHello";
  for (let depth = 0; depth < 22; depth += 1)
    message = "Content-Type: message/rfc822\n\n" + message;
  const parsed = parseMimeBody(message);
  expect(parsed.text).toBeNull();
  expect(parsed.attachments).toHaveLength(1);
  expect(parsed.attachments[0]?.name).toBe("message.eml");
  expect(parsed.attachments[0]?.type).toBe("message/rfc822");
});

it("preserves UTF8 bytes in an 8bit attached message", () => {
  const inner =
    "Subject: café 中文\nContent-Type: text/plain; charset=utf-8\n\n🙂";
  const result = parseMimeBody(
    "Content-Type: message/rfc822\nContent-Transfer-Encoding: 8bit\n\n" + inner,
  );
  expect(result.attachments[0]?.content).toEqual(
    new TextEncoder().encode(inner),
  );
});
