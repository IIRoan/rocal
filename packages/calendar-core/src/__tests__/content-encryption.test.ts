import { describe, expect, it } from "@jest/globals";

import { findPlaintextEventContentFields } from "../index";

describe("content encryption helpers", () => {
  it("finds non-empty plaintext event content fields", () => {
    expect(
      findPlaintextEventContentFields({
        title: "",
        description: "  ",
        location: "Clinic",
      }),
    ).toEqual(["location"]);
  });
});
