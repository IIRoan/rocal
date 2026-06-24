import { describe, expect, it } from "@jest/globals";
import {
  beginQuotedInlineImageHydration,
  completeQuotedInlineImageHydration,
  getComposeInlineImages,
  registerComposeInlineImage,
  resetComposeInlineImages,
  waitForQuotedInlineImageHydration,
} from "@/lib/mail/compose-inline-images";

describe("compose-inline-images", () => {
  it("tracks registered inline images until reset", () => {
    resetComposeInlineImages();
    registerComposeInlineImage({
      cid: "img@solace",
      blobId: "blob-1",
      type: "image/png",
      name: "inline.png",
      size: 3,
      dataUrl: "data:image/png;base64,abc",
      content: new Uint8Array([1, 2, 3]),
    });

    expect(getComposeInlineImages()).toHaveLength(1);
    expect(getComposeInlineImages()[0]?.cid).toBe("img@solace");

    resetComposeInlineImages();
    expect(getComposeInlineImages()).toHaveLength(0);
  });

  it("waits for quoted inline image hydration to finish", async () => {
    resetComposeInlineImages();
    beginQuotedInlineImageHydration();
    beginQuotedInlineImageHydration();

    const pending = waitForQuotedInlineImageHydration();
    let settled = false;
    void pending.then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    completeQuotedInlineImageHydration();
    await Promise.resolve();
    expect(settled).toBe(false);

    completeQuotedInlineImageHydration();
    await pending;
    expect(settled).toBe(true);
  });
});
