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

const seedNewMessage = jest.fn();

jest.mock("lucide-react", () =>
  new Proxy({}, { get: () => () => null }),
);

jest.mock("../../components/mail/mail-compose-context", () => ({
  getMailComposeBridge: jest.fn(),
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("@workspace/calendar-core", () => ({
  enrichSelfMailRecipient: (recipient: { email: string; name?: string | null }) =>
    recipient,
  isCurrentUserMailAddress: () => false,
}));

jest.mock("@workspace/ui/components/ui/popover", () => ({
  Popover: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open: boolean;
  }) => <div data-open={open}>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
}));

jest.mock("../../components/mail/mail-avatar", () => ({
  SenderAvatar: () => <span>avatar</span>,
}));

jest.mock("@workspace/ui/lib/utils", () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

import { RecipientPopover } from "../../components/mail/recipient-popover";
import { getMailComposeBridge } from "../../components/mail/mail-compose-bridge";

const mockGetMailComposeBridge = getMailComposeBridge as jest.MockedFunction<
  typeof getMailComposeBridge
>;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  seedNewMessage.mockReset();
  mockGetMailComposeBridge.mockReturnValue({
    seedNewMessage,
  } as never);
  Object.assign(navigator, {
    clipboard: {
      writeText: jest.fn(async () => undefined),
    },
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("RecipientPopover", () => {
  it("starts a new compose to the recipient", () => {
    act(() => {
      root.render(
        <RecipientPopover email="alice@example.com" name="Alice" />,
      );
    });

    const composeButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Email"),
    );

    act(() => {
      composeButton!.click();
    });

    expect(seedNewMessage).toHaveBeenCalledWith({
      email: "alice@example.com",
      name: "Alice",
    });
  });

  it("copies the email address to the clipboard", async () => {
    act(() => {
      root.render(<RecipientPopover email="alice@example.com" />);
    });

    const copyButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Copy"),
    );

    await act(async () => {
      copyButton!.click();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "alice@example.com",
    );
  });
});
