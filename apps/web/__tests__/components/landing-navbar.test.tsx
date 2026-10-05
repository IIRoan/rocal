/** @jest-environment jsdom */

import React, { act } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";
import { LandingNavbar } from "../../components/landing/landing-navbar";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/link", () => ({
  __esModule: true,
  default: (props: React.ComponentProps<"a">) => <a {...props} />,
}));

jest.mock("lucide-react", () => ({
  Menu: () => <svg aria-hidden />,
  ArrowRight: () => <svg aria-hidden />,
}));

jest.mock("@workspace/ui/components/layout/logo", () => ({
  __esModule: true,
  default: () => <svg aria-hidden />,
}));

jest.mock("@workspace/ui/components/layout/theme-toggle", () => ({
  ThemeToggle: () => <button aria-label="Toggle dark mode" />,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function getMenuButton() {
  const button = container.querySelector<HTMLButtonElement>(
    '[aria-label="Open navigation menu"]',
  );
  if (!button) throw new Error("Navigation trigger is missing");
  return button;
}

describe("LandingNavbar", () => {
  it("closes the mobile menu when a homepage section is selected", async () => {
    await act(async () => {
      root.render(<LandingNavbar onSignIn={jest.fn()} isLeaving={false} />);
    });

    await act(async () => getMenuButton().click());

    const navigation = document.querySelector(
      '[aria-label="Mobile navigation"]',
    );
    expect(navigation).not.toBeNull();
    expect(
      Array.from(navigation?.querySelectorAll("a") ?? []).map((link) =>
        link.getAttribute("href"),
      ),
    ).toEqual(["#calendar", "#mail", "/privacy"]);

    const calendarLink = navigation?.querySelector<HTMLAnchorElement>(
      'a[href="#calendar"]',
    );
    if (!calendarLink) throw new Error("Calendar link is missing");

    await act(async () => calendarLink.click());

    expect(getMenuButton().getAttribute("aria-expanded")).toBe("false");
    expect(
      document.querySelector('[aria-label="Mobile navigation"]'),
    ).toBeNull();
  });

  it("dismisses the mobile menu with Escape and restores trigger focus", async () => {
    await act(async () => {
      root.render(<LandingNavbar onSignIn={jest.fn()} isLeaving={false} />);
    });

    const trigger = getMenuButton();
    trigger.focus();
    await act(async () => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    await act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("uses the existing sign-in action and prevents repeat navigation", async () => {
    const onSignIn = jest.fn();
    await act(async () => {
      root.render(<LandingNavbar onSignIn={onSignIn} isLeaving={false} />);
    });

    const signIn = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Sign in",
    );
    if (!signIn) throw new Error("Sign-in action is missing");

    await act(async () => signIn.click());
    expect(onSignIn).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(<LandingNavbar onSignIn={onSignIn} isLeaving />);
    });
    expect(signIn.disabled).toBe(true);
    await act(async () => signIn.click());
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });
});
