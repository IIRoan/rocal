/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MailRuntime } from "../lib/mail/mail-runtime";
import type { JmapEmailMessage } from "../lib/mail/types";
import { useMailMessageActions } from "./use-mail-message-actions";

const mockMarkRead = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockSetReaderOrder = jest.fn();
const mockTrash = jest.fn();
const mockSettings = { markAsReadDelay: "instant", autoAdvance: "next" };
let mockReaderOrder: string[] = [];
const runtime: Partial<MailRuntime> = { mailboxes: [] };

jest.mock("react-native", () => ({ Alert: { alert: jest.fn() } }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace }),
}));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));
jest.mock("../providers/MailSelectionProvider", () => ({
  useMailSelection: () => ({
    readerOrder: mockReaderOrder,
    setReaderOrder: mockSetReaderOrder,
  }),
}));
jest.mock("@workspace/native-core/lib/constants", () => ({ CALENDAR_SCHEME: "solace" }));
jest.mock("@workspace/native-core/lib/query-keys", () => ({ QUERY_KEYS: {} }));
jest.mock("@workspace/native-core/providers/ToastProvider", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));
jest.mock("../providers/MailComposeProvider", () => ({
  useMailCompose: () => ({ openCompose: jest.fn() }),
}));
jest.mock("./use-mail-list-settings", () => ({
  useMailListSettings: () => ({
    settings: mockSettings,
    isLoaded: true,
  }),
}));
jest.mock("./use-mail-undo-toast", () => ({
  useMailUndoToast: () => jest.fn(),
}));
jest.mock("../lib/mail/attachment-cache", () => ({}));
jest.mock("../lib/mail/use-mail", () => ({
  useMailMutations: () => ({
    markAsRead: { mutate: mockMarkRead },
    markAsUnread: {},
    toggleFlagged: {},
    moveToTrash: { mutate: mockTrash },
    deleteMessage: {},
    moveToMailbox: {},
    setMessageLabel: {},
  }),
  useSimpleLoginAliasAction: () => ({}),
  useMailUnsubscribeAction: () => ({}),
  releaseMarkAsReadSuppression: jest.fn(),
  suppressMarkAsRead: jest.fn(),
}));

function Reader({ message }: { message: JmapEmailMessage | null }) {
  useMailMessageActions({
    messageId: "a",
    message,
    runtime: runtime as MailRuntime,
  });
  return null;
}

describe("reader auto-read readiness", () => {
  let root: Root;
  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    mockMarkRead.mockClear();
    root = createRoot(document.createElement("div"));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
  });

  it.each([null, { id: "previous" }])(
    "waits for the requested message when the current copy is %p",
    async (message) => {
      await act(async () => {
        root.render(<Reader message={message} />);
      });
      expect(mockMarkRead).not.toHaveBeenCalled();
      await act(async () => {
        root.render(<Reader message={{ id: "a", keywords: {} }} />);
      });
      expect(mockMarkRead).toHaveBeenCalledTimes(1);
      expect(mockMarkRead).toHaveBeenCalledWith("a");
      await act(async () => {
        root.render(<Reader message={{ id: "a", keywords: {} }} />);
      });
      expect(mockMarkRead).toHaveBeenCalledTimes(1);
    },
  );
});

function TrashButton() {
  const { handleMoveToTrash } = useMailMessageActions({
    messageId: "a",
    message: { id: "a", keywords: { $seen: true } },
    runtime: runtime as MailRuntime,
  });
  return <button type="button" onClick={handleMoveToTrash} />;
}

describe("reader auto-advance", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    jest.clearAllMocks();
    mockTrash.mockImplementation(
      (_id: string, options: { onSuccess: (...args: unknown[]) => void }) =>
        options.onSuccess(undefined, "a", undefined),
    );
    container = document.createElement("div");
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    mockSettings.autoAdvance = "next";
    mockReaderOrder = [];
  });

  async function trashOpenMessage() {
    await act(async () => root.render(<TrashButton />));
    await act(async () => container.querySelector("button")?.click());
  }

  it("opens the next message in list order", async () => {
    mockReaderOrder = ["z", "a", "b"];
    await trashOpenMessage();
    expect(mockReplace).toHaveBeenCalledWith("/mail/message/b");
    expect(mockSetReaderOrder).toHaveBeenCalledWith(["z", "b"]);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("returns to the list without a known order", async () => {
    await trashOpenMessage();
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("returns to the list when set to", async () => {
    mockSettings.autoAdvance = "list";
    mockReaderOrder = ["a", "b"];
    await trashOpenMessage();
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
