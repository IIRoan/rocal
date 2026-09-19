import type { z } from "zod";
import { putRecentContactsBodySchema } from "@workspace/calendar-core";
import { userIdField } from "./_zod";

export { putRecentContactsBodySchema };

export const recentContactsUpsertInputSchema =
  putRecentContactsBodySchema.extend(userIdField);

export type RecentContactsRecord = {
  encryptedContent: string;
  encryptionKeyVersion: number;
  updatedAt: string;
};

export type RecentContactsUpsertInput = z.infer<
  typeof recentContactsUpsertInputSchema
>;

export interface IRecentContactsService {
  get(userId: string): Promise<RecentContactsRecord | null>;
  upsert(input: RecentContactsUpsertInput): Promise<RecentContactsRecord>;
}
