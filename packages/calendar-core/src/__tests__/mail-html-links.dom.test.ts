/** @jest-environment jsdom */
import { describe, expect, it } from "@jest/globals";
import { processEmailHtml } from "../mail-html";

// Runs with a DOM: the DOMPurify path used on web.

describe("processEmailHtml links (DOMPurify)", () => {
  it("strips click trackers and applies the rewrite with the original in the title", () => {
    const processed = processEmailHtml({
      html: '<a title="a>b" href="https://shop.example/p?utm_source=mail&id=7&copy=2"><b>Shop</b> now</a>',
      isDark: false,
      blockTrackingPixels: false,
      rewriteLink: ({ href, text }) => (text === "Shop now" && href === "https://shop.example/p?id=7&copy=2" ? "https://solace.test/mail/link#x.0" : null),
    });
    const anchor = new DOMParser().parseFromString(processed, "text/html").querySelector("a");

    expect(anchor?.getAttribute("href")).toBe("https://solace.test/mail/link#x.0");
    expect(anchor?.getAttribute("title")).toBe("https://shop.example/p?id=7&copy=2");
    expect(anchor?.getAttribute("rel")).toBe("noopener noreferrer");
  });
});
