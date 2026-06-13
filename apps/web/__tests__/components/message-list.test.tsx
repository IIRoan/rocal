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
import { MessageList } from "../../components/mail/message-list";
import type { JmapEmailMessage } from "@/lib/mail/types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({
    count,
    getItemKey,
  }: {
    count: number;
    getItemKey?: (index: number) => string;
  }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        start: index * 68,
        size: 68,
        key: getItemKey?.(index) ?? String(index),
      })),
    getTotalSize: () => count * 68,
    scrollToIndex: jest.fn(),
    measure: jest.fn(),
    measureElement: jest.fn(),
  }),
}));

jest.mock("@gsap/react", () => ({
  useGSAP: jest.fn(),
}));

jest.mock("gsap", () => ({
  __esModule: true,
  default: {
    fromTo: jest.fn(),
    to: jest.fn(),
  },
}));

jest.mock("@workspace/ui/lib/utils", () => ({
  cn: (...args: Array<string | false | null | undefined>) =>
    args.filter(Boolean).join(" "),
}));

jest.mock("@workspace/ui/components/ui/context-menu", () => {
  const Passthrough = ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  );

  return {
    ContextMenu: Passthrough,
    ContextMenuContent: Passthrough,
    ContextMenuItem: ({
      children,
      onClick,
    }: {
      children: React.ReactNode;
      onClick?: () => void;
    }) => <button onClick={onClick}>{children}</button>,
    ContextMenuPortal: Passthrough,
    ContextMenuSeparator: () => <hr />,
    ContextMenuSub: Passthrough,
    ContextMenuSubContent: Passthrough,
    ContextMenuSubTrigger: ({ children }: { children: React.ReactNode }) => (
      <button>{children}</button>
    ),
    ContextMenuTrigger: ({
      children,
      asChild,
    }: {
      children: React.ReactElement;
      asChild?: boolean;
    }) => (asChild ? children : <button>{children}</button>),
  };
});

jest.mock("@workspace/ui/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({
    children,
    asChild,
  }: {
    children: React.ReactElement;
    asChild?: boolean;
  }) => (asChild ? children : <button>{children}</button>),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock("@workspace/ui/components/ui", () => ({
  AppLoadingState: () => <div>Loading...</div>,
}));

jest.mock("../../components/mail/mail-avatar", () => ({
  SenderAvatar: () => <div data-testid="sender-avatar" />,
}));

jest.mock("lucide-react", () => {
  const Icon = (props: React.SVGProps<SVGSVGElement>) => <svg {...props} />;

  return {
    Trash2: Icon,
    FolderInput: Icon,
    MailOpen: Icon,
    MailCheck: Icon,
    CheckSquare: Icon,
    Square: Icon,
    MoreHorizontal: Icon,
    Search: Icon,
    Star: Icon,
    Paperclip: Icon,
    MessageSquare: Icon,
  };
});

describe("MessageList", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    class MockResizeObserver {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    globalThis.ResizeObserver =
      MockResizeObserver as typeof ResizeObserver;

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  const message: JmapEmailMessage = {
    id: "message-1",
    threadId: "thread-1",
    subject: "Hello",
    from: [{ email: "ada@example.com", name: "Ada" }],
    receivedAt: "2026-05-20T10:00:00.000Z",
    keywords: {},
  };

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
      root = null;
    }
    container?.remove();
    container = null;
  });

  it("avoids nested buttons while keeping row and selection controls interactive", () => {
    const onSelect = jest.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const renderedContainer = container;
    const renderedRoot = root;

    act(() => {
      renderedRoot.render(
        <MessageList
          messages={[message]}
          selectedMessageId={null}
          onSelect={onSelect}
        />,
      );
    });

    expect(renderedContainer.querySelector("button button")).toBeNull();

    const selectButton = renderedContainer.querySelector(
      'button[aria-label="Select message"]',
    );
    expect(selectButton).not.toBeNull();

    act(() => {
      selectButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSelect).not.toHaveBeenCalled();
    expect(renderedContainer.textContent).toContain("1 selected");

    const row = renderedContainer.querySelector(
      '.group\\/row[role="button"]',
    ) as HTMLDivElement | null;
    expect(row).not.toBeNull();

    act(() => {
      row?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });

    expect(onSelect).toHaveBeenCalledWith("message-1");
  });
});
