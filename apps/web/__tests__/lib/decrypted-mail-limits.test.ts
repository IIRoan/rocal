import { expect, it } from "@jest/globals";
import * as openpgp from "openpgp";
import { getMailReadLimitNotice } from "@workspace/calendar-core/mail-mime-limits";
import { loadStalwart110MailFixtures } from "../../../../packages/calendar-core/test-fixtures/stalwart-1.1.0-mail/fixture-loader";

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
