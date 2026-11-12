import { beforeAll, describe, expect, it, jest } from "@jest/globals";
import * as openpgp from "openpgp";
import {
  buildDraftMethodCalls,
  sealMailForSelf,
  type MailSealer,
} from "@workspace/calendar-core";
import type { JmapBodyStructure, JmapEmailMessage, JmapSession } from "@/lib/mail/types";
import type { StalwartJmapClient } from "@/lib/mail/jmap-client";

jest.mock("@/lib/mail/api-service", () => ({
  mailDemoApiService: { getRecipientKey: jest.fn() },
}));

const mockDecryptMessage = jest.fn<
  (input: { armoredMessage: string }) => Promise<MailDecryptResult>
>();
const mockVerificationContext = { publicKeyArmored: "synthetic-public", fingerprint: "synthetic-fingerprint", ownAddresses: ["alice@solace.onl"] };
jest.mock("@/lib/mail/worker-client", () => ({
  mailCryptoWorkerClient: {
    getVerificationContext: () => mockVerificationContext,
    isVerificationContextCurrent: (context: unknown) => context === mockVerificationContext,
    decryptMessage: (input: { armoredMessage: string }) => mockDecryptMessage(input),
  },
}));

import { decryptMessageForCompose } from "@/lib/mail/decrypt-message-for-compose";
import { parseDecryptedMailContent } from "@workspace/calendar-core/mail-mime-parser";
import type { MailDecryptResult } from "@/lib/mail/types";

const ATTACHMENT_BYTES = new TextEncoder().encode("quarterly numbers: 42, 17, 99");
const ATTACHMENT_BASE64 = Buffer.from(ATTACHMENT_BYTES).toString("base64");

let privateKey: openpgp.PrivateKey;
let sealer: MailSealer;
const uploads: string[] = [];

beforeAll(async () => {
  const generated = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ email: "alice@solace.onl" }],
    format: "object",
  });
  privateKey = generated.privateKey;
  const selfPublicKeyArmored = generated.publicKey.armor();
  sealer = {
    isCurrent: () => true,
    selfPublicKeyArmored,
    encrypt: async ({ plaintext, recipientPublicKeysArmored }) => ({
      armoredMessage: await openpgp.encrypt({
        message: await openpgp.createMessage({ text: plaintext }),
        encryptionKeys: await Promise.all(
          recipientPublicKeysArmored.map((armoredKey) => openpgp.readKey({ armoredKey })),
        ),
        signingKeys: privateKey,
      }),
    }),
    upload: async (armoredMessage) => {
      uploads.push(armoredMessage);
      return { blobId: `blob-${uploads.length}`, size: armoredMessage.length };
    },
  };
  mockDecryptMessage.mockImplementation(async ({ armoredMessage }) => {
    const { data } = await openpgp.decrypt({
      message: await openpgp.readMessage({ armoredMessage }),
      decryptionKeys: privateKey,
    });
    const parsed = parseDecryptedMailContent(String(data));
    return {
      ...parsed,
      plaintext: parsed.text,
      hasVerifiedSignature: false,
      signatureVerificationState: "not_signed",
    };
  });
});

describe("drafts and Sent copies sealed to the account key", () => {
  it("stores no plaintext body or attachment bytes and opens again as the original draft", async () => {
    const ciphertext = await sealMailForSelf(
      {
        text: "Meet at the harbour at nine",
        html: "<p>Meet at the <b>harbour</b> at nine</p>",
        attachments: [
          { filename: "numbers.txt", contentType: "text/plain", content: ATTACHMENT_BYTES },
        ],
      },
      sealer,
    );
    const stored = uploads[uploads.length - 1] ?? "";
    expect(stored).toContain("-----BEGIN PGP MESSAGE-----");
    expect(stored).not.toContain("harbour");
    expect(stored).not.toContain("quarterly");
    expect(stored).not.toContain(ATTACHMENT_BASE64);

    const [[, emailSet]] = buildDraftMethodCalls({
      draftsMailboxId: "drafts",
      fromEmail: "alice@solace.onl",
      to: ["friend@gmail.com"],
      subject: "Plans",
      ciphertext,
    });
    const created = (emailSet.create as Record<string, Record<string, unknown>>).draft1;
    expect(JSON.stringify(created)).not.toContain("harbour");
    const draft: JmapEmailMessage = {
      id: "draft-1",
      subject: "Plans",
      from: [{ email: "alice@solace.onl" }],
      bodyStructure: created.bodyStructure as JmapBodyStructure,
    };

    const getBlobAsText = jest.fn(async (_session: unknown, _blobId: string) => stored);
    const opened = await decryptMessageForCompose({
      client: { getBlobAsText } as unknown as StalwartJmapClient, // Only the blob download is exercised.
      session: {} as JmapSession,
      message: draft,
      config: null,
    });

    expect(getBlobAsText).toHaveBeenCalledWith({}, ciphertext.blobId);
    expect(opened.text).toBe("Meet at the harbour at nine");
    expect(opened.html).toBe("<p>Meet at the <b>harbour</b> at nine</p>");
    expect(opened.truncated).toBe(false);
    const reopened = await mockDecryptMessage({ armoredMessage: stored });
    expect(reopened.attachments).toHaveLength(1);
    expect(reopened.attachments?.[0]?.filename).toBe("numbers.txt");
    expect(reopened.attachments?.[0]?.content).toEqual(ATTACHMENT_BYTES);
  });
});
