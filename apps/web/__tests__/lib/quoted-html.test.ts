import { describe, expect, it } from "@jest/globals";
import {
  buildQuotedHtmlBlock,
  QUOTED_HTML_MARKER,
} from "@/components/mail/quoted-html";

describe("quoted-html", () => {
  it("wraps sanitized inner html in a marked block", () => {
    const block = buildQuotedHtmlBlock('<p>On Tue, Alice wrote:</p><p>Hi</p>');

    expect(block).toContain(QUOTED_HTML_MARKER);
    expect(block).toContain("<p>On Tue, Alice wrote:</p>");
    expect(block).toContain("<p>Hi</p>");
  });

  it("preserves table layout html verbatim inside the island", () => {
    const inner =
      '<table><tr><td style="width:120px">When</td><td>Tuesday</td></tr></table>';
    const block = buildQuotedHtmlBlock(inner);

    expect(block).toContain(inner);
  });
});
