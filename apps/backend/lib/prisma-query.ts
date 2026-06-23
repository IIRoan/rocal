import { ValidationError } from "./errors";

/**
 * Prisma string equality filter that blocks operator injection when request
 * values reach query builders without strict string typing.
 */
export function prismaStringEquals(
  value: unknown,
  field = "id",
): { equals: string } {
  if (typeof value !== "string" || value.length === 0) {
    throw new ValidationError(`Invalid ${field}`, field);
  }
  return { equals: value };
}
