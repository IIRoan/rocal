import { describe, expect, it } from "@jest/globals";

import {
  composeTextToHtml,
  hasComposeFormatting,
  hasComposeUserContent,
} from "./mail-compose-format";

describe("mail compose formatting", () => {
  it("converts markdown-lite to HTML paragraphs, emphasis, and lists", () => {
    expect(
      composeTextToHtml("Hello **world**\n\n- one\n- two"),
    ).toBe("<p>Hello <strong>world</strong></p><ul><li>one</li><li>two</li></ul>");
    expect(composeTextToHtml("See _this_ and __that__")).toBe(
      "<p>See <em>this</em> and <u>that</u></p>",
    );
  });

  it("escapes HTML and recognises markdown-lite formatting", () => {
    expect(composeTextToHtml("<script>")).toBe("<p>&lt;script&gt;</p>");
    expect(hasComposeFormatting("plain")).toBe(false);
    expect(hasComposeFormatting("**bold**")).toBe(true);
  });

  it("keeps a reply's leading blank line as a caret line above the quote", () => {
    const reply = "\n\nOn Nov 16, Maestro wrote:\n> Hello";
    expect(composeTextToHtml(reply)).toBe(
      "<p><br></p><p>On Nov 16, Maestro wrote:<br>&gt; Hello</p>",
    );
  });
});

describe("hasComposeUserContent", () => {
  const empty = { to: "", cc: "", bcc: "", subject: "", body: "" };

  it("ignores untouched seeds and whitespace-only edits", () => {
    const seed = { ...empty, body: "\n-- \nRoan" };
    expect(hasComposeUserContent(seed, seed)).toBe(false);
    expect(hasComposeUserContent({ ...seed, body: "  \n-- \n Roan \n" }, seed)).toBe(false);
    expect(hasComposeUserContent(empty, empty)).toBe(false);
  });

  it("detects typed recipients, subject, or body text", () => {
    const seed = { ...empty, to: "a@x.com", subject: "Re: hi", body: "> quoted" };
    expect(hasComposeUserContent({ ...seed, body: "Thanks\n> quoted" }, seed)).toBe(true);
    expect(hasComposeUserContent({ ...seed, subject: "Re: hi!" }, seed)).toBe(true);
    expect(hasComposeUserContent({ ...empty, cc: "b@x.com" }, empty)).toBe(true);
  });
});
