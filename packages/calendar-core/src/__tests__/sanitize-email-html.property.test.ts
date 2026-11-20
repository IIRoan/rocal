import { describe, expect, it } from "@jest/globals";
import fc from "fast-check";

import { decodeHtmlEntities } from "../html-text";
import { processEmailHtml } from "../mail-html";
import { sanitizeUntrustedEmailHtml } from "../sanitize-email-html";
import { hostileHtmlArb } from "./property-test-arbitraries";
import { unsafeMarkupReasons } from "./sanitize-email-html.oracle";

const PROFILES = ["reader", "compose"] as const;

function hasRemoteImage(html: string): boolean {
  return [...html.matchAll(/<img\b[^>]*>/gi)].some(([tag]) => {
    const src = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(tag);
    // eslint-disable-next-line no-control-regex
    const value = decodeHtmlEntities(src?.[1] ?? src?.[2] ?? src?.[3] ?? "").replace(/[\x00-\x20\x7f-\x9f]+/g, "");
    return /^(?:https?:|[/\\]{2})/i.test(value);
  });
}

describe.each(PROFILES)("sanitizeUntrustedEmailHtml without a DOM (%s)", (profile) => {
  const sanitize = (html: string) => sanitizeUntrustedEmailHtml(html, { profile });

  it("never throws and is idempotent", () => {
    fc.assert(
      fc.property(hostileHtmlArb, (html) => {
        const once = sanitize(html);
        expect(sanitize(once)).toBe(once);
      }),
      { numRuns: 300 },
    );
  });

  it("emits only safe tags, attributes, URLs and CSS", () => {
    fc.assert(
      fc.property(hostileHtmlArb, (html) => {
        expect(unsafeMarkupReasons(sanitize(html), profile)).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });
});

describe("processEmailHtml without a DOM", () => {
  it("stays safe and drops remote images in both themes", () => {
    fc.assert(
      fc.property(hostileHtmlArb, fc.boolean(), (html, isDark) => {
        const processed = processEmailHtml({ html, isDark, blockRemoteImages: true, blockTrackingPixels: true });
        expect(unsafeMarkupReasons(processed, "reader")).toEqual([]);
        expect(hasRemoteImage(processed)).toBe(false);
      }),
      { numRuns: 300 },
    );
  });
});
