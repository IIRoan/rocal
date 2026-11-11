import {
  parseRecipientString,
  normalizeEmailAddress,
  MAIL_KEY_CONTINUITY_ENABLED,
  MailTrustBlockedError,
  type MailSenderVerification,
  resolveMailSenderKeySource,
} from "@workspace/calendar-core";
import { mailDemoApiService } from "./api-service";
import { mailCryptoWorkerClient } from "./worker-client";
import type { MailVaultVerificationContext } from "./worker-client-core";

export function captureMailVerificationContext(): MailVaultVerificationContext {
  const context = mailCryptoWorkerClient.getVerificationContext();
  if (!context) throw new Error("Mail vault is not loaded on this device.");
  return context;
}

export function assertMailVerificationContext(
  context: MailVaultVerificationContext,
): void {
  if (!mailCryptoWorkerClient.isVerificationContextCurrent(context)) {
    throw new Error("Mail encryption session changed.");
  }
}

export async function resolveMailSenderVerification(input: {
  senderEmail: string | null | undefined;
  internalDomain: string | null | undefined;
  context: MailVaultVerificationContext;
}): Promise<MailSenderVerification> {
  assertMailVerificationContext(input.context);
  const source = resolveMailSenderKeySource({
    senderEmail: input.senderEmail,
    ownAddresses: input.context.ownAddresses,
    internalDomain: input.internalDomain,
  });
  if (source === "self") return { senderPublicKeyArmored: input.context.publicKeyArmored, senderKeyTrustState: { kind: "self" } };
  if (source !== "directory" || !input.senderEmail) return { senderKeyTrustState: { kind: "not_applicable" } };
  if (MAIL_KEY_CONTINUITY_ENABLED) {
    const { inspectPinnedMailSender } = await import("./mail-trust");
    assertMailVerificationContext(input.context);
    const result = await inspectPinnedMailSender(input.senderEmail, input.context).catch((error: unknown): MailSenderVerification => {
      if (error instanceof MailTrustBlockedError) return { senderKeyTrustState: { kind: "unavailable", reason: "history" } };
      throw error;
    });
    assertMailVerificationContext(input.context);
    return result;
  }
  const key = await mailDemoApiService
    .getRecipientKey(
      normalizeEmailAddress(parseRecipientString(input.senderEmail).email),
    )
    .catch(() => null);
  assertMailVerificationContext(input.context);
  return { senderPublicKeyArmored: key?.publicKeyArmored };
}

export async function resolveMailSenderVerificationKey(input: Parameters<typeof resolveMailSenderVerification>[0]): Promise<string | undefined> {
  return (await resolveMailSenderVerification(input)).senderPublicKeyArmored;
}
