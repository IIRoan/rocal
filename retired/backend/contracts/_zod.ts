import { z } from "zod";

export const userIdSchema = z.string().min(1);
export const resourceIdSchema = z.string().min(1);

export const userIdField = { userId: userIdSchema } as const;

function preprocessQueryEmpty(value: unknown): unknown {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return value;
}

function preprocessQueryBoolean(value: unknown): unknown {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (value === true || value === "true") {
    return true;
  }
  if (value === false || value === "false") {
    return false;
  }
  return value;
}

/** Coerces URL query string integers (e.g. `"10"` → `10`). */
export function optionalQueryInt(constraints: {
  min?: number;
  max?: number;
} = {}) {
  let base = z.coerce.number().int();
  if (constraints.min !== undefined) {
    base = base.min(constraints.min);
  }
  if (constraints.max !== undefined) {
    base = base.max(constraints.max);
  }
  return z.preprocess(preprocessQueryEmpty, base.optional());
}

/** Coerces URL query booleans (`"true"` / `"false"`). */
export const optionalQueryBooleanSchema = z.preprocess(
  preprocessQueryBoolean,
  z.boolean().optional(),
);
