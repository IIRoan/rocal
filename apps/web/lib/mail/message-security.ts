import { getMailSecurityNotice, type MailReadState } from "@workspace/calendar-core";
import type { MailSignatureVerificationState, MessageEncryptionState } from "./types";

export {
  classifyMessageEncryption,
  extractEncryptedBodyBlobId,
  extractMessageBodies,
  extractPgpMimeCiphertextBlobId,
  extractTextBodyBlobId,
  resolveInlinePgpArmoredCiphertext,
} from "@workspace/calendar-core";

export function resolveSecurityLabels(input: {
  messageState: MessageEncryptionState;
  accountEncryptedAtRest: boolean;
  hasVerifiedSignature: boolean;
  decryptionFailed: boolean;
}): string[] {
  const labels: string[] = [];

  if (
    input.messageState === "inline_pgp" ||
    input.messageState === "pgp_mime" ||
    input.messageState === "internal_e2ee"
  ) {
    labels.push("PGP content detected");
  } else if (input.messageState === "plain" && !input.accountEncryptedAtRest) {
    labels.push("No message encryption detected");
  }

  if (input.accountEncryptedAtRest) {
    labels.push("Mailbox encryption enabled");
  }

  if (input.hasVerifiedSignature) {
    labels.push("Signature verified");
  }

  if (input.decryptionFailed) {
    labels.push("Decryption failed");
  }

  return labels;
}

export function resolveMessageSecurityLabel(input: {
  messageState: MessageEncryptionState;
  accountEncryptedAtRest: boolean;
  signatureVerificationState: MailSignatureVerificationState;
  readState: MailReadState;
}): string {
  return getMailSecurityNotice(input).label;
}
