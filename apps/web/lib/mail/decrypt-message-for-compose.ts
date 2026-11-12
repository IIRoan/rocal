import { createLogger } from "@workspace/logger";
import type { MailDemoConfig } from "@workspace/calendar-core";
import { assertMailVerificationContext, captureMailVerificationContext, resolveMailSenderVerification } from "./mail-sender-verification";
import { mailCryptoWorkerClient } from "@/lib/mail/worker-client";
import {
  classifyMessageEncryption,
  extractPgpMimeCiphertextBlobId,
  resolveInlinePgpArmoredCiphertext,
} from "@/lib/mail/message-security";
import { listedDecryptedAttachments } from "@/lib/mail/mail-app-helpers";
import type { JmapEmailMessage, JmapSession, MailAttachment, MailSignatureVerificationState } from "@/lib/mail/types";
import type { StalwartJmapClient } from "@/lib/mail/jmap-client";

const log = createLogger("decrypt-message-for-compose");

export type DecryptedComposeContent = {
  text: string | null;
  rawMimeFallback?: boolean;
  /** The text or HTML is shorter than the message, so it must not seed an editable draft. */
  truncated?: boolean;
  html: string | null;
  attachments?: MailAttachment[];
  senderKeyTrustState?: import("@workspace/calendar-core").MailSenderKeyTrustState;
  signatureVerificationState?: MailSignatureVerificationState;
  signatureVerificationLayers?: MailSignatureVerificationState[];
};

export async function decryptMessageForCompose(
  input: {
    client: StalwartJmapClient;
    session: JmapSession;
    message: JmapEmailMessage;
    config: MailDemoConfig | null | undefined;
    editable?: boolean;
  },
): Promise<DecryptedComposeContent> {
  const encState = classifyMessageEncryption(input.message);
  if (encState !== "inline_pgp" && encState !== "pgp_mime") {
    return { text: null, html: null };
  }

  const verificationContext = captureMailVerificationContext();
  let armoredMessage: string;
  if (encState === "inline_pgp") {
    armoredMessage = await resolveInlinePgpArmoredCiphertext({
      message: input.message,
      fetchBlob: (blobId) =>
        input.client.getBlobAsText(input.session, blobId),
    });
  } else {
    const blobId = extractPgpMimeCiphertextBlobId(input.message.bodyStructure);
    if (!blobId) {
      throw new Error("Could not locate PGP/MIME ciphertext blob.");
    }
    armoredMessage = await input.client.getBlobAsText(input.session, blobId);
  }

  const verification = await resolveMailSenderVerification({
    senderEmail: input.message.from?.[0]?.email,
    internalDomain: input.config?.defaultDomain,
    context: verificationContext,
  });
  assertMailVerificationContext(verificationContext);

  const decrypted = await mailCryptoWorkerClient.decryptMessage({
    armoredMessage,
    senderPublicKeyArmored: verification.senderPublicKeyArmored,
    expectedVaultFingerprint: verificationContext.fingerprint,
    editable: input.editable,
  });
  assertMailVerificationContext(verificationContext);

  if (decrypted.rawMimeFallback) {
    log.warn("Failed to parse decrypted MIME for compose");
    return {
      text: decrypted.sourceText ?? "",
      rawMimeFallback: true,
      truncated: decrypted.sourceTruncated,
      html: null,
      senderKeyTrustState: verification.senderKeyTrustState,
      signatureVerificationState: decrypted.signatureVerificationState,
      signatureVerificationLayers: decrypted.signatureVerificationLayers,
    };
  }
  return {
    text: decrypted.plaintext ?? "",
    truncated: decrypted.truncated,
    html: decrypted.html ?? null,
    attachments: encState === "pgp_mime" ? listedDecryptedAttachments(decrypted.attachments) : [],
    senderKeyTrustState: verification.senderKeyTrustState,
    signatureVerificationState: decrypted.signatureVerificationState,
    signatureVerificationLayers: decrypted.signatureVerificationLayers,
  };
}
