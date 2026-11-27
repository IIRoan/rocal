import { INLINE_IMAGE_PLACEHOLDER } from "@workspace/calendar-core";
import type { MailRuntime } from "../lib/mail/mail-runtime";
import type { JmapEmailMessage } from "../lib/mail/types";
import { finalizeQuotedImages, loadQuotedImages } from "./use-compose-quoted-images";

const downloadBlob = jest.fn(async (_session: unknown, blobId: string) => {
  if (blobId === "broken") throw new Error("gone");
  return new Uint8Array([1, 2, 3]);
});
const runtime = { client: { downloadBlob }, session: {} } as unknown as MailRuntime; // Only the blob download is exercised.

const message: JmapEmailMessage = {
  id: "m1",
  attachments: [
    { blobId: "logo", cid: "logo@x", disposition: "inline", type: "image/png", name: "logo.png" },
    { blobId: "broken", cid: "broken@x", disposition: "inline", type: "image/jpeg" },
    { blobId: "vector", cid: "vector@x", disposition: "inline", type: "image/svg+xml" },
    { blobId: "file", name: "report.pdf", type: "application/pdf" },
  ],
};

const placeholder = (cid: string) => `<img src="${INLINE_IMAGE_PLACEHOLDER}" data-cid="${cid}">`;

it("loads quoted inline images as data URLs and reports ones that fail or cannot be shown", async () => {
  const images = await loadQuotedImages(runtime, message);
  expect([...images.loaded]).toEqual([["logo@x", "data:image/png;base64,AQID"]]);
  expect([...images.failed].sort()).toEqual(["broken@x", "vector@x"]);
  expect(downloadBlob).not.toHaveBeenCalledWith(expect.anything(), "file", expect.anything(), expect.anything());
});

it("never leaves a placeholder in what is sent, loaded or not", async () => {
  const images = await loadQuotedImages(runtime, message);
  const html = `<div data-quoted-html><p>Hi</p>${placeholder("logo@x")}${placeholder("broken@x")}${placeholder("unknown@x")}</div>`;
  expect(finalizeQuotedImages(html, images)).toBe(
    '<div data-quoted-html><p>Hi</p><img src="data:image/png;base64,AQID" data-cid="logo@x"></div>',
  );
});
