/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";
import type { MailLink } from "@/lib/mail/mail-link-handoff";

const mockReplace = jest.fn();
const mockRouter = { replace: mockReplace };
const mockResolveMailLink = jest.fn<(id: string) => Promise<MailLink | null>>();
const mockSetPendingMailto = jest.fn();

jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
jest.mock("@workspace/ui/components/layout", () => ({ Logo: () => <div>Solace</div> }));
jest.mock("@/lib/mail/mail-link-handoff", () => ({
  resolveMailLink: (id: string) => mockResolveMailLink(id),
  setPendingMailto: (draft: unknown) => mockSetPendingMailto(draft),
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

  it("drops the fragment and opens compose in Mail for a mailto link", async () => {
    mockResolveMailLink.mockResolvedValue({ href: "mailto:a@example.org?subject=Hi", text: "Write" });
    await renderPage();

    expect(mockResolveMailLink).toHaveBeenCalledWith(LINK_ID);
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/mail/link");
    expect(mockSetPendingMailto).toHaveBeenCalledWith({
      to: ["a@example.org"],
      cc: [],
      bcc: [],
      subject: "Hi",
      body: "",
    });
    expect(mockReplace).toHaveBeenCalledWith("/mail");
  });

  it("says the link expired when the reader tab does not answer", async () => {
    mockResolveMailLink.mockResolvedValue(null);
    await renderPage();

    expect(container.textContent).toContain("This link has expired. Open it again from the message.");
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
