import { buildOutgoingMimeMessage, looksLikeMimeMessage } from "@workspace/calendar-core";
import { parseMimeBody } from "./mail-mime-parser";

describe("parseMimeBody", () => {
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
      "Content-Disposition: attachment; filename=\"doc.pdf\"",
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
    expect(new Uint8Array(parsed.attachments[0]!.content as Uint8Array)).toEqual(pdfBytes);
  });

  it("does not treat inline related parts as attachments", () => {
    const mime = [
      "Content-Type: multipart/related; boundary=rel",
      "",
      "--rel",
      "Content-Type: text/html",
      "",
      "<img src=\"cid:logo\">",
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
