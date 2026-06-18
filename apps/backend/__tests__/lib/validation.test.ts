import { describe, expect, it } from "@jest/globals";
import { z } from "zod";
import { strictZodObject } from "../../lib/validation";

describe("validation helpers", () => {
  it("rejects unknown keys in strict zod objects", () => {
    const schema = strictZodObject({
      id: z.string(),
    });

    expect(() => schema.parse({ id: "1", extra: true })).toThrow();
  });
});
