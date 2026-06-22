import { z } from "zod";
import { strictZodObject } from "../lib/validation";
import { userIdField } from "./_zod";

export const putRecentContactsBodySchema = strictZodObject({
  encryptedContent: z.string().min(1).max(65_536),
  encryptionKeyVersion: z.number().int().min(1).max(1000).optional(),
});

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
