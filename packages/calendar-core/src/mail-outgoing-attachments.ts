import { z } from "zod";
import { nonEmptyTrimmedString, throwFirstZodIssue } from "./mail-zod-utils";

export const preparedOutgoingAttachmentSchema = z.object({
  filename: nonEmptyTrimmedString,
  contentType: z.string().min(1),
  content: z.instanceof(Uint8Array).refine((content) => content.byteLength > 0, {
    message: "Attachment content is empty.",
  }),
  size: z.number().int().positive(),
});

export const expectedAttachmentRefSchema = z.object({
  filename: nonEmptyTrimmedString,
  size: z.number().int().positive(),
});

export const uploadedAttachmentRefSchema = z.object({
  blobId: nonEmptyTrimmedString,
  name: z.string(),
  size: z.number().int().nonnegative(),
});

export type PreparedOutgoingAttachment = z.infer<
  typeof preparedOutgoingAttachmentSchema
>;
export type ReadableAttachmentFile = {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};
export type UploadedAttachmentRef = z.infer<typeof uploadedAttachmentRefSchema>;

function parsePreparedAttachment(
  candidate: {
    filename: string;
    contentType: string;
    content: Uint8Array;
    size: number;
  },
  filename: string,
): PreparedOutgoingAttachment {
  const parsed = preparedOutgoingAttachmentSchema.safeParse(candidate);
  if (!parsed.success) {
    const emptyContent = candidate.content.byteLength === 0;
    if (emptyContent) {
      throw new Error(`"${filename}" is empty and cannot be sent.`);
    }
    throwFirstZodIssue(parsed.error, `Could not prepare "${filename}".`);
  }
  return parsed.data;
}

/**
 * Reads compose attachments into memory and rejects empty or incomplete files
 * before any network upload begins.
 */
export async function prepareOutgoingAttachments(
  files: ReadableAttachmentFile[],
): Promise<PreparedOutgoingAttachment[]> {
  if (files.length === 0) {
    return [];
  }

  return Promise.all(
    files.map(async (file) => {
      const filenameResult = nonEmptyTrimmedString.safeParse(file.name);
      if (!filenameResult.success) {
        throw new Error("Every attachment must have a filename.");
      }
      const filename = filenameResult.data;

      const buffer = await file.arrayBuffer();
      if (buffer.byteLength === 0) {
        throw new Error(`"${filename}" is empty and cannot be sent.`);
      }

      if (file.size > 0 && buffer.byteLength !== file.size) {
        throw new Error(
          `"${filename}" could not be read completely. Try re-attaching it.`,
        );
      }

      return parsePreparedAttachment(
        {
          filename,
          contentType: file.type?.trim() || "application/octet-stream",
          content: new Uint8Array(buffer),
          size: buffer.byteLength,
        },
        filename,
      );
    }),
  );
}

export function validateUploadedBlob(input: {
  blobId: string | undefined | null;
  size: number | undefined | null;
  expectedSize: number;
  label?: string;
}): { blobId: string; size: number } {
  const label = input.label?.trim() || "Upload";
  const schema = z
    .object({
      blobId: z.preprocess(
        (raw) => (typeof raw === "string" ? raw.trim() : raw),
        z.string().optional(),
      ),
      size: z.number().int().nonnegative().optional(),
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

      const size = data.size ?? input.expectedSize;
      if (size !== input.expectedSize) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} size mismatch (expected ${input.expectedSize} bytes, got ${size}).`,
          path: ["size"],
        });
      }
    });

  const parsed = schema.safeParse({
    blobId: input.blobId,
    size: input.size ?? input.expectedSize,
  });
  if (!parsed.success) {
    throwFirstZodIssue(parsed.error, `${label} response was invalid.`);
  }

  return {
    blobId: parsed.data.blobId!,
    size: parsed.data.size ?? input.expectedSize,
  };
}

export function validateUploadedAttachmentSet(
  expected: Array<{ filename: string; size: number }>,
  uploaded: UploadedAttachmentRef[],
): void {
  const parsedExpected = z.array(expectedAttachmentRefSchema).safeParse(expected);
  if (!parsedExpected.success) {
    throwFirstZodIssue(parsedExpected.error, "Attachment validation failed.");
  }

  const parsedUploaded = z.array(uploadedAttachmentRefSchema).safeParse(uploaded);
  if (!parsedUploaded.success) {
    throwFirstZodIssue(parsedUploaded.error, "Uploaded attachment validation failed.");
  }

  if (parsedExpected.data.length !== parsedUploaded.data.length) {
    throw new Error(
      `Only ${parsedUploaded.data.length} of ${parsedExpected.data.length} attachments uploaded.`,
    );
  }

  for (let index = 0; index < parsedExpected.data.length; index += 1) {
    const source = parsedExpected.data[index]!;
    const result = parsedUploaded.data[index]!;
    if (result.size !== source.size) {
      throw new Error(
        `"${source.filename}" uploaded with the wrong size (expected ${source.size} bytes, got ${result.size}).`,
      );
    }
  }
}
