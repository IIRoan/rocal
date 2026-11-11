import { afterEach, expect, it, jest } from "@jest/globals";
import PostalMime from "postal-mime";
import * as openpgp from "openpgp";
import {
  MAX_MAIL_MIME_LINES,
  getMailReadLimitNotice,
} from "@workspace/calendar-core/mail-mime-limits";
import { parseDecryptedMailContent } from "@/lib/mail/decrypted-mail-content";
import { loadStalwart110MailFixtures } from "../../../../packages/calendar-core/test-fixtures/stalwart-1.1.0-mail/fixture-loader";

afterEach(() => { jest.restoreAllMocks(); });

it("recognizes a real bounded-decompression refusal from the pinned crypto library", async () => {
  const key = loadStalwart110MailFixtures().keyFor("sender");
  const armoredMessage = await openpgp.encrypt({
    message: await openpgp.createMessage({ text: "x".repeat(4096) }),
    encryptionKeys: await openpgp.readKey({ armoredKey: key.publicKeyArmored }),
    config: { preferredCompressionAlgorithm: openpgp.enums.compression.zlib },
    format: "armored",
  });
  const error = await openpgp
    .decrypt({
      message: await openpgp.readMessage({ armoredMessage }),
      decryptionKeys: await openpgp.readPrivateKey({
        armoredKey: key.privateKeyArmored,
      }),
      config: { maxDecompressedMessageSize: 64 },
    })
    .then(
      () => null,
      (failure: unknown) => failure,
    );
  if (!(error instanceof Error))
    throw new Error(
      "The test encryption did not produce a compressed message.",
    );
  expect(error.message).toMatch(/Maximum decompressed message size exceeded$/);
  expect(getMailReadLimitNotice(error)).toBe(
    "This message is too large or complex to open here.",
  );
});

it("refuses line-dense MIME with a readable notice before the library allocates line objects", async () => {
  const parse = jest.spyOn(PostalMime, "parse");
  await expect(
    parseDecryptedMailContent(
      "Content-Type: text/plain\n\n" + "\n".repeat(MAX_MAIL_MIME_LINES),
    ),
  ).rejects.toThrow("This message has too many lines to open here.");
  expect(parse).not.toHaveBeenCalled();
});

it("lets bounded nonstandard boundary punctuation through the actual MIME decoder", async () => {
  const result = await parseDecryptedMailContent(
    'Content-Type: multipart/mixed; boundary="a*!#@{}[]"\n\n--a*!#@{}[]\nContent-Type: text/plain\n\nHello\n--a*!#@{}[]--',
  );
  expect(result.text).toBe("Hello");
});

it("preserves attached messages without unbounded inline parser recursion", async () => {
  let message = "Content-Type: text/plain\n\nHello";
  for (let depth = 0; depth < 22; depth += 1)
    message = "Content-Type: message/rfc822\n\n" + message;
  const result = await parseDecryptedMailContent(message);
  expect(result.text).toBeNull();
  expect(result.attachments).toHaveLength(1);
  expect(result.attachments[0]?.mimeType).toBe("message/rfc822");
});

it("keeps a base64 attached message opaque even when its decoded lines exceed the scanner cap", async () => {
  const inner =
    "Content-Type: text/plain\n\n" + "\n".repeat(MAX_MAIL_MIME_LINES + 1);
  const encoded = Buffer.from(inner)
    .toString("base64")
    .match(/.{1,76}/g)
    ?.join("\n");
  const result = await parseDecryptedMailContent(
    "Content-Type: message/rfc822\nContent-Transfer-Encoding: base64\n\n" +
      encoded,
  );
  expect(result.text).toBeNull();
  expect(result.attachments).toHaveLength(1);
  expect(result.attachments[0]?.content).toEqual(
    new TextEncoder().encode(inner).buffer,
  );
});
