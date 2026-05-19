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

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@workspace/ui/components/ui/avatar", () => ({
  Avatar: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  AvatarFallback: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

jest.mock("@workspace/ui/lib/utils", () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

import { SenderAvatar } from "../../components/mail/mail-avatar";

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
  jest.clearAllMocks();
});

function render(props: { email: string; name?: string }) {
  act(() => {
    root.render(<SenderAvatar {...props} />);
  });
}

describe("SenderAvatar", () => {
  it("shows initials while the company logo is still loading", () => {
    render({ email: "alice@acme.com", name: "Alice Example" });

    expect(container.textContent).toContain("AE");
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("falls back to initials after all logo sources fail", () => {
    render({ email: "billing@acme.com" });

    const firstImage = container.querySelector("img");
    expect(firstImage).not.toBeNull();

    act(() => {
      firstImage!.dispatchEvent(new Event("error"));
    });

    const secondImage = container.querySelector("img");
    expect(secondImage).not.toBeNull();

    act(() => {
      secondImage!.dispatchEvent(new Event("error"));
    });

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("B");
  });
});
