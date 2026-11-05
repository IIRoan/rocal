/** @jest-environment jsdom */

import React, { act, useState } from "react";
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

jest.mock("lucide-react", () => new Proxy({}, { get: () => () => null }));

const mockRemoveContact = jest.fn(async (_email: string) => undefined);
const mockContact = { email: "ada@example.com", displayName: "Ada", contexts: [] };

jest.mock("@/hooks/use-recent-contacts", () => ({
  useRecentContacts: () => ({
    payload: { contacts: [mockContact] },
    filterContacts: () => [mockContact],
    addContact: jest.fn(),
    updateContact: jest.fn(),
    removeContact: mockRemoveContact,
    isLoading: false,
    isAvailable: true,
  }),
}));

jest.mock("@/hooks/use-hidden-mailbox-ids", () => {
  const { useState } = jest.requireActual<typeof import("react")>("react");
  return {
    useHiddenMailboxIds: () => {
      const [hiddenIds, setHiddenIds] = useState<string[]>([]);
      const toggleHidden = (id: string) =>
        setHiddenIds((current) =>
          current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
        );
      return { hiddenIds, toggleHidden };
    },
  };
});

jest.mock("@/components/solace-avatar", () => ({ SolaceAvatar: () => null }));

jest.mock("@workspace/ui/components/ui/tooltip", () => ({
  ...jest.requireActual<object>("@workspace/ui/components/ui/tooltip"),
  SimpleTooltip: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@/lib/mail/schedule-mail-settings-sync", () => ({
  scheduleMailSettingsServerSync: jest.fn(),
}));

import { LabelPickerPanel } from "@/components/mail/label-picker-panel";
import { MailboxManager } from "@/components/mail/mailbox-manager";
import { ContactsSettingsPanel } from "@/components/mail/contacts-settings-panel";
import type { JmapMailbox, LabelDef } from "@/lib/mail/types";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function button(text: string) {
  const match = Array.from(container.querySelectorAll("button")).find(
    (entry) => entry.textContent?.includes(text) || entry.getAttribute("aria-label") === text,
  );
  if (!match) throw new Error(`Missing button: ${text}`);
  return match;
}

function status() {
  return container.querySelector('[role="status"]')?.textContent ?? "";
}

describe("label picker", () => {
  const labels = [{ id: "l1", name: "Work", color: "#3b82f6" }] as LabelDef[];

  it("exposes the assigned state and deletes only on the second press", () => {
    const onDeleteLabel = jest.fn();
    act(() =>
      root.render(
        <LabelPickerPanel
          labels={labels}
          messageKeywords={{ "label:l1": true }}
          onToggleLabel={jest.fn()}
          onDeleteLabel={onDeleteLabel}
        />,
      ),
    );

    expect(button("Work").getAttribute("aria-pressed")).toBe("true");
    act(() => button("Delete label Work").click());
    expect(onDeleteLabel).not.toHaveBeenCalled();
    expect(status()).toContain("Delete “Work”?");
    act(() => button("Delete label Work").click());
    expect(onDeleteLabel).toHaveBeenCalledWith("l1");
    expect(status()).toBe("");
  });
});

describe("mailbox manager", () => {
  const mailboxes = [{ id: "m1", name: "Receipts" }] as JmapMailbox[];

  function Harness({ onDeleteMailbox }: { onDeleteMailbox: (id: string) => Promise<void> }) {
    const [stack, setStack] = useState(["mailboxes"]);
    return (
      <MailboxManager
        mailboxes={mailboxes}
        currentView={stack[stack.length - 1] ?? "mailboxes"}
        onBack={() => setStack((current) => current.slice(0, -1))}
        onNavigateTo={(view) => setStack((current) => [...current, view])}
        onCreateMailbox={jest.fn(async () => undefined)}
        onDeleteMailbox={onDeleteMailbox}
      />
    );
  }

  it("keeps the visibility toggle name stable and states what deleting loses", async () => {
    const onDeleteMailbox = jest.fn(async (_mailboxId: string) => undefined);
    act(() => root.render(<Harness onDeleteMailbox={onDeleteMailbox} />));

    const toggle = button("Show Receipts in sidebar");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    act(() => toggle.click());
    expect(button("Show Receipts in sidebar").getAttribute("aria-pressed")).toBe("false");

    act(() => button("Receipts").click());
    act(() => button("Delete mailbox…").click());
    expect(onDeleteMailbox).not.toHaveBeenCalled();
    expect(status()).toContain("permanently deleted");
    await act(async () => button("Delete mailbox").click());
    expect(onDeleteMailbox).toHaveBeenCalledWith("m1");
  });

  it("reorders mailboxes within their section with buttons and keeps focus on the moved one", async () => {
    const onReorder = jest.fn<(reordered: JmapMailbox[]) => void>();
    function ReorderHarness() {
      const [ordered, setOrdered] = useState([
        { id: "in", name: "Inbox", role: "inbox", sortOrder: 0 },
        { id: "s", name: "Sent", role: "sent", sortOrder: 1 },
        { id: "r", name: "Receipts", sortOrder: 2 },
        { id: "t", name: "Travel", sortOrder: 3 },
      ] as JmapMailbox[]);
      return (
        <MailboxManager
          mailboxes={ordered}
          currentView="mailboxes"
          onBack={jest.fn()}
          onNavigateTo={jest.fn()}
          onCreateMailbox={jest.fn(async () => undefined)}
          onDeleteMailbox={jest.fn(async () => undefined)}
          onReorderMailboxes={(reordered) => {
            onReorder(reordered);
            setOrdered(reordered.map((mailbox, sortOrder) => ({ ...mailbox, sortOrder })));
          }}
        />
      );
    }
    act(() => root.render(<ReorderHarness />));

    expect(button("Move Receipts up").getAttribute("aria-disabled")).toBe("true");
    act(() => button("Move Receipts up").click());
    expect(onReorder).not.toHaveBeenCalled();

    const moveDown = button("Move Receipts down");
    act(() => moveDown.focus());
    act(() => moveDown.click());
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));

    expect(onReorder.mock.calls[0]?.[0].map((mailbox) => mailbox.id)).toEqual(["in", "s", "t", "r"]);
    expect(button("Move Receipts down")).toBe(moveDown);
    expect(moveDown.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(moveDown);
    expect(button("Move Travel up").getAttribute("aria-disabled")).toBe("true");

    expect(button("Move Inbox up").getAttribute("aria-disabled")).toBe("true");
    act(() => button("Move Inbox down").click());
    expect(onReorder.mock.calls[1]?.[0].map((mailbox) => mailbox.id)).toEqual(["s", "in", "t", "r"]);
    expect(button("Move Inbox down").getAttribute("aria-disabled")).toBe("true");
    expect(button("Move Sent up").getAttribute("aria-disabled")).toBe("true");
  });
});

describe("contacts", () => {
  it("asks before removing a contact", async () => {
    act(() => root.render(<ContactsSettingsPanel goBack={jest.fn()} />));

    act(() => button("ada@example.com").click());
    act(() => button("Remove contact…").click());
    expect(mockRemoveContact).not.toHaveBeenCalled();
    expect(status()).toContain("Remove “Ada” from contacts?");
    await act(async () => button("Remove contact").click());
    expect(mockRemoveContact).toHaveBeenCalledWith("ada@example.com");
  });
});
