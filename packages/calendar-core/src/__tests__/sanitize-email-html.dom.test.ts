/**
 * @jest-environment jsdom
 */
import { describe, expect, it } from "@jest/globals";
import { sanitizeUntrustedEmailHtml } from "../sanitize-email-html";
import { BYPASS_CASES, expectBypassNeutralized, READER_KEEPS } from "./sanitize-email-html.cases";

// Runs with a DOM: exercises the DOMPurify path used on web.

describe("sanitizeUntrustedEmailHtml (DOMPurify)", () => {
  it("runs with a DOM", () => {
    expect(typeof DOMParser).toBe("function");
  });

  it("strips script and style tags in the compose profile", () => {
    const sanitized = sanitizeUntrustedEmailHtml(
      '<p>Hello</p><script>alert(1)</script><style>.x{}</style>',
    );
    expect(sanitized).toBe("<p>Hello</p>");
  });

  describe.each(["compose", "reader"] as const)("%s profile bypasses", (profile) => {
    it.each(BYPASS_CASES)("$name", (testCase) => {
      expectBypassNeutralized(testCase, profile);
    });
  });

  it("keeps layout, safe links, style blocks, and inline images for the reader", () => {
    const sanitized = sanitizeUntrustedEmailHtml(READER_KEEPS.html, { profile: "reader" });
    expect(sanitized).toContain("<style>.card{color:#111;background:url(cid:logo@x)}</style>");
    expect(sanitized).toContain('class="card"');
    expect(sanitized).toContain('data-signature-block="1"');
    expect(sanitized).toContain('style="width:120px"');
    expect(sanitized).toContain('href="https://example.com/a?b=1&amp;c=2"');
    expect(sanitized).toContain('href="mailto:a@example.com"');
    expect(sanitized).toMatch(/target="_blank"/);
    expect(sanitized).toMatch(/rel="noopener noreferrer"/);
    expect(sanitized).toContain('src="cid:abc@x"');
    expect(sanitized).toContain('src="data:image/png;base64,abc"');
  });

  it("keeps a leading style block from a full document in the reader profile", () => {
    const sanitized = sanitizeUntrustedEmailHtml(
      "<style>p{color:red}</style><p>Hi</p>",
      { profile: "reader" },
    );
    expect(sanitized).toBe("<style>p{color:red}</style><p>Hi</p>");
  });

  it("does not leak target/rel into the compose profile", () => {
    sanitizeUntrustedEmailHtml('<a href="https://example.com">x</a>', { profile: "reader" });
    expect(sanitizeUntrustedEmailHtml('<a href="https://example.com">x</a>')).toBe(
      '<a href="https://example.com">x</a>',
    );
  });
});
