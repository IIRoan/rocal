import { z } from "zod";
import { strictZodObject } from "../lib/validation";
import { rowEncryptionStateSchema } from "../lib/encryption-state";

export const resourceIdParamsSchema = strictZodObject({
  id: z.string().min(1),
});

export const eventIdParamsSchema = strictZodObject({
  eventId: z.string().min(1),
});

export const encryptionShadowFieldsSchema = strictZodObject({
  encryptedName: z.string().optional(),
  blindIndexTokens: z.array(z.string()).optional(),
  encryptionState: rowEncryptionStateSchema.optional(),
  encryptionKeyVersion: z.number().int().min(1).optional(),
});

export const eventContentEncryptionFieldsSchema = strictZodObject({
  encryptedContent: z.string().optional(),
  blindIndexTokens: z.array(z.string()).optional(),
  encryptionKeyVersion: z.number().int().min(1).optional(),
});

export const sealEncryptionBodySchema = strictZodObject({
  encryptedContent: z.string().min(1),
  blindIndexTokens: z.array(z.string().min(1)).optional(),
  encryptionKeyVersion: z.number().int().min(1).optional(),
});

export const reminderFieldSchema = z.union([
  z.number().int().min(0).max(43200),
  z.null(),
]);
