import { z } from "zod";
import {
  PLAINTEXT_EVENT_CONTENT_WITH_CIPHERTEXT_MESSAGE,
  PLAINTEXT_NAME_WITH_CIPHERTEXT_MESSAGE,
  findPlaintextEventContentFields,
  hasEncryptedPayloadValue,
  type EventContentField,
} from "@workspace/calendar-core";
import { strictZodObject } from "../lib/validation";
import { rowEncryptionStateSchema } from "../lib/encryption-state";

export const resourceIdParamsSchema = strictZodObject({
  id: z.string().min(1),
});

export const eventIdParamsSchema = strictZodObject({
  eventId: z.string().min(1),
});

/** `encryptionState` is still accepted from older clients but ignored; ciphertext presence decides. */
export const encryptionShadowFieldsSchema = strictZodObject({
  encryptedName: z.string().optional(),
  blindIndexTokens: z.array(z.string()).optional(),
  encryptionState: rowEncryptionStateSchema.optional(),
  encryptionKeyVersion: z.number().int().min(1).optional(),
});

/** Rejects bodies that carry a plaintext name next to its ciphertext. */
export function refineEncryptedNameBody(options: {
  entityLabel: string;
  requireName: boolean;
}) {
  return (
    body: { name?: string; encryptedName?: string },
    ctx: z.RefinementCtx,
  ) => {
    const hasCiphertext = hasEncryptedPayloadValue(body.encryptedName);
    const hasPlaintextName = Boolean(body.name?.trim());

    if (hasCiphertext && hasPlaintextName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["name"],
        message: PLAINTEXT_NAME_WITH_CIPHERTEXT_MESSAGE,
      });
    }

    if (options.requireName && !hasCiphertext && !hasPlaintextName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["encryptedName"],
        message: `${options.entityLabel} name is required.`,
      });
    }
  };
}

/** Rejects event bodies that carry plaintext content next to its ciphertext. */
export function refineEncryptedEventContentBody(options: {
  requireTitle: boolean;
}) {
  return (
    body: Partial<Record<EventContentField, string>> & {
      encryptedContent?: string;
      invitationContent?: unknown;
      participants?: unknown[];
    },
    ctx: z.RefinementCtx,
  ) => {
    const hasCiphertext = hasEncryptedPayloadValue(body.encryptedContent);

    if (hasCiphertext) {
      for (const field of findPlaintextEventContentFields(body)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: PLAINTEXT_EVENT_CONTENT_WITH_CIPHERTEXT_MESSAGE,
        });
      }
    } else if (options.requireTitle && !body.title?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["title"],
        message: "Title is required and cannot be empty",
      });
    }

    if (
      body.invitationContent !== undefined &&
      (!hasCiphertext || !body.participants?.length)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["invitationContent"],
        message:
          "Invitation content is only accepted with encrypted content and participants.",
      });
    }
  };
}

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
