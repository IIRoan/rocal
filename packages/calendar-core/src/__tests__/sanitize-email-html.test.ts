import { describe, expect, it } from "@jest/globals";
import { sanitizeUntrustedEmailHtml } from "../sanitize-email-html";
import { BYPASS_CASES, expectBypassNeutralized, READER_KEEPS } from "./sanitize-email-html.cases";

// Runs in the node environment: exercises the non-DOM tokenizer used on React Native.

describe("sanitizeUntrustedEmailHtml (no DOM)", () => {
  it("runs without a DOM", () => {
    expect(typeof DOMParser).toBe("undefined");
  });

  it("strips script and style tags", () => {
    const sanitized = sanitizeUntrustedEmailHtml(
      '<p>Hello</p><script>alert(1)</script><style>.x{}</style>',
    );
    expect(sanitized).toContain("Hello");
    expect(sanitized).not.toMatch(/<script/i);
    expect(sanitized).not.toMatch(/<style/i);
    expect(sanitized).not.toContain("alert");
    expect(sanitized).not.toContain(".x{}");
  });

  it("removes inline event handlers", () => {
    const sanitized = sanitizeUntrustedEmailHtml(
      '<img src="x" onerror="alert(1)"><p onclick="alert(1)">Hi</p>',
    );
    expect(sanitized).not.toMatch(/onerror/i);
    expect(sanitized).not.toMatch(/onclick/i);
  });

  it("preserves cid and safe data image sources", () => {
    const sanitized = sanitizeUntrustedEmailHtml(
      '<img src="cid:abc@x"><img src="data:image/png;base64,abc">',
    );
    expect(sanitized).toContain("cid:abc@x");
    expect(sanitized).toContain("data:image/png;base64,abc");
  });

  it("escapes stray angle brackets instead of emitting partial tags", () => {
    expect(sanitizeUntrustedEmailHtml("a < b <3 <p>c</p>")).toBe("a &lt; b &lt;3 <p>c</p>");
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
    expect(sanitized).toContain('target="_blank" rel="noopener noreferrer"');
    expect(sanitized).toContain('src="cid:abc@x"');
    expect(sanitized).toContain('src="data:image/png;base64,abc"');
  });

  it("does not add target/rel to compose links", () => {
    const sanitized = sanitizeUntrustedEmailHtml('<a href="https://example.com">x</a>');
    expect(sanitized).toBe('<a href="https://example.com">x</a>');
  });
});
