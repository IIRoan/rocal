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

jest.mock("lucide-react", () => {
  const React = require("react");

  const makeIcon = (name: string) =>
    function Icon(props: React.SVGProps<SVGSVGElement>) {
      return React.createElement("svg", {
        ...props,
        "data-icon": name,
      });
    };

  return {
    Lock: makeIcon("lock"),
    LockOpen: makeIcon("lock-open"),
    ShieldAlert: makeIcon("shield-alert"),
    ShieldCheck: makeIcon("shield-check"),
  };
});

jest.mock("../ui/popover", () => {
  const React = require("react");

  return {
    Popover: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    PopoverTrigger: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    PopoverContent: ({
      children,
      className,
    }: {
      children: React.ReactNode;
      className?: string;
    }) =>
      React.createElement(
        "div",
        { "data-testid": "popover", className },
        children,
      ),
  };
});

import { EncryptionStatusBadge } from "./encryption-status";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("EncryptionStatusBadge", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("hides plaintext items by default", () => {
    act(() => {
      root.render(<EncryptionStatusBadge item={{}} />);
    });

    expect(container.innerHTML).toBe("");
  });

  it("renders a plaintext badge when hidePlaintext is false", () => {
    act(() => {
      root.render(<EncryptionStatusBadge item={{}} hidePlaintext={false} />);
    });

    const button = container.querySelector(
      "button[aria-label='Not encrypted']",
    );
    const popover = container.querySelector("[data-testid='popover']");

    expect(button).not.toBeNull();
    expect(button?.querySelector("[data-icon='lock-open']")).not.toBeNull();
    expect(popover?.textContent).toContain(
      "Event details are readable to the server.",
    );
    expect(popover?.textContent).toContain("Server can read");
    expect(popover?.textContent).not.toContain("Encrypted on server");
  });

  it("renders a non-interactive icon when asIcon is true", () => {
    act(() => {
      root.render(
        <EncryptionStatusBadge
          item={{ encryptionState: "encrypted" }}
          asIcon
          className="custom-class"
        />,
      );
    });

    const badge = container.querySelector(
      "span[aria-label^='End-to-end encrypted']",
    );
    const button = container.querySelector("button");

    expect(button).toBeNull();
    expect(badge).not.toBeNull();
    expect(badge?.className).toContain("custom-class");
    expect(badge?.querySelector("[data-icon='shield-check']")).not.toBeNull();
  });

  it("describes readable calendar names even when event encryption is required", () => {
    act(() => {
      root.render(
        <EncryptionStatusBadge
          item={{ forceFullEncryption: true, encryptionState: "plaintext" }}
          kind="calendar"
          hidePlaintext={false}
        />,
      );
    });

    const button = container.querySelector(
      "button[aria-label='Not encrypted']",
    );
    const popover = container.querySelector("[data-testid='popover']");

    expect(button).not.toBeNull();
    expect(popover?.textContent).toContain(
      "The calendar name is readable to the server.",
    );
    expect(popover?.textContent).toContain("Calendar name");
    expect(popover?.textContent).toContain(
      "older plaintext events still need migration",
    );
    expect(popover?.textContent).not.toContain("Title");
  });

  it("renders legacy pending items with the expected server-visible fields", () => {
    act(() => {
      root.render(
        <EncryptionStatusBadge item={{ encryptionState: "shadow_write" }} />,
      );
    });

    const button = container.querySelector(
      "button[aria-label='Encryption pending']",
    );
    const popover = container.querySelector("[data-testid='popover']");

    expect(button).not.toBeNull();
    expect(popover?.textContent).toContain(
      "An encrypted copy exists, but a readable copy may remain on the server.",
    );
    expect(popover?.textContent).toContain("Title");
    expect(popover?.querySelector("[data-icon='shield-check']")).toBeNull();
  });
});
