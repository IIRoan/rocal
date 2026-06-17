import { z } from "zod";

export function throwFirstZodIssue(error: z.ZodError, fallback: string): never {
  const message = error.issues[0]?.message?.trim();
  throw new Error(message && message.length > 0 ? message : fallback);
}

export const nonEmptyTrimmedString = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.string().min(1),
);
