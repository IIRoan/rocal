/** @jest-environment jsdom */

import React from "react";
import { describe, expect, it } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server.node";

import { HtmlEmailRenderer } from "@/components/mail/message-reader/html-email-renderer";

function renderFrame(html: string, blockRemoteImages: boolean) {
  const markup = renderToStaticMarkup(
    <HtmlEmailRenderer
      html={html}
      blockRemoteImages={blockRemoteImages}
      blockTrackingPixels
      isDark={false}
    />,
  );
  const frame = new DOMParser()
    .parseFromString(markup, "text/html")
    .querySelector("iframe");
  if (!frame) throw new Error("iframe not rendered");
  return frame;
}

describe("HtmlEmailRenderer", () => {
  it("sandboxes the frame without scripts or same-origin access", () => {
    const frame = renderFrame("<p>Hi</p>", true);
    const sandbox = frame.getAttribute("sandbox")?.split(/\s+/) ?? [];

    expect(sandbox).toEqual(["allow-popups", "allow-popups-to-escape-sandbox"]);
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("renders sanitized mail with an always-on CSP", () => {
    const frame = renderFrame(
      '<p onclick="alert(1)">Hi</p><script>alert(2)</script><img src="https://t.example/p.png"><a href="https://example.com">x</a>',
      true,
    );
    const srcDoc = frame.getAttribute("srcdoc") ?? "";

    expect(srcDoc).toContain("script-src 'none'");
    expect(srcDoc).toContain("img-src data: blob: cid:;");
    expect(srcDoc).not.toMatch(/onclick|<script|t\.example/);
    expect(srcDoc).toContain('href="https://example.com"');
    expect(srcDoc).toContain('rel="noopener noreferrer"');
  });

  it("allows remote images in the frame CSP once the user opts in", () => {
    const frame = renderFrame('<img src="https://example.com/banner.png">', false);
    const srcDoc = frame.getAttribute("srcdoc") ?? "";

    expect(srcDoc).toContain("img-src data: blob: cid: https: http:");
    expect(srcDoc).toContain("https://example.com/banner.png");
  });
});
