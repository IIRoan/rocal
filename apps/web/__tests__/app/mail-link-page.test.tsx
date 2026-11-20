/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";
import type { MailLink } from "@/lib/mail/mail-link-handoff";

const mockResolveMailLink = jest.fn<(id: string) => Promise<MailLink | null>>();
const mockOpenMailDocument = jest.fn();
const mockOpenMailLinkTarget = jest.fn();

jest.mock("@workspace/ui/components/layout", () => ({ Logo: () => <div>Solace</div> }));
jest.mock("@workspace/ui/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));
jest.mock("@/lib/mail/mail-link-handoff", () => ({
  canonicalMailLinkUrl: (href: string) => new URL(href),
  oneClickUnsubscribeUrl: (href: string) =>
    jest.requireActual<typeof import("@/lib/mail/mail-link-handoff")>("@/lib/mail/mail-link-handoff").oneClickUnsubscribeUrl(href),
  openMailDocument: (id?: string) => mockOpenMailDocument(id),
  openMailLinkTarget: (url: string) => mockOpenMailLinkTarget(url),
  resolveMailLink: (id: string) => mockResolveMailLink(id),
  takeMailLinkFragment: () =>
    jest.requireActual<typeof import("@/lib/mail/mail-link-handoff")>("@/lib/mail/mail-link-handoff").takeMailLinkFragment(),
}));

import MailLinkPage from "../../app/mail/link/page";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LINK_ID = "123e4567-e89b-12d3-a456-426614174000.3";

describe("MailLinkPage", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.history.replaceState(null, "", `/mail/link#${LINK_ID}`);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.clearAllMocks();
  });

  async function renderPage() {
    await act(async () => {
      root.render(<MailLinkPage />);
      await Promise.resolve();
    });
  }

  it("drops the fragment and loads Mail as a new document to compose a mailto link", async () => {
    mockResolveMailLink.mockResolvedValue({ href: "mailto:a@example.org?subject=Hi", text: "Write" });
    await renderPage();

    expect(mockResolveMailLink).toHaveBeenCalledWith(LINK_ID);
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/mail/link");
    expect(mockOpenMailDocument).toHaveBeenCalledWith(LINK_ID);
  });

  it("leaves for Mail with a full document load on cancel", async () => {
    mockResolveMailLink.mockResolvedValue({ href: "https://example.org/", text: "Example" });
    await renderPage();
    const close = jest.spyOn(window, "close").mockImplementation(() => {});

    const cancel = [...container.querySelectorAll("button")].find((button) => button.textContent === "Cancel");
    act(() => cancel?.click());
    expect(close).toHaveBeenCalled();
    expect(mockOpenMailDocument).toHaveBeenCalledWith(undefined);
    close.mockRestore();
  });

  it("says the link expired when the reader tab does not answer", async () => {
    mockResolveMailLink.mockResolvedValue(null);
    await renderPage();

    expect(container.textContent).toContain("This link has expired. Open it again from the message.");
    expect(mockOpenMailDocument).not.toHaveBeenCalled();
  });

  it("shows the real host and warnings before opening a web link", async () => {
    mockResolveMailLink.mockResolvedValue({ href: "https://PAYPAL.com.evil.test/login?x=1", text: "paypal.com" });
    await renderPage();

    expect(container.querySelector("h1")?.textContent).toBe("Open this link?");
    expect(container.textContent).toContain("Opens paypal.com.evil.test.");
    expect(container.textContent).toContain("The link text shows paypal.com, but it opens paypal.com.evil.test.");
    const open = [...container.querySelectorAll("button")].find((button) => button.textContent === "Open link");
    act(() => open?.click());
    expect(mockOpenMailLinkTarget).toHaveBeenCalledWith("https://paypal.com.evil.test/login?x=1");
  });

  it("posts the RFC 8058 one-click form to the sender after confirming", async () => {
    mockResolveMailLink.mockResolvedValue({
      href: "https://News.example/u?t=1",
      text: "owner@solace.test",
      kind: "unsubscribe",
    });
    await renderPage();

    expect(window.location.hash).toBe("");
    expect(container.querySelector("h1")?.textContent).toBe("Unsubscribe?");
    expect(container.textContent).toContain(
      "Solace asks news.example to remove owner@solace.test from this list. The sender sees your IP address.",
    );
    const form = container.querySelector("form");
    if (!form) throw new Error("The one-click form did not render");
    expect(form.getAttribute("method")).toBe("post");
    expect(form.getAttribute("action")).toBe("https://news.example/u?t=1");
    expect(form.getAttribute("rel")).toBe("noreferrer");
    let body: string | null = null;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      body = new URLSearchParams([...new FormData(form)].map(([key, value]) => [key, String(value)])).toString();
    });
    const submit = [...container.querySelectorAll("button")].find((button) => button.textContent === "Unsubscribe");
    act(() => submit?.click());
    expect(body).toBe("List-Unsubscribe=One-Click");
    expect(mockOpenMailLinkTarget).not.toHaveBeenCalled();
  });

  it.each(["http://news.example/u", "javascript:alert(1)", "not a url"])(
    "refuses a one-click target that is not https (%s)",
    async (href) => {
      mockResolveMailLink.mockResolvedValue({ href, text: "owner@solace.test", kind: "unsubscribe" });
      await renderPage();

      expect(container.querySelector("form")).toBeNull();
      expect(container.textContent).toContain("This link has expired. Open it again from the message.");
    },
  );

  it("does nothing for an unknown id", async () => {
    mockResolveMailLink.mockResolvedValue(null);
    await renderPage();

    expect(container.querySelector("form")).toBeNull();
    expect(mockOpenMailLinkTarget).not.toHaveBeenCalled();
    expect(mockOpenMailDocument).not.toHaveBeenCalled();
  });
});
