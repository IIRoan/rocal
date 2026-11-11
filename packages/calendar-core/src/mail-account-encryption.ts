import { z } from "./zod";

const enabledEncryptionSchema = z.strictObject({
  "@type": z.literal("Enabled"),
  publicKey: z.string().min(1).max(128),
  headerProtection: z.literal("none"),
  encryptOnAppend: z.boolean(),
  allowSpamTraining: z.literal(false),
});

const encryptionSchema = z.discriminatedUnion("@type", [
  enabledEncryptionSchema,
  z.strictObject({ "@type": z.literal("Disabled") }),
]);

export type MailAccountEncryption = z.infer<typeof encryptionSchema>;

export function parseMailAccountEncryption(settings: unknown): MailAccountEncryption {
  const envelope = z.object({ encryptionAtRest: encryptionSchema }).safeParse(settings);
  if (!envelope.success) {
    throw new Error("Mail server encryption settings require an update.");
  }
  return envelope.data.encryptionAtRest;
}

export function isMailAccountEncryptedAtRest(settings: unknown): boolean {
  const encryption = parseMailAccountEncryption(settings);
  return encryption["@type"] === "Enabled";
}

export function disabledAppendEncryption(settings: unknown): MailAccountEncryption | null {
  const encryption = parseMailAccountEncryption(settings);
  if (encryption["@type"] === "Disabled" || !encryption.encryptOnAppend) {
    return null;
  }
  return { ...encryption, encryptOnAppend: false };
}

export function assertMailEncryptionUpdate(result: unknown): void {
  const update = z.object({
    updated: z.record(z.string(), z.unknown()).optional(),
    notUpdated: z.record(z.string(), z.unknown()).optional(),
  }).safeParse(result);
  if (!update.success || update.data.notUpdated?.singleton !== undefined
    || !Object.prototype.hasOwnProperty.call(update.data.updated ?? {}, "singleton")) {
    throw new Error("Mail server did not confirm the encryption settings update.");
  }
}
