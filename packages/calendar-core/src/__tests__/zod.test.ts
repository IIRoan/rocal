import { describe, expect, it } from "@jest/globals";

import { z } from "../zod";

describe("zod", () => {
  it("never compiles validators with new Function, which the web CSP forbids", () => {
    expect(z.config().jitless).toBe(true);
    expect(z.object({ a: z.string() }).parse({ a: "x" })).toEqual({ a: "x" });
  });
});
