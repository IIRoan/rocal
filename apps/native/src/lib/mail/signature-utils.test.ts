import {
  appendPlainTextSignature,
  getPlainTextSignature,
} from "./signature-utils";

describe("native signature-utils", () => {
  it("returns text signatures when present", () => {
    expect(
      getPlainTextSignature({
        textSignature: "Alice",
        htmlSignature: "<p>Bob</p>",
      }),
    ).toBe("Alice");
  });

  it("appends plain text signatures", () => {
    expect(
      appendPlainTextSignature("Hello", { textSignature: "Alice" }),
    ).toBe("Hello\n\n-- \nAlice");
  });

  it("does not append a signature that is already present", () => {
    const body = appendPlainTextSignature("Hello", { textSignature: "Alice" });
    expect(appendPlainTextSignature(body, { textSignature: "Alice" })).toBe(
      body,
    );
  });
});
