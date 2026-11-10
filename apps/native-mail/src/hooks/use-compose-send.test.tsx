/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMailSendAttempts, discardMailSendAttempt, DEFAULT_MAIL_COMPOSE_SETTINGS } from "@workspace/calendar-core";
import { buildMailRuntime } from "../lib/mail/mail-runtime";
import type { MailRuntime } from "../lib/mail/mail-runtime";
import { INITIAL_COMPOSE_FORM } from "../lib/mail/compose-form";
import type { ComposeMode } from "../lib/mail/compose-request";
import type { JmapEmailMessage } from "../lib/mail/types";
import { resolveComposeContext } from "../lib/mail/use-mail";
import { useComposeSend } from "./use-compose-send";
import { resolveOutgoingMessageBody } from "../lib/mail/outgoing-message-crypto";
import type { PendingComposeAttachment } from "../lib/mail/compose-attachments";

const mockSetError = jest.fn();
const mockOnSent = jest.fn();
const mockUploadBlob = jest.fn(async () => ({ blobId: "plain-blob", size: 3 }));

const mockSendMessage = jest.fn(
  async (_session: unknown, _input: Record<string, unknown>) => ({
    emailId: "reply",
    threadId: "conversation",
    submissionId: "submission",
  }),
);

jest.mock("react-native", () => ({ Alert: { alert: jest.fn() } }));
jest.mock("@workspace/native-core/providers/AuthProvider", () => ({}));
jest.mock("@workspace/native-core/providers/E2eeProvider", () => ({}));
jest.mock("@workspace/native-core/providers/ToastProvider", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));
jest.mock("@workspace/native-core/hooks/use-recent-contacts", () => ({
  useRecentContacts: () => ({ recordUsage: jest.fn() }),
}));
jest.mock("../lib/mail/mail-api", () => ({}));
jest.mock("../lib/mail/account-bootstrap", () => ({}));
jest.mock("../lib/search/local-mail-search", () => ({}));
jest.mock("expo-web-browser", () => ({}));
jest.mock("../lib/mail/outgoing-message-crypto", () => ({
  resolveOutgoingMessageBody: jest.fn(async () => ({
    kind: "inline",
    textBody: "-----BEGIN PGP MESSAGE-----sealed",
    encrypted: true,
    isCurrent: () => true,
    contentFingerprint: "a".repeat(64),
    sentCopyCiphertext: null,
  })),
}));
jest.mock("../lib/mail/mail-runtime", () => ({
  buildMailRuntime: jest.fn(async () => ({
    config: { defaultDomain: "solace.test" },
    client: {
      sendMessage: mockSendMessage,
      uploadBlob: mockUploadBlob,
      ensureEncryptOnAppendDisabled: jest.fn(async () => {}),
    },
    session: { accounts: {}, primaryAccounts: {}, apiUrl: "" },
    identities: [{ id: "self", email: "self@solace.test" }],
    mailboxes: [
      { id: "drafts", role: "drafts" },
      { id: "sent", role: "sent" },
    ],
    mailServerPolicy: jest
      .requireActual<typeof import("@workspace/calendar-core")>(
        "@workspace/calendar-core",
      )
      .resolveMailServerPolicy(),
  })),
  refreshMailRuntimePolicy: jest.fn(async (runtime: unknown) => runtime),
}));

const original: JmapEmailMessage = {
  id: "original",
  threadId: "conversation",
  messageId: ["parent@solace.test"],
  references: ["root@solace.test"],
};

function Composer({
  runtime,
  mode,
  attachments = [],
  recipient = "peer@solace.test",
}: {
  runtime: MailRuntime;
  mode: ComposeMode | undefined;
  attachments?: PendingComposeAttachment[];
  recipient?: string;
}) {
  const compose = useComposeSend({
    sendScope: "compose:test-session",
    runtime,
    mode,
    sourceMessage: original,
    form: {
      ...INITIAL_COMPOSE_FORM,
      to: recipient,
      attachments,
      subject: "Re: Plans",
      body: "My reply",
    },
    identity: null,
    identityId: "self",
    composeContext: resolveComposeContext(runtime),
    settings: DEFAULT_MAIL_COMPOSE_SETTINGS,
    signatureOptions: { separator: true },
    settleDraftSave: async () => null,
    setError: mockSetError,
    onSent: mockOnSent,
  });
  return (
    <button type="button" onClick={compose.send}>
      Send
    </button>
  );
}

describe("native reply send headers", () => {
  let root: Root;
  let container: HTMLDivElement;
  let queryClient: QueryClient;

  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    clearMailSendAttempts();
    jest.clearAllMocks();
    mockSendMessage.mockReset();
    mockSendMessage.mockResolvedValue({
      emailId: "reply",
      threadId: "conversation",
      submissionId: "submission",
    });
    jest.mocked(resolveOutgoingMessageBody).mockReset();
    jest
      .mocked(resolveOutgoingMessageBody)
      .mockResolvedValue({
        kind: "inline",
        textBody: "-----BEGIN PGP MESSAGE-----sealed",
        encrypted: true,
        isCurrent: () => true,
        contentFingerprint: "a".repeat(64),
        sentCopyCiphertext: null,
      });
    container = document.createElement("div");
    root = createRoot(container);
    queryClient = new QueryClient();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    queryClient.clear();
  });

  async function send(
    mode: ComposeMode | undefined,
    options: {
      attachments?: PendingComposeAttachment[];
      doubleClick?: boolean;
      recipient?: string;
      expectSend?: boolean;
    } = {},
  ) {
    const runtime = await buildMailRuntime();
    await act(async () =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <Composer
            runtime={runtime}
            mode={mode}
            attachments={options.attachments}
            recipient={options.recipient}
          />
        </QueryClientProvider>,
      ),
    );
    await act(async () => {
      container.querySelector("button")?.click();
      if (options.doubleClick) container.querySelector("button")?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockSendMessage).toHaveBeenCalledTimes(
      options.expectSend === false ? 0 : 1,
    );
    return mockSendMessage.mock.calls[0]?.[1];
  }

  it("does not close a new editor when an old queued send completes", async () => {
    let finish: ((value: { emailId: string; threadId: string; submissionId: string }) => void) | undefined;
    mockSendMessage.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const submitted = await send("reply");
    expect(submitted?.isCurrent).toEqual(expect.any(Function));
    discardMailSendAttempt("compose:test-session");
    await act(async () => { finish?.({ emailId: "old", threadId: "old-thread", submissionId: "old-receipt" }); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(mockOnSent).not.toHaveBeenCalled();
    expect(mockSetError.mock.calls).toEqual([[null]]);
  });

  it.each(["reply", "reply-all"] as const)(
    "sends %s with its original message lineage through the JMAP transport",
    async (mode) => {
      const submitted = await send(mode);
      expect(submitted).toEqual(
        expect.objectContaining({
          inReplyTo: ["parent@solace.test"],
          references: ["root@solace.test", "parent@solace.test"],
          sendScope: "compose:test-session",
          contentFingerprint: "a".repeat(64),
          textBody: "-----BEGIN PGP MESSAGE-----sealed",
          sentCopyCiphertext: null,
        }),
      );
      expect(JSON.stringify(submitted)).not.toContain("My reply");
    },
  );

  it.each(["forward", undefined] as const)(
    "keeps %s out of the source conversation",
    async (mode) => {
      const submitted = await send(mode);
      expect(submitted?.inReplyTo).toBeUndefined();
      expect(submitted?.references).toBeUndefined();
    },
  );
  const attachment: PendingComposeAttachment = {
    id: "fixture",
    name: "fixture.txt",
    type: "text/plain",
    size: 3,
    bytes: new Uint8Array([1, 2, 3]),
  };

  it.each([undefined, "reply", "reply-all", "forward", "draft"] as const)(
    "keeps plaintext attachment uploads out of encrypted %s sends",
    async (mode) => {
      jest
        .mocked(resolveOutgoingMessageBody)
        .mockResolvedValue({
          kind: "import",
          textBody: "",
          encrypted: true,
          pgpMimeMessage: "-----BEGIN PGP MESSAGE-----sealed",
          contentFingerprint: "b".repeat(64),
          isCurrent: () => true,
          sentCopyCiphertext: null,
        });
      const submitted = await send(mode, { attachments: [attachment] });
      expect(submitted).toMatchObject({
        sendScope: "compose:test-session",
        textBody: "",
        pgpMimeMessage: "-----BEGIN PGP MESSAGE-----sealed",
        contentFingerprint: "b".repeat(64),
      });
      expect(submitted?.attachments).toBeUndefined();
      expect(mockUploadBlob).not.toHaveBeenCalled();
      expect(mockOnSent).toHaveBeenCalledTimes(1);
    },
  );

  it("coalesces a double click before encryption and upload preparation finish", async () => {
    await send(undefined, { doubleClick: true });
    expect(resolveOutgoingMessageBody).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockOnSent).toHaveBeenCalledTimes(1);
  });

  it("uses the plaintext helper for external attachments", async () => {
    jest
      .mocked(resolveOutgoingMessageBody)
      .mockResolvedValue({
        kind: "plaintext",
        textBody: "external",
        encrypted: false,
        contentFingerprint: "c".repeat(64),
        isCurrent: () => true,
        sentCopyCiphertext: { blobId: "self-copy", size: 100 },
      });
    const submitted = await send(undefined, {
      recipient: "peer@example.com",
      attachments: [attachment],
    });
    expect(mockUploadBlob).toHaveBeenCalledTimes(1);
    expect(mockUploadBlob).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), expect.any(Function));
    expect(submitted?.attachments).toEqual([
      {
        blobId: "plain-blob",
        name: "fixture.txt",
        type: "text/plain",
        size: 3,
      },
    ]);
  });

  it("does not upload plaintext attachments after the vault snapshot expires", async () => {
    jest
      .mocked(resolveOutgoingMessageBody)
      .mockResolvedValue({
        kind: "plaintext",
        textBody: "external",
        encrypted: false,
        contentFingerprint: "c".repeat(64),
        isCurrent: () => false,
        sentCopyCiphertext: { blobId: "self-copy", size: 100 },
      });
    await send(undefined, {
      recipient: "peer@example.com",
      attachments: [attachment],
      expectSend: false,
    });
    expect(mockUploadBlob).not.toHaveBeenCalled();
    expect(mockOnSent).not.toHaveBeenCalled();
    expect(mockSetError).toHaveBeenCalledWith(
      expect.stringContaining("mailbox changed"),
    );
  });

  it("preserves the compose session when a submission receipt is uncertain", async () => {
    mockSendMessage.mockRejectedValueOnce(
      new Error("Could not confirm whether this message was sent"),
    );
    await send(undefined);
    expect(mockOnSent).not.toHaveBeenCalled();
    expect(mockSetError).toHaveBeenCalledWith(
      expect.stringContaining("Could not confirm whether"),
    );
  });
});
