/** @jest-environment jsdom */
import React from "react";
import { expect, it, jest } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server.node";
import PrivacyPage from "../../app/privacy/page";
import SupportPage from "../../app/support/page";
import { AccountMoreLinks } from "../../components/command-palette/account-settings-more-links";

jest.mock("lucide-react", () => ({
  ArrowLeft: () => <svg aria-hidden="true" />,
  HelpCircle: () => <svg aria-hidden="true" />,
  Shield: () => <svg aria-hidden="true" />,
  Users: () => <svg aria-hidden="true" />,
}));
jest.mock("@workspace/ui/components/layout", () => ({
  Logo: () => <span>Solace</span>,
  ThemeToggle: () => <button aria-label="Toggle theme" />,
}));
jest.mock("next/image", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("../../components/command-palette/palette-ui", () => ({
  PaletteSection: ({
    label,
    children,
  }: {
    label: string;
    children: React.ReactNode;
  }) => <section aria-label={label}>{children}</section>,
  PaletteNavRow: () => <button />,
}));

function render(element: React.ReactNode) {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(element);
  return container;
}

it.each([PrivacyPage, SupportPage])(
  "renders public information without an authenticated session",
  (Page) => {
    const page = render(<Page />);
    expect(page.querySelector("h1")?.textContent).toBeTruthy();
    expect(page.querySelector('a[href="/support"]')).not.toBeNull();
    expect(page.querySelector('a[href="/privacy"]')).not.toBeNull();
    expect(page.querySelector('a[href="/"]')).not.toBeNull();
  },
);

it("explains actual retention windows and the limits of account deletion", () => {
  const page = render(<PrivacyPage />);
  expect(page.textContent).toContain("30 days");
  expect(page.textContent).toContain("180 days");
  expect(page.textContent).toContain("recipients retain messages");
  expect(page.querySelector("#providers")?.textContent).toContain("Expo");
  expect(page.querySelector("#calendar-encryption")).not.toBeNull();
});

it("provides recovery and deletion help and keeps private data out of public reports", () => {
  const page = render(<SupportPage />);
  expect(page.textContent).toContain(
    "A login reset cannot recover your encryption keys",
  );
  expect(page.textContent).toContain("Delete account");
  expect(page.textContent).toContain("Reports are public");
  expect(
    page.querySelector('nav a[aria-current="page"]')?.getAttribute("href"),
  ).toBe("/support");
});

it("keeps help links available in web account settings when optional actions are absent", () => {
  const page = render(<AccountMoreLinks isBusy={false} />);
  expect(page.querySelector('section[aria-label="More"]')).toBeNull();
  expect(
    page.querySelector('a[href="/privacy"]')?.getAttribute("rel"),
  ).toContain("noopener");
  expect(page.querySelector('a[href="/support"]')).not.toBeNull();
});
