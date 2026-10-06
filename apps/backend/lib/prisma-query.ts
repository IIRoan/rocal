import { ValidationError } from "./errors";

/** Prisma string equality filter that blocks operator injection when untyped request values reach query builders. */
export function prismaStringEquals(
  value: unknown,
  field = "id",
): { equals: string } {
  if (typeof value !== "string" || value.length === 0) {
    throw new ValidationError(`Invalid ${field}`, field);
  }
  return { equals: value };
}
