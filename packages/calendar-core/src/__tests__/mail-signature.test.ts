import { describe, expect, it } from "@jest/globals";
import {
  appendPlainTextSignature,
  getPlainTextSignature,
  hasPlainTextSignatureBlock,
  prependPlainTextSignature,
  replacePlainTextSignatureBlock,
} from "../mail-signature";

const ALICE = { textSignature: "Alice" };
const BOB = { textSignature: "Bob\nSolace" };
const QUOTE = "\n\nOn Monday, Carol wrote:\n> Hi";

describe("mail signatures", () => {
  it("prefers the text signature and derives one from HTML", () => {
    expect(getPlainTextSignature({ textSignature: "Alice", htmlSignature: "<p>Bob</p>" })).toBe(
      "Alice",
    );
    expect(getPlainTextSignature({ htmlSignature: "<p>Bob</p><p>Solace</p>" })).toBe(
      "Bob\nSolace",
    );
    expect(getPlainTextSignature(null)).toBe("");
  });

  it("appends a signature once, with or without the separator", () => {
    const body = appendPlainTextSignature("Hello", ALICE);
    expect(body).toBe("Hello\n\n-- \nAlice");
    expect(appendPlainTextSignature(body, ALICE)).toBe(body);
    expect(appendPlainTextSignature("Hello", ALICE, { separator: false })).toBe(
      "Hello\n\nAlice",
    );
  });

  it("puts the signature above a seeded quote", () => {
    const body = prependPlainTextSignature(QUOTE, ALICE, { separator: true });
    expect(body).toBe(`\n\n-- \nAlice${QUOTE}`);
    expect(hasPlainTextSignatureBlock(body, ALICE)).toBe(true);
    expect(prependPlainTextSignature(QUOTE, null)).toBe(QUOTE);
  });

  it("ignores a signature that only appears inside quoted lines", () => {
    expect(hasPlainTextSignatureBlock("Hi\n\n> Alice", ALICE)).toBe(false);
  });

  it("swaps an embedded signature when the identity changes", () => {
    const body = prependPlainTextSignature(QUOTE, ALICE, { separator: true });
    expect(replacePlainTextSignatureBlock(body, ALICE, BOB, { separator: true })).toBe(
      `\n\n-- \nBob\nSolace${QUOTE}`,
    );
    expect(replacePlainTextSignatureBlock(body, ALICE, null, { separator: true })).toBe(
      `\n\n${QUOTE}`,
    );
    expect(replacePlainTextSignatureBlock("No signature", ALICE, BOB, { separator: true })).toBeNull();
  });
});
