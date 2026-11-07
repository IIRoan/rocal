/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DEFAULT_MAIL_COMPOSE_SETTINGS } from "@workspace/calendar-core";
import { buildMailRuntime } from "../lib/mail/mail-runtime";
import type { MailRuntime } from "../lib/mail/mail-runtime";
import { INITIAL_COMPOSE_FORM } from "../lib/mail/compose-form";
import type { ComposeMode } from "../lib/mail/compose-request";
import type { JmapEmailMessage } from "../lib/mail/types";
import { resolveComposeContext } from "../lib/mail/use-mail";
import { useComposeSend } from "./use-compose-send";

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
    textBody: "",
    encrypted: true,
    pgpMimeCiphertext: { blobId: "sealed", size: 128 },
    sentCopyCiphertext: null,
  })),
}));
jest.mock("../lib/mail/mail-runtime", () => ({
  buildMailRuntime: jest.fn(async () => ({
    config: { defaultDomain: "solace.test" },
    client: { sendMessage: mockSendMessage },
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
}: {
  runtime: MailRuntime;
  mode: ComposeMode | undefined;
}) {
  const compose = useComposeSend({
    runtime,
    mode,
    sourceMessage: original,
    form: {
      ...INITIAL_COMPOSE_FORM,
      to: "peer@solace.test",
      subject: "Re: Plans",
      body: "My reply",
    },
    identity: null,
    identityId: "self",
    composeContext: resolveComposeContext(runtime),
    settings: DEFAULT_MAIL_COMPOSE_SETTINGS,
    signatureOptions: { separator: true },
    settleDraftSave: async () => null,
    setError: jest.fn(),
    onSent: jest.fn(),
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
    jest.clearAllMocks();
    container = document.createElement("div");
    root = createRoot(container);
    queryClient = new QueryClient();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    queryClient.clear();
  });

  async function send(mode: ComposeMode | undefined) {
    const runtime = await buildMailRuntime();
    await act(async () =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <Composer runtime={runtime} mode={mode} />
        </QueryClientProvider>,
      ),
    );
    await act(async () => {
      container.querySelector("button")?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    return mockSendMessage.mock.calls[0]?.[1];
  }

  it.each(["reply", "reply-all"] as const)(
    "sends %s with its original message lineage through the JMAP transport",
    async (mode) => {
      const submitted = await send(mode);
      expect(submitted).toEqual(
        expect.objectContaining({
          inReplyTo: ["parent@solace.test"],
          references: ["root@solace.test", "parent@solace.test"],
          pgpMimeCiphertext: { blobId: "sealed", size: 128 },
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
});
