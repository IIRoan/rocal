import { stripHtmlTags } from "../html-text";
import { buildMailBodyExcerpt } from "../mail-body-index";
import { htmlToComposeText } from "../mail-compose-format";
import { emailHtmlHasRemoteContent, processEmailHtml } from "../mail-html";
import { scoreMailSearchMessage } from "../mail-search-relevance";
import { htmlToPlainText } from "../mail-signature";
import { sanitizeUntrustedEmailHtml } from "../sanitize-email-html";

// Linear work on 64 KB takes milliseconds; a quadratic scan takes minutes, so the budget only trips on a real regression.
const SIZE = 64 * 1024;
const BUDGET_MS = 1500;

const UNITS = [
  "<a x",
  '<a x="',
  "<a x=<a x=",
  "<style",
  "<style>",
  "<script",
  "<img",
  "<img src=x",
  "<!--",
  "<body",
  "<body>",
  "<head>",
  "<meta name='color-scheme'",
  "<",
  "</a",
  "@media ",
  "@media (prefers-color-scheme: dark) {",
  "color:url(",
  "color:rgb(",
  "<span",
  "<span>",
  '<span style="font-weight:bold">',
  "<font",
  "<b x",
  "<i x",
  "<u x",
  "<li",
  "<br ",
];

const ENTRY_POINTS: Record<string, (html: string) => unknown> = {
  "reader sanitizer": (html) => sanitizeUntrustedEmailHtml(html, { profile: "reader" }),
  "compose sanitizer": (html) => sanitizeUntrustedEmailHtml(html),
  "dark reader": (html) => processEmailHtml({ html, isDark: true, blockTrackingPixels: true, blockRemoteImages: true }),
  "light reader": (html) => processEmailHtml({ html, isDark: false, blockTrackingPixels: true, blockRemoteImages: true }),
  "remote content check": (html) => emailHtmlHasRemoteContent({ html, isDark: true, blockTrackingPixels: true }),
  "search excerpt": (html) => buildMailBodyExcerpt({ html }),
  "search ranking": (html) =>
    scoreMailSearchMessage({ id: "m", subject: "x", htmlBody: [{ partId: "1" }], bodyValues: { "1": { value: html } } }, "solace"),
  "tag stripper": (html) => stripHtmlTags(html),
  "draft to compose text": (html) => htmlToComposeText(html),
  "signature to plain text": (html) => htmlToPlainText(html),
};

describe("hostile mail HTML stays linear", () => {
  it.each(UNITS)("%j repeated, bare and inside <style>", (unit) => {
    const repeated = unit.repeat(Math.ceil(SIZE / unit.length));
    for (const html of [repeated, `<style>${repeated}</style>`, `<body style="${repeated}">x</body>`]) {
      for (const [name, run] of Object.entries(ENTRY_POINTS)) {
        const started = performance.now();
        run(html);
        expect({ name, ms: Math.round(performance.now() - started) }).toEqual({
          name,
          ms: expect.any(Number) as number,
        });
        expect(performance.now() - started).toBeLessThan(BUDGET_MS);
      }
    }
  }, 60_000);
});
