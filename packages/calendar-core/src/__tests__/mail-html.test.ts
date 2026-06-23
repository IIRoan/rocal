import { describe, expect, it } from "@jest/globals";
import { buildEmailHtmlDocument } from "../mail-html";

describe("buildEmailHtmlDocument", () => {
  it("includes rich text styles for lists, links, and quotes", () => {
    const doc = buildEmailHtmlDocument({
      processedHtml: "<p>Hello</p>",
      isDark: false,
      blockRemoteImages: false,
      hasOwnDark: false,
    });

    expect(doc).toContain("list-style-type:disc");
    expect(doc).toContain("list-style-type:decimal");
    expect(doc).toContain("text-decoration:underline");
    expect(doc).toContain("text-decoration:line-through");
    expect(doc).toContain("border-left:3px solid");
  });

  it("renders list markup in the email body", () => {
    const doc = buildEmailHtmlDocument({
      processedHtml: "<ul><li>one</li><li>two</li></ul>",
      isDark: false,
      blockRemoteImages: false,
      hasOwnDark: false,
    });

    expect(doc).toContain("<ul><li>one</li><li>two</li></ul>");
  });
});
