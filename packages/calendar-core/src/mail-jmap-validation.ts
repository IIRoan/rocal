import { z } from "zod";
import { nonEmptyTrimmedString, throwFirstZodIssue } from "./mail-zod-utils";

export const jmapBlobUploadResponseSchema = z.object({
  blobId: nonEmptyTrimmedString,
  size: z.number().int().nonnegative(),
  type: z.string().optional(),
});

export type JmapBlobUploadResponse = z.infer<typeof jmapBlobUploadResponseSchema>;

export function parseJmapBlobUploadResponse(
  value: unknown,
  expectedSize: number,
  label = "Blob upload",
): JmapBlobUploadResponse {
  const schema = z
    .object({
      blobId: z.preprocess(
        (raw) => (typeof raw === "string" ? raw.trim() : raw),
        z.string().optional(),
      ),
      size: z.number().int().nonnegative().optional(),
      type: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      if (!data.blobId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} did not return a blob id.`,
          path: ["blobId"],
        });
        return;
      }

      const size = data.size ?? expectedSize;
      if (size !== expectedSize) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} size mismatch (expected ${expectedSize} bytes, got ${size}).`,
          path: ["size"],
        });
      }
    });

  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throwFirstZodIssue(parsed.error, `${label} response was invalid.`);
  }

  return {
    blobId: parsed.data.blobId!,
    size: parsed.data.size ?? expectedSize,
    type: parsed.data.type,
  };
}

const jmapCreatedEmailResultSchema = z
  .object({
    created: z
      .object({
        draft1: z
          .object({
            id: z.string().optional(),
            threadId: z.string().nullable().optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.created?.draft1?.id?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Send message succeeded but no email id was returned.",
        path: ["created", "draft1", "id"],
      });
    }
  });

const jmapCreatedSubmissionResultSchema = z
  .object({
    created: z
      .object({
        s1: z
          .object({
            id: z.string().optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.created?.s1?.id?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Send message was saved but not submitted for delivery.",
        path: ["created", "s1", "id"],
      });
    }
  });

export type SendMessageCreatedResults = {
  emailId: string;
  threadId: string | null;
  submissionId: string;
};

export function parseSendMessageResults(input: {
  emailSet: unknown;
  emailSubmissionSet: unknown;
}): SendMessageCreatedResults {
  const email = jmapCreatedEmailResultSchema.safeParse(input.emailSet);
  if (!email.success) {
    throwFirstZodIssue(
      email.error,
      "Send message succeeded but no email id was returned.",
    );
  }

  const submission = jmapCreatedSubmissionResultSchema.safeParse(
    input.emailSubmissionSet,
  );
  if (!submission.success) {
    throwFirstZodIssue(
      submission.error,
      "Send message was saved but not submitted for delivery.",
    );
  }

  return {
    emailId: email.data.created!.draft1!.id!.trim(),
    threadId: email.data.created!.draft1!.threadId ?? null,
    submissionId: submission.data.created!.s1!.id!.trim(),
  };
}
