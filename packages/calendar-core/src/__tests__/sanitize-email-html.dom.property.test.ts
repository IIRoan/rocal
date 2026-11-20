/** @jest-environment jsdom */
import { describe, expect, it } from "@jest/globals";
import fc from "fast-check";

import { sanitizeUntrustedEmailHtml } from "../sanitize-email-html";
import { hostileHtmlArb } from "./property-test-arbitraries";
import { unsafeElementReasons, unsafeMarkupReasons } from "./sanitize-email-html.oracle";

/** Reads the output the way the reader frame will, since DOM serialization may leave `>` inside attribute values. */
function unsafeDomReasons(html: string, profile: "reader" | "compose"): string[] {
  const template = document.createElement("template");
  template.innerHTML = html;
  return [...template.content.querySelectorAll("*")].flatMap((element) => [
    ...unsafeElementReasons(
      element.localName,
      [...element.attributes].map((attribute): [string, string] => [attribute.name, attribute.value]),
      profile,
    ),
    ...(element.localName === "style" ? unsafeMarkupReasons(`<style>${element.textContent ?? ""}</style>`, "reader") : []),
  ]);
}

describe.each(["reader", "compose"] as const)("sanitizeUntrustedEmailHtml with DOMPurify (%s)", (profile) => {
  const sanitize = (html: string) => sanitizeUntrustedEmailHtml(html, { profile });

  it("never throws and is idempotent", () => {
    fc.assert(
      fc.property(hostileHtmlArb, (html) => {
        const once = sanitize(html);
        expect(sanitize(once)).toBe(once);
      }),
      { numRuns: 100 },
    );
  });

  it("emits only safe tags, attributes, URLs and CSS", () => {
    fc.assert(
      fc.property(hostileHtmlArb, (html) => {
        expect(unsafeDomReasons(sanitize(html), profile)).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });
});
