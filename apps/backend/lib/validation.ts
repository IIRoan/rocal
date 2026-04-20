import { t } from "elysia";
import { z } from "zod";

type ObjectProperties = Parameters<typeof t.Object>[0];
type StrictObjectOptions = Parameters<typeof t.Object>[1];

export function strictObject<T extends ObjectProperties>(
  properties: T,
  options?: StrictObjectOptions,
) {
  return t.Object(properties, {
    ...(options ?? {}),
    additionalProperties: false,
  });
}

export function strictZodObject<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).strict();
}
