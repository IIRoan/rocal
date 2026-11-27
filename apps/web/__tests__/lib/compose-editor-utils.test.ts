/**
 * @jest-environment jsdom
 */
import { describe, expect, it } from "@jest/globals";
import { rewriteComposeInlineImages } from "@/lib/mail/compose-editor-utils";
import {
  registerComposeInlineImage,
  resetComposeInlineImages,
} from "@/lib/mail/compose-inline-images";

describe("compose-editor-utils", () => {
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

  it("keeps an inserted image's bytes local until a plaintext send uploads it", () => {
    resetComposeInlineImages();
    registerComposeInlineImage({
      cid: "img-2@solace",
      blobId: null,
      type: "image/png",
      name: "pasted.png",
      size: 3,
      dataUrl: "data:image/png;base64,abc",
      content: new Uint8Array([7, 8, 9]),
    });

    const rewritten = rewriteComposeInlineImages(
      '<img src="data:image/png;base64,abc" data-cid="img-2@solace">',
    );

    expect(rewritten.attachments).toEqual([
      expect.objectContaining({
        blobId: null,
        cid: "img-2@solace",
        content: new Uint8Array([7, 8, 9]),
      }),
    ]);
  });
});
