import type { z } from "zod";
import { putMailSettingsBodySchema } from "@workspace/calendar-core";
import { userIdField } from "./_zod";

export { putMailSettingsBodySchema };

export const mailSettingsUpsertInputSchema =
  putMailSettingsBodySchema.extend(userIdField);

export type MailSettingsRecord = {
  encryptedContent: string;
  encryptionKeyVersion: number;
  updatedAt: string;
};

export type MailSettingsUpsertInput = z.infer<
  typeof mailSettingsUpsertInputSchema
>;

export interface IMailSettingsService {
  get(userId: string): Promise<MailSettingsRecord | null>;
  upsert(input: MailSettingsUpsertInput): Promise<MailSettingsRecord>;
}
