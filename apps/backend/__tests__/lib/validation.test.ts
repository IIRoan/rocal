import { describe, expect, it } from "@jest/globals";
import { t } from "elysia";
import { z } from "zod";
import { strictObject, strictZodObject } from "../../lib/validation";

describe("validation helpers", () => {
  it("builds Elysia object schemas with additionalProperties disabled", () => {
    const schema = strictObject({
      id: t.String(),
    }) as unknown as { additionalProperties?: boolean };

    expect(schema.additionalProperties).toBe(false);
  });

  it("rejects unknown keys in strict zod objects", () => {
    const schema = strictZodObject({
      id: z.string(),
    });

    expect(() => schema.parse({ id: "1", extra: true })).toThrow();
  });
});
