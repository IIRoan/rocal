/**
 * @jest-environment jsdom
 */
import { describe, expect, it } from "@jest/globals";
import {
  rewriteCidImagesForEditor,
  rewriteComposeInlineImages,
  sanitizeQuotedEmailHtml,
} from "@/lib/mail/compose-editor-utils";
import {
  registerComposeInlineImage,
  resetComposeInlineImages,
} from "@/lib/mail/compose-inline-images";

describe("compose-editor-utils", () => {
  it("strips unsafe tags from quoted html", () => {
    const sanitized = sanitizeQuotedEmailHtml(
      '<p>Hello</p><script>alert(1)</script><style>.x{}</style>',
    );
    expect(sanitized).toContain("<p>Hello</p>");
    expect(sanitized).not.toContain("<script");
    expect(sanitized).not.toContain("<style");
  });

  it("rewrites cid images for the editor", () => {
    const html = rewriteCidImagesForEditor('<img src="cid:abc@x" alt="logo">');
    expect(html).toContain('data-cid="abc@x"');
    expect(html).not.toContain('src="cid:');
  });

  it("rewrites inline compose images back to cid references on send", () => {
    resetComposeInlineImages();
    registerComposeInlineImage({
      cid: "img-1@solace",
      blobId: "blob-1",
      type: "image/png",
      name: "inline.png",
      size: 12,
      dataUrl: "data:image/png;base64,abc",
      content: new Uint8Array([1, 2, 3]),
    });

    const rewritten = rewriteComposeInlineImages(
      '<p>Hi</p><img src="data:image/png;base64,abc" data-cid="img-1@solace">',
    );

    expect(rewritten.html).toContain('src="cid:img-1@solace"');
    expect(rewritten.html).not.toContain("data-cid");
    expect(rewritten.attachments).toEqual([
      expect.objectContaining({
        blobId: "blob-1",
        cid: "img-1@solace",
        disposition: "inline",
      }),
    ]);
  });
});
