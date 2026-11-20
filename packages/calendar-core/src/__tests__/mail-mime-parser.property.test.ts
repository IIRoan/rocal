import { describe, expect, it } from "@jest/globals";
import fc from "fast-check";

import { parseDecryptedMailContent, parseMailMimeContent, type ParsedMailContent } from "../mail-mime-parser";
import { buildOutgoingMimeMessage } from "../outgoing-mime";
import { mimeSoupArb } from "./property-test-arbitraries";

const LIMITS = { text: 64, html: 64 };
const KNOWN_ERRORS = new Set([
  "Mail MIME exceeds the size limit.",
  "This message has too many lines to open here.",
  "Mail MIME exceeds its structural limit.",
  "Mail MIME headers exceed the size limit.",
  "Mail MIME has ambiguous content types.",
  "Mail MIME has an invalid boundary.",
]);
const CONTENT_TYPES = ["application/pdf", "image/png", "text/plain", "text/calendar", "application/octet-stream"];

/** Either content within the limits or one of the parser's own refusals. */
function expectBoundedOrRefused(parse: () => ParsedMailContent) {
  let parsed: ParsedMailContent;
  try {
    parsed = parse();
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect(KNOWN_ERRORS).toContain(error instanceof Error ? error.message : "");
    return;
  }
  expect(parsed.text === null || parsed.text.length <= LIMITS.text).toBe(true);
  expect(parsed.html === null || parsed.html.length <= LIMITS.html).toBe(true);
}

const normalize = (value: string) => value.replace(/\r\n?/g, "\n").trim();
const bodyTextArb = fc
  .array(fc.oneof(fc.constantFrom("\r\n", "\n", "\r", " ", "\t", "=", ".", "--", "\u00e9", "\ud83d\ude00"), fc.string({ maxLength: 6 })), {
    maxLength: 30,
  })
  .map((parts) => parts.join(""));

describe("parseMailMimeContent", () => {
  it("returns bounded content or a known refusal for any input", () => {
    fc.assert(
      fc.property(fc.oneof(mimeSoupArb, fc.string()), (raw) => {
        expectBoundedOrRefused(() => parseMailMimeContent(raw, LIMITS));
      }),
      { numRuns: 300 },
    );
  });

  it("reads back what buildOutgoingMimeMessage wrote", () => {
    const attachmentArb = fc.record({
      filename: fc.stringMatching(/^[a-z0-9._-]{1,20}$/),
      contentType: fc.constantFrom(...CONTENT_TYPES),
      content: fc.uint8Array({ maxLength: 2048 }),
    });
    fc.assert(
      fc.property(
        bodyTextArb,
        fc.option(bodyTextArb, { nil: undefined }),
        fc.array(attachmentArb, { maxLength: 3 }),
        (text, html, attachments) => {
          const parsed = parseMailMimeContent(buildOutgoingMimeMessage({ text, html, attachments }));
          expect(parsed.text ?? "").toBe(normalize(text));
          expect(parsed.html).toBe(html?.trim() ? normalize(html) : null);
          expect(
            parsed.attachments.map(({ filename, mimeType, content }) => ({ filename, contentType: mimeType, content })),
          ).toEqual(attachments.map(({ filename, contentType, content }) => ({ filename, contentType, content })));
          expect(parsed.truncated).toBe(false);
        },
      ),
      { numRuns: 150 },
    );
  });

  it("stops a plain part at the text limit and reports it", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 400 }), fc.integer({ min: 1, max: 200 }), (body, limit) => {
        const raw = `Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 7bit\r\n\r\n${body}`;
        const parsed = parseMailMimeContent(raw, { text: limit, html: limit });
        expect((parsed.text ?? "").length).toBeLessThanOrEqual(limit);
        expect(parsed.truncated).toBe(body.length > limit);
      }),
      { numRuns: 200 },
    );
  });
});

describe("parseDecryptedMailContent", () => {
  it("bounds plaintext that is not MIME", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (plaintext) => {
        expectBoundedOrRefused(() => parseDecryptedMailContent(plaintext, LIMITS));
      }),
      { numRuns: 200 },
    );
  });
});
