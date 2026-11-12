/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MailRuntime } from "../lib/mail/mail-runtime";
import type { JmapEmailMessage } from "../lib/mail/types";
import { useMailMessageActions } from "./use-mail-message-actions";

const mockMarkRead = jest.fn();
const runtime: Partial<MailRuntime> = { mailboxes: [] };

jest.mock("react-native", () => ({ Alert: { alert: jest.fn() } }));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock("@workspace/native-core/providers/ToastProvider", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));
jest.mock("../providers/MailComposeProvider", () => ({
  useMailCompose: () => ({ openCompose: jest.fn() }),
}));
jest.mock("./use-mail-list-settings", () => ({
  useMailListSettings: () => ({
    settings: { markAsReadDelay: "instant" },
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
    moveToTrash: {},
    deleteMessage: {},
    moveToMailbox: {},
    setMessageLabel: {},
  }),
  useSimpleLoginAliasAction: () => ({}),
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
