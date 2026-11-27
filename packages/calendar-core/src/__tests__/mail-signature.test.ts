import { describe, expect, it } from "@jest/globals";
import {
  getPlainTextSignature,
  insertPlainTextSignature,
  replacePlainTextSignatureBlock,
} from "../mail-signature";
import { FORWARDED_MESSAGE_HEADER } from "../mail-quote";

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

  it("opens a new message with an empty writing line above the signature", () => {
    expect(insertPlainTextSignature("", ALICE, { separator: true, aboveQuote: false })).toBe("\n\n-- \nAlice");
    expect(insertPlainTextSignature("", ALICE, { separator: false, aboveQuote: false })).toBe("\n\nAlice");
    expect(insertPlainTextSignature("Hello\n\n", ALICE, { separator: true, aboveQuote: false })).toBe("Hello\n\n-- \nAlice");
    expect(insertPlainTextSignature("Hello", null, { separator: true, aboveQuote: false })).toBe("Hello");
  });

  it("puts the signature above or below a reply or forward quote", () => {
    expect(insertPlainTextSignature(QUOTE, ALICE, { separator: true, aboveQuote: true })).toBe(`\n\n-- \nAlice${QUOTE}`);
    expect(insertPlainTextSignature(`Thanks${QUOTE}`, ALICE, { separator: true, aboveQuote: true })).toBe(`Thanks\n\n-- \nAlice${QUOTE}`);
    expect(insertPlainTextSignature(QUOTE, ALICE, { separator: true, aboveQuote: false })).toBe(`${QUOTE}\n\n-- \nAlice`);
    const forward = `\n\n${FORWARDED_MESSAGE_HEADER}\nFrom: carol@solace.test\n\nOn Monday, Dan wrote:`;
    expect(insertPlainTextSignature(forward, ALICE, { separator: true, aboveQuote: true })).toBe(`\n\n-- \nAlice${forward}`);
  });

  it("adds a signature at the end when an above-quote body has no quote header", () => {
    expect(insertPlainTextSignature("Hi\n\n> Earlier", ALICE, { separator: true, aboveQuote: true })).toBe("Hi\n\n> Earlier\n\n-- \nAlice");
  });

  it("ignores a signature that only appears inside quoted lines", () => {
    expect(replacePlainTextSignatureBlock("Hi\n\n> Alice", ALICE, BOB, { separator: true })).toBeNull();
  });

  it("swaps an embedded signature when the identity changes", () => {
    const body = insertPlainTextSignature(QUOTE, ALICE, { separator: true, aboveQuote: true });
    expect(replacePlainTextSignatureBlock(body, ALICE, BOB, { separator: true })).toBe(
      `\n\n-- \nBob\nSolace${QUOTE}`,
    );
    expect(replacePlainTextSignatureBlock(body, ALICE, null, { separator: true })).toBe(
      `\n\n${QUOTE}`,
    );
    expect(replacePlainTextSignatureBlock("No signature", ALICE, BOB, { separator: true })).toBeNull();
  });
});
