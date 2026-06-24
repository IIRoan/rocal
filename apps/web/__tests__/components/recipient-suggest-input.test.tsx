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

const mockSuggestions = [
  {
    email: "alice@example.com",
    displayName: "Alice",
    lastUsedAt: "2026-06-19T10:00:00.000Z",
    useCount: 2,
    contexts: ["mail"] as const,
  },
  {
    email: "bob@example.com",
    displayName: "Bob",
    lastUsedAt: "2026-06-18T10:00:00.000Z",
    useCount: 1,
    contexts: ["mail"] as const,
  },
];

jest.mock("@/hooks/use-recent-contacts", () => ({
  useRecentContacts: jest.fn(() => ({
    payload: { version: 1 as const, contacts: mockSuggestions },
    suggestions: mockSuggestions,
    isAvailable: true,
    isLoading: false,
    recordUsage: jest.fn(),
    flushPending: jest.fn(),
    reload: jest.fn(),
  })),
}));

jest.mock("../../components/mail/mail-avatar", () => ({
  SenderAvatar: ({ email }: { email: string }) => <span>{email}</span>,
}));

jest.mock("@workspace/ui/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverAnchor: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="suggestions">{children}</div>
  ),
}));

jest.mock("@workspace/ui/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

jest.mock("@workspace/ui/lib/utils", () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

import { RecipientSuggestInput } from "../../components/mail/recipient-suggest-input";

let container: HTMLDivElement;
let root: Root;
let onChange: jest.Mock<(value: string) => void>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  onChange = jest.fn();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  jest.clearAllMocks();
});

function renderInput(value = "") {
  act(() => {
    root.render(
      <RecipientSuggestInput
        value={value}
        onChange={onChange}
        placeholder="To"
        appearance="compose"
        mode="mail"
      />,
    );
  });
}

function getInput() {
  return container.querySelector("input") as HTMLInputElement;
}

describe("RecipientSuggestInput", () => {
  it("shows recent contacts on focus before typing", () => {
    renderInput("");

    act(() => {
      getInput().dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    });

    expect(container.querySelector('[data-testid="suggestions"]')).not.toBeNull();
    expect(container.textContent).toContain("Recent contacts");
    expect(container.textContent).toContain("alice@example.com");
  });

  it("shows recent contact suggestions while typing", () => {
    renderInput("al");

    act(() => {
      getInput().dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    });

    expect(container.querySelector('[data-testid="suggestions"]')).not.toBeNull();
    expect(container.textContent).toContain("alice@example.com");
  });

  it("inserts a selected suggestion into the field", () => {
    renderInput("al");

    act(() => {
      getInput().dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    });

    const option = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("alice@example.com"),
    );

    act(() => {
      option!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.stringContaining("alice@example.com"),
    );
  });

  it("selects the highlighted suggestion on Enter", () => {
    renderInput("a");

    act(() => {
      getInput().dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    });

    act(() => {
      getInput().dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
    });

    act(() => {
      getInput().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.stringContaining("alice@example.com"),
    );
  });

  it("appends after existing recipients when a comma-separated list is present", () => {
    renderInput("existing@example.com, al");

    act(() => {
      getInput().dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    });

    const option = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("alice@example.com"),
    );

    act(() => {
      option!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.stringMatching(/existing@example\.com.*alice@example\.com/),
    );
  });
});
