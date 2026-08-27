import { describe, expect, it } from "@jest/globals";

import {
  applyComposeBold,
  applyComposeItalic,
  applyComposeUnderline,
  composeTextToHtml,
  composeTextToPlain,
  hasComposeFormatting,
  htmlToComposeText,
  messageBodiesToComposeText,
  resolveComposeSendBodies,
  toggleComposeList,
} from "./mail-compose-format";

describe("mail compose formatting", () => {
  it("wraps the current selection in bold markers", () => {
    expect(
      applyComposeBold("Hello world", { start: 6, end: 11 }),
    ).toEqual({
      text: "Hello **world**",
      selection: { start: 15, end: 15 },
    });
  });

  it("wraps italic and underline independently", () => {
    expect(applyComposeItalic("Hi", { start: 0, end: 2 }).text).toBe("_Hi_");
    expect(applyComposeUnderline("Hi", { start: 0, end: 2 }).text).toBe(
      "__Hi__",
    );
  });

  it("toggles markdown list prefixes on selected lines", () => {
    const listed = toggleComposeList("one\ntwo", { start: 0, end: 7 });
    expect(listed.text).toBe("- one\n- two");
    expect(toggleComposeList(listed.text, listed.selection).text).toBe(
      "one\ntwo",
    );
  });

  it("converts markdown-lite to HTML paragraphs, emphasis, and lists", () => {
    expect(
      composeTextToHtml("Hello **world**\n\n- one\n- two"),
    ).toBe("<p>Hello <strong>world</strong></p><ul><li>one</li><li>two</li></ul>");
    expect(composeTextToHtml("See _this_ and __that__")).toBe(
      "<p>See <em>this</em> and <u>that</u></p>",
    );
  });

  it("strips markers for the plaintext MIME part and escapes HTML", () => {
    expect(composeTextToPlain("Hello **world** and _you_")).toBe(
      "Hello world and you",
    );
    expect(composeTextToHtml("<script>")).toBe("<p>&lt;script&gt;</p>");
    expect(hasComposeFormatting("plain")).toBe(false);
    expect(hasComposeFormatting("**bold**")).toBe(true);
  });

  it("sends HTML only when the body is formatted and not encrypted", () => {
    const formatted = resolveComposeSendBodies({
      body: "Hello **world**",
      bodyWithSignature: "Hello **world**\n\n-- \nRoan",
      encrypted: false,
    });
    expect(formatted.plaintext).toBe("Hello world\n\n-- \nRoan");
    expect(formatted.htmlBody).toBe(
      "<p>Hello <strong>world</strong></p><p>-- <br>Roan</p>",
    );

    expect(
      resolveComposeSendBodies({
        body: "Hello **world**",
        bodyWithSignature: "Hello **world**\n\n-- \nRoan",
        encrypted: true,
      }).htmlBody,
    ).toBeUndefined();

    expect(
      resolveComposeSendBodies({
        body: "Just text",
        bodyWithSignature: "Just text\n\n-- \nRoan",
        encrypted: false,
      }),
    ).toEqual({
      plaintext: "Just text\n\n-- \nRoan",
    });
  });

  it("converts editor HTML back into markdown-lite", () => {
    expect(htmlToComposeText("<p>Hello <strong>world</strong></p>")).toBe(
      "Hello **world**",
    );
    expect(htmlToComposeText("<p>See <em>this</em> and <u>that</u></p>")).toBe(
      "See _this_ and __that__",
    );
    expect(htmlToComposeText("<ul><li>one</li><li>two</li></ul>")).toBe(
      "- one\n- two",
    );
    expect(
      htmlToComposeText(
        '<p>Hello <span style="font-weight: 700">world</span></p>',
      ),
    ).toBe("Hello **world**");
    expect(htmlToComposeText("<p>&lt;script&gt;</p>")).toBe("<script>");
    expect(htmlToComposeText(composeTextToHtml("Hello **world**"))).toBe(
      "Hello **world**",
    );
  });

  it("prefers markdown-lite text when reopening a draft", () => {
    expect(
      messageBodiesToComposeText({
        text: "Hello **world**",
        html: "<p>Hello <strong>world</strong></p>",
      }),
    ).toBe("Hello **world**");
    expect(
      messageBodiesToComposeText({
        text: "Hello world",
        html: "<p>Hello <strong>world</strong></p>",
      }),
    ).toBe("Hello **world**");
    expect(messageBodiesToComposeText({ text: "Just text" })).toBe("Just text");
  });
});
