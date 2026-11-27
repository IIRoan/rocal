import { describe, expect, it } from "@jest/globals";
import {
  buildEmbeddedSignatureHtml,
  dropInlineImagePlaceholders,
  buildForwardQuoteHtml,
  buildReplyQuoteHtml,
  composeHtmlToPlainText,
  extractComposeInlineImages,
  htmlHasUnhydratedInlinePlaceholders,
  INLINE_IMAGE_PLACEHOLDER,
  markComposeCidImages,
  placeComposeQuote,
  plainTextToComposeHtml,
  prepareQuotedComposeHtml,
  replaceInlineImagePlaceholders,
} from "./mail-compose-html";
import { buildOutgoingMimeMessage } from "./outgoing-mime";
import { parseMailMimeContent } from "./mail-mime-parser";

const PNG_BASE64 = "iVBORw0KGgo=";

describe("composeHtmlToPlainText", () => {
  it("keeps paragraphs, line breaks, lists and link targets", () => {
    const text = composeHtmlToPlainText(
      '<p>Hi <strong>Sam</strong>,</p><p>Line one<br>Line two</p><ul><li>Apples</li><li>Pears</li></ul><ol><li>First</li><li>Second</li></ol><p>See <a href="https://solace.onl/docs">the docs</a> or <a href="https://solace.onl">https://solace.onl</a>.</p>',
    );
    expect(text).toBe(
      "Hi Sam,\n\nLine one\nLine two\n\n- Apples\n- Pears\n\n1. First\n2. Second\n\nSee the docs <https://solace.onl/docs> or https://solace.onl.",
    );
  });

  it("quotes a reply's original with > and leaves a forward unquoted", () => {
    const reply = composeHtmlToPlainText(
      `<p>Thanks</p>${buildReplyQuoteHtml({ date: "Nov 16", sender: "Maestro", quoteHtml: "<p>Original</p><blockquote><p>Older</p></blockquote>" })}`,
    );
    expect(reply).toBe("Thanks\n\nOn Nov 16, Maestro wrote:\n\n> Original\n>\n> > Older");

    const forward = composeHtmlToPlainText(
      buildForwardQuoteHtml({ from: "peer@solace.test", date: "Nov 16", subject: "Plans", quoteHtml: "<p>Forwarded body</p>" }),
    );
    expect(forward).toContain("From: peer@solace.test\nDate: Nov 16\nSubject: Plans");
    expect(forward).toContain("\nForwarded body");
    expect(forward).not.toContain("> Forwarded body");
  });

  it("keeps the signature delimiter's trailing space and decodes entities", () => {
    const html = `<p>Body &amp; more&nbsp;text</p>${buildEmbeddedSignatureHtml({ textSignature: "Sam\nSolace" }, { separator: true })}`;
    expect(composeHtmlToPlainText(html)).toBe("Body & more text\n\n-- \nSam\nSolace");
  });

  it("drops scripts and styles and names images by their alt text", () => {
    expect(
      composeHtmlToPlainText('<style>p{color:red}</style><p>Look<img src="cid:a" alt="chart"></p><script>x()</script>'),
    ).toBe("Look[chart]");
  });

  it("puts no quote marker on the blank line between a quote and the signature below it", () => {
    const html = `<p>Hi</p>${buildReplyQuoteHtml({ date: "Nov 16", sender: "Maestro", quoteHtml: "<p>Old</p>" })}${buildEmbeddedSignatureHtml({ textSignature: "Sam" }, { separator: true })}`;
    expect(composeHtmlToPlainText(html)).toBe("Hi\n\nOn Nov 16, Maestro wrote:\n\n> Old\n\n-- \nSam");
  });

  it("does not repeat a link whose text is its address", () => {
    expect(composeHtmlToPlainText('<p><a href="https://solace.onl/">solace.onl</a></p>')).toBe("solace.onl");
  });

  it("keeps preformatted whitespace", () => {
    expect(composeHtmlToPlainText("<pre>a  b\n  c</pre>")).toBe("a  b\n  c");
  });
});

describe("inline images", () => {
  it("marks quoted cid images and fills them once loaded", () => {
    const marked = markComposeCidImages('<p><img src="cid:logo@x" alt="Logo"></p>');
    expect(marked).toContain('data-cid="logo@x"');
    expect(marked).toContain(INLINE_IMAGE_PLACEHOLDER);
    expect(htmlHasUnhydratedInlinePlaceholders(marked)).toBe(true);

    const filled = replaceInlineImagePlaceholders(marked, new Map([["logo@x", `data:image/png;base64,${PNG_BASE64}`]]));
    expect(filled).toContain(`src="data:image/png;base64,${PNG_BASE64}"`);
    expect(htmlHasUnhydratedInlinePlaceholders(filled)).toBe(false);
  });

  it("drops the placeholder of a quoted image that failed to load", () => {
    const marked = markComposeCidImages('<p>a<img src="cid:gone@x">b<img src="cid:kept@x"></p>');
    const dropped = dropInlineImagePlaceholders(marked, new Set(["gone@x"]));
    expect(dropped).not.toContain("gone@x");
    expect(dropped).toContain('data-cid="kept@x"');
  });

  it("turns embedded data images into cid parts and leaves remote and unloaded images alone", () => {
    let next = 0;
    const html = `<p><img src="data:image/png;base64,${PNG_BASE64}" alt="photo.png" data-cid="known@solace"><img src="data:image/jpeg;base64,${PNG_BASE64}"><img src="https://example.com/a.png"><img src="${INLINE_IMAGE_PLACEHOLDER}" data-cid="quoted@x"></p>`;
    const { html: rewritten, images } = extractComposeInlineImages(html, () => `new-${(next += 1)}@solace`);
    expect(images.map(({ cid, filename, contentType }) => ({ cid, filename, contentType }))).toEqual([
      { cid: "known@solace", filename: "photo.png", contentType: "image/png" },
      { cid: "new-1@solace", filename: "image-2.jpg", contentType: "image/jpeg" },
    ]);
    expect(Array.from(images[0]?.content ?? [])).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(rewritten).toContain('src="cid:known@solace"');
    expect(rewritten).toContain('src="cid:new-1@solace"');
    expect(rewritten).toContain('src="https://example.com/a.png"');
    expect(rewritten).toContain('data-cid="quoted@x"');
    expect(rewritten).not.toContain("data:image/png");
  });
});

describe("compose seeds", () => {
  it("escapes plain text into paragraphs", () => {
    expect(plainTextToComposeHtml("a <b>\nc\n\nd")).toBe("<p>a &lt;b&gt;<br>c</p><p>d</p>");
  });

  it("escapes the quote header's sender and places the signature on either side of the quote", () => {
    const quote = buildReplyQuoteHtml({ date: "Nov 16", sender: "Sam <sam@solace.test>", quoteHtml: "<p>Hi</p>" });
    expect(quote).toContain("On Nov 16, Sam &lt;sam@solace.test&gt; wrote:");
    expect(placeComposeQuote(quote, "<p>SIG</p>", true)).toBe(`<p></p><p>SIG</p>${quote}`);
    expect(placeComposeQuote(quote, "<p>SIG</p>", false)).toBe(`<p></p>${quote}<p>SIG</p>`);
  });

  it("sanitizes quoted mail and marks its cid images", () => {
    const html = prepareQuotedComposeHtml({ html: '<p onclick="x()">Hi</p><img src="cid:a@b">' });
    expect(html).not.toContain("onclick");
    expect(html).toContain('data-cid="a@b"');
    expect(prepareQuotedComposeHtml({ text: "a <b>\nc" })).toBe("<p>a &lt;b&gt;<br>c</p>");
  });
});

describe("outgoing inline images", () => {
  const image = {
    filename: "chart.png",
    contentType: "image/png",
    content: new Uint8Array([1, 2, 3]),
    cid: "chart@solace",
    disposition: "inline" as const,
  };
  const file = { filename: "notes.txt", contentType: "text/plain", content: new TextEncoder().encode("notes") };

  it("puts inline images in multipart/related beside the HTML and files in multipart/mixed", () => {
    const mime = buildOutgoingMimeMessage({
      text: "See chart",
      html: '<p>See <img src="cid:chart@solace"></p>',
      attachments: [image, file],
    });
    const types = Array.from(mime.matchAll(/^Content-Type: ([^;\r\n]+)/gm), (match) => match[1]);
    expect(types).toEqual(["multipart/mixed", "multipart/alternative", "text/plain", "multipart/related", "text/html", "image/png", "text/plain"]);
    expect(mime).toContain("Content-ID: <chart@solace>");

    const parsed = parseMailMimeContent(mime);
    expect(parsed.text).toBe("See chart");
    expect(parsed.html).toBe('<p>See <img src="cid:chart@solace"></p>');
    expect(parsed.attachments.map((attachment) => attachment.filename)).toEqual(["notes.txt"]);
  });

  it("needs no multipart/mixed when the only attachments are inline images", () => {
    const mime = buildOutgoingMimeMessage({ text: "See chart", html: '<p><img src="cid:chart@solace"></p>', attachments: [image] });
    expect(mime.startsWith("Content-Type: multipart/alternative")).toBe(true);
    expect(mime).toContain("multipart/related");
  });
});
