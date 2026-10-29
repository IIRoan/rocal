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
    // superRefine rejects an empty blob id before safeParse succeeds, so the non-null is guaranteed.
    blobId: parsed.data.blobId!,
    size: parsed.data.size ?? expectedSize,
    type: parsed.data.type,
  };
}

type JmapMethodError = {
  type?: string;
  description?: string;
  properties?: string[];
};

function formatJmapMethodError(methodName: string, error: JmapMethodError): string {
  const propsHint = error.properties?.length
    ? ` (properties: ${error.properties.join(", ")})`
    : "";
  const typeHint = error.type ? ` [${error.type}]` : "";
  return `${error.description || error.type || `Failed during ${methodName}`}${typeHint}${propsHint}`;
}

function firstPatchError(patch: unknown): JmapMethodError | null {
  if (typeof patch !== "object" || patch === null) return null;
  const [first] = Object.values(patch);
  return typeof first === "object" && first !== null ? (first as JmapMethodError) : null;
}

/** The first method error or refused create/update/destroy in a JMAP response, or null when every call succeeded. */
export function findJmapResponseError(
  envelope: { methodResponses?: [string, Record<string, unknown>, string][] },
  context: string,
): Error | null {
  for (const [methodName, result] of envelope.methodResponses ?? []) {
    if (methodName === "error" || methodName.endsWith("/error")) {
      return new Error(
        formatJmapMethodError(methodName === "error" ? context : methodName, result as JmapMethodError),
      );
    }
    const patchError =
      firstPatchError(result.notCreated) ??
      firstPatchError(result.notDestroyed) ??
      firstPatchError(result.notUpdated);
    if (patchError) {
      return new Error(formatJmapMethodError(methodName, patchError));
    }
  }

  return envelope.methodResponses?.length
    ? null
    : new Error(`${context}: JMAP response did not include method results.`);
}

export function assertSuccessfulJmapResponses(
  envelope: { methodResponses?: [string, Record<string, unknown>, string][] },
  context: string,
): void {
  const error = findJmapResponseError(envelope, context);
  if (error) throw error;
}
