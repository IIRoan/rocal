import { describe, expect, it } from "@jest/globals";
import { prismaStringEquals } from "../../lib/prisma-query";
import { ValidationError } from "../../lib/errors";

describe("prismaStringEquals", () => {
  it("returns an explicit equals filter for string ids", () => {
    expect(prismaStringEquals("sub-123")).toEqual({ equals: "sub-123" });
  });

  it("rejects object injection payloads", () => {
    expect(() => prismaStringEquals({ $ne: "sub-123" })).toThrow(ValidationError);
  });

  it("rejects empty strings", () => {
    expect(() => prismaStringEquals("")).toThrow(ValidationError);
  });
});
