/** @jest-environment jsdom */

import React, { act } from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server.node";
import type { MailLink } from "@/lib/mail/mail-link-handoff";

const mockRegisterMailLinks = jest.fn<(links: ReadonlyArray<MailLink & { id: string }>) => void>();

jest.mock("@/lib/mail/mail-link-handoff", () => ({
  ...jest.requireActual<typeof import("@/lib/mail/mail-link-handoff")>("@/lib/mail/mail-link-handoff"),
  registerMailLinks: (links: ReadonlyArray<MailLink & { id: string }>) => mockRegisterMailLinks(links),
}));

import { HtmlEmailRenderer } from "@/components/mail/message-reader/html-email-renderer";

function renderFrame(html: string, blockRemoteImages: boolean, confirmExternalLinks = false) {
  const markup = renderToStaticMarkup(
    <HtmlEmailRenderer
      html={html}
      blockRemoteImages={blockRemoteImages}
      blockTrackingPixels
      confirmExternalLinks={confirmExternalLinks}
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

  it("hands mailto links to the opaque link page instead of the OS", () => {
    const frame = renderFrame('<a href="mailto:a@example.org?subject=Hi">Write</a><a href="mailto:b@example.org">B</a>', true);
    const srcDoc = frame.getAttribute("srcdoc") ?? "";

    expect(srcDoc).not.toContain('href="mailto:');
    const ids = [...srcDoc.matchAll(/href="http:\/\/localhost\/mail\/link#([0-9a-f-]{36})\.(\d+)"/g)];
    expect(ids.map((match) => match[2])).toEqual(["0", "1"]);
    expect(ids[0]?.[1]).toBe(ids[1]?.[1]);
  });

  it("hands every web link to the link check while confirmation is on", () => {
    const srcDoc = renderFrame('<a href="https://example.com/a?utm_source=x&amp;id=1">Example</a>', true, true).getAttribute("srcdoc") ?? "";

    expect(srcDoc).toMatch(/href="http:\/\/localhost\/mail\/link#[0-9a-f-]{36}\.0"/);
    expect(srcDoc).toContain('title="https://example.com/a?id=1"');
  });

  it("hands off only warned web links while confirmation is off", () => {
    const srcDoc = renderFrame(
      '<a href="https://example.com/">Example</a><a href="https://evil.test/">bank.example</a><a href="https://xn--pple-43d.com/">Apple</a>',
      true,
    ).getAttribute("srcdoc") ?? "";

    expect(srcDoc).toContain('href="https://example.com/"');
    expect(srcDoc).not.toContain('href="https://evil.test/"');
    expect(srcDoc).not.toContain('href="https://xn--pple-43d.com/"');
    expect(srcDoc.match(/\/mail\/link#/g)).toHaveLength(2);
  });

  it("registers each link set once, under ids no other set reuses", () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    const root = createRoot(container);
    const render = (html: string, isDark = false) =>
      act(() =>
        root.render(
          <HtmlEmailRenderer html={html} blockRemoteImages blockTrackingPixels confirmExternalLinks={false} isDark={isDark} />,
        ),
      );

    render('<a href="mailto:a@example.org">A</a>');
    render('<a href="mailto:a@example.org">A</a>', true);
    render('<a href="mailto:b@example.org">B</a>');
    act(() => root.unmount());

    const registered = mockRegisterMailLinks.mock.calls.map(([links]) => links.map(({ id, href }) => ({ id, href })));
    expect(registered).toHaveLength(2);
    expect(registered[0]?.[0]?.href).toBe("mailto:a@example.org");
    expect(registered[1]?.[0]?.href).toBe("mailto:b@example.org");
    expect(registered[1]?.[0]?.id).not.toBe(registered[0]?.[0]?.id);
  });
});
