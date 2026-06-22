import { z } from "zod";

export function strictZodObject<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).strict();
}
