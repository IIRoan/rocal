/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  CANCELED_SEND_IN_SENT_NOTICE,
  clearMailSendAttempts,
  discardMailSendAttempt,
  DEFAULT_MAIL_COMPOSE_SETTINGS,
  type HeldSubmissionCancelResult,
  type MailComposeSettings,
} from "@workspace/calendar-core";
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
const mockOnRestore = jest.fn();
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
const mockToast = jest.fn();
const mockCancelHeldSubmission = jest.fn(async (_session: unknown, _input: unknown): Promise<HeldSubmissionCancelResult> => "canceled");
const mockMoveCanceledSendToDrafts = jest.fn(async (_session: unknown, _input: unknown) => undefined);
jest.mock("@workspace/native-core/providers/ToastProvider", () => ({
  useToast: () => ({ toast: mockToast }),
}));
jest.mock("@workspace/native-core/hooks/use-user-timezone", () => ({ useUserTimezone: () => "Europe/Amsterdam" }));
jest.mock("@workspace/native-core/hooks/use-user-time-format", () => ({ useUserTimeFormat: () => "24h" }));
jest.mock("./use-mail-list-settings", () => ({ useMailListSettings: () => ({ settings: { undoToastDurationMs: 5000 } }) }));
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
  body = "My reply",
  htmlBody = "",
  settings = DEFAULT_MAIL_COMPOSE_SETTINGS,
  flushBody,
  finalizeQuotedImages,
}: {
  runtime: MailRuntime;
  mode: ComposeMode | undefined;
  attachments?: PendingComposeAttachment[];
  recipient?: string;
  body?: string;
  htmlBody?: string;
  settings?: MailComposeSettings;
  flushBody?: () => Promise<string | null>;
  finalizeQuotedImages?: (html: string) => Promise<string>;
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
      body,
      htmlBody,
    },
    identityId: "self",
    composeContext: resolveComposeContext(runtime),
    settings,
    settleDraftSave: async () => null,
    setError: mockSetError,
    onSent: mockOnSent,
    onRestore: mockOnRestore,
    flushBody,
    finalizeQuotedImages,
  });
  return (
    <button type="button" onClick={() => compose.send()}>
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
      maxDelayedSendSeconds?: number;
      body?: string;
      htmlBody?: string;
      settings?: MailComposeSettings;
      flushBody?: () => Promise<string | null>;
      finalizeQuotedImages?: (html: string) => Promise<string>;
    } = {},
  ) {
    const base = await buildMailRuntime();
    const runtime: MailRuntime = {
      ...base,
      mailServerPolicy: { ...base.mailServerPolicy, maxDelayedSendSeconds: options.maxDelayedSendSeconds ?? 0 },
      client: Object.assign(base.client, {
        cancelHeldSubmission: mockCancelHeldSubmission,
        moveCanceledSendToDrafts: mockMoveCanceledSendToDrafts,
      }),
    };
    await act(async () =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <Composer
            runtime={runtime}
            mode={mode}
            attachments={options.attachments}
            recipient={options.recipient}
            body={options.body}
            htmlBody={options.htmlBody}
            settings={options.settings}
            flushBody={options.flushBody}
            finalizeQuotedImages={options.finalizeQuotedImages}
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

  it("holds the send for the undo window and restores the form with attachments on undo", async () => {
    const submitted = await send("reply", { attachments: [attachment], maxDelayedSendSeconds: 600 });
    expect(submitted?.hold).toEqual({ forSeconds: 5 });
    const [message, variant, options] = mockToast.mock.calls.at(-1) as [string, string, { duration: number; action: { onPress: () => void } }];
    expect([message, variant, options.duration]).toEqual(["Sending…", "success", 5000]);
    await act(async () => {
      options.action.onPress();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockCancelHeldSubmission).toHaveBeenCalledWith(expect.anything(), { submissionId: "submission", copyEmailId: "reply", draftsMailboxId: "drafts" });
    expect(mockOnRestore).toHaveBeenCalledWith({
      mode: "reply",
      messageId: "original",
      restore: {
        fields: { to: "peer@solace.test", cc: "", bcc: "", subject: "Re: Plans", body: "My reply", htmlBody: "" },
        attachments: [attachment],
        draftId: "reply",
      },
    });
  });

  it("says when it is too late to undo", async () => {
    mockCancelHeldSubmission.mockResolvedValueOnce("sent");
    await send(undefined, { maxDelayedSendSeconds: 600 });
    const options = mockToast.mock.calls.at(-1)?.[2] as { action: { onPress: () => void } };
    await act(async () => {
      options.action.onPress();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockToast).toHaveBeenLastCalledWith("Too late to undo. The message was sent.", "info");
    expect(mockOnRestore).not.toHaveBeenCalled();
  });

  it("says the copy is still in Sent and retries the move when the cancel could not move it", async () => {
    mockCancelHeldSubmission.mockResolvedValueOnce("canceledInSent");
    await send(undefined, { maxDelayedSendSeconds: 600 });
    const options = mockToast.mock.calls.at(-1)?.[2] as { action: { onPress: () => void } };
    await act(async () => {
      options.action.onPress();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const [message, variant, notice] = mockToast.mock.calls.at(-1) as [string, string, { action: { label: string; onPress: () => void } }];
    expect([message, variant, notice.action.label]).toEqual([CANCELED_SEND_IN_SENT_NOTICE, "error", "Retry"]);
    expect(mockOnRestore).toHaveBeenCalled();
    await act(async () => {
      notice.action.onPress();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockMoveCanceledSendToDrafts).toHaveBeenCalledWith(expect.anything(), { copyEmailId: "reply", draftsMailboxId: "drafts" });
    expect(mockToast).toHaveBeenLastCalledWith("Moved to Drafts.", "success");
  });

  it("sends the body as typed, so a signature the user deleted stays deleted", async () => {
    const settings: MailComposeSettings = {
      ...DEFAULT_MAIL_COMPOSE_SETTINGS,
      signatures: [{ id: "s-work", name: "Work", body: "Alex Doe" }],
      signatureDefaults: [{ identityId: "self", newMessage: "s-work", replyForward: "s-work" }],
    };
    await send("reply", { body: "Thanks\n\nOn Monday, Sam wrote:\n> Hello", settings });
    expect(resolveOutgoingMessageBody).toHaveBeenCalledWith(
      expect.objectContaining({ plaintext: "Thanks\n\nOn Monday, Sam wrote:\n> Hello" }),
    );
  });

  it("sends at once without a hold when the server can't delay mail", async () => {
    const submitted = await send(undefined);
    expect(submitted?.hold).toBeUndefined();
  });

  const IMAGE = "data:image/png;base64,iVBORw0KGgo=";
  const plaintextBody = {
    kind: "plaintext" as const,
    textBody: "external",
    encrypted: false as const,
    contentFingerprint: "c".repeat(64),
    isCurrent: () => true,
    sentCopyCiphertext: { blobId: "self-copy", size: 100 },
  };

  it("sends the editor's latest HTML with a text alternative, after waiting for quoted images", async () => {
    const flushBody = jest.fn(async () => "<p>Thanks, <strong>Sam</strong></p><ul><li>Friday</li></ul><p>stale-quote</p>");
    const finalizeQuotedImages = jest.fn(async (html: string) => html.replace("<p>stale-quote</p>", ""));
    await send("reply", { htmlBody: "<p>Thanks</p>", body: "Thanks", flushBody, finalizeQuotedImages });
    expect(flushBody).toHaveBeenCalledTimes(1);
    expect(resolveOutgoingMessageBody).toHaveBeenCalledWith(
      expect.objectContaining({
        plaintext: "Thanks, Sam\n\n- Friday",
        html: "<p>Thanks, <strong>Sam</strong></p><ul><li>Friday</li></ul>",
      }),
    );
  });

  it("sends no HTML and skips the editor in plain-text compose", async () => {
    const flushBody = jest.fn(async () => "<p>Rich</p>");
    await send(undefined, {
      htmlBody: "<p>Rich</p>",
      body: "Plain **as typed**",
      flushBody,
      settings: { ...DEFAULT_MAIL_COMPOSE_SETTINGS, plainTextMode: true },
    });
    expect(flushBody).not.toHaveBeenCalled();
    expect(resolveOutgoingMessageBody).toHaveBeenCalledWith(
      expect.objectContaining({ plaintext: "Plain **as typed**", html: undefined }),
    );
  });

  it("uploads an inserted image beside the HTML that cites it for an outside recipient", async () => {
    jest.mocked(resolveOutgoingMessageBody).mockResolvedValue(plaintextBody);
    const submitted = await send(undefined, {
      recipient: "peer@example.com",
      htmlBody: `<p>Look <img src="${IMAGE}" alt="chart.png"></p>`,
      body: "Look",
    });
    const sealedInput = jest.mocked(resolveOutgoingMessageBody).mock.calls[0]?.[0];
    const cid = /src="cid:([^"]+)"/.exec(sealedInput?.html ?? "")?.[1];
    expect(cid).toMatch(/^[0-9a-f]{32}@solace$/);
    expect(sealedInput?.html).not.toContain("data:image");
    expect(sealedInput?.mimeAttachments).toEqual([
      expect.objectContaining({ filename: "chart.png", contentType: "image/png", cid, disposition: "inline" }),
    ]);
    expect(mockUploadBlob).toHaveBeenCalledWith(expect.anything(), expect.any(Uint8Array), "image/png", expect.any(Function));
    expect(submitted?.htmlBody).toBe(sealedInput?.html);
    expect(submitted?.attachments).toEqual([
      { blobId: "plain-blob", name: "chart.png", type: "image/png", size: 8, disposition: "inline", cid },
    ]);
    // The self-sealed Sent copy keeps the image embedded, because the reader drops cid parts of decrypted mail.
    expect(sealedInput?.sentCopyContent).toEqual(
      expect.objectContaining({ html: `<p>Look <img src="${IMAGE}" alt="chart.png"></p>`, attachments: [] }),
    );
  });

  it("refuses encrypted mail whose embedded images pass what the reader can show", async () => {
    const big = `data:image/png;base64,${"A".repeat(8 * 1024 * 1024)}`;
    await send(undefined, { htmlBody: `<p><img src="${big}" alt="huge.png"></p>`, body: "", expectSend: false });
    expect(resolveOutgoingMessageBody).not.toHaveBeenCalled();
    expect(mockSetError).toHaveBeenLastCalledWith(expect.stringContaining("too large to send encrypted"));
  });

  it("sends the seeded HTML when the editor answers before it has loaded", async () => {
    await send("reply", { htmlBody: "<p>Seeded</p>", body: "Seeded", flushBody: jest.fn(async () => "") });
    expect(resolveOutgoingMessageBody).toHaveBeenCalledWith(expect.objectContaining({ html: "<p>Seeded</p>" }));
  });

  it("keeps inserted images inside encrypted mail as data URLs", async () => {
    await send(undefined, { htmlBody: `<p><img src="${IMAGE}" alt="chart.png"></p>`, body: "" });
    const sealedInput = jest.mocked(resolveOutgoingMessageBody).mock.calls[0]?.[0];
    expect(sealedInput?.html).toContain(IMAGE);
    expect(sealedInput?.mimeAttachments).toEqual([]);
    expect(mockUploadBlob).not.toHaveBeenCalled();
  });
});
