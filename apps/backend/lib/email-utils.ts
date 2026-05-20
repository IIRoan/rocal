import { z } from "zod";
import { ValidationError } from "./errors";

const emailSchema = z.string().email();

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeEmailOrThrow(
  value: string,
  field: string = "email",
): string {
  const normalized = normalizeEmail(value);

  if (!emailSchema.safeParse(normalized).success) {
    throw new ValidationError("A valid email address is required.", field);
  }

  return normalized;
}
