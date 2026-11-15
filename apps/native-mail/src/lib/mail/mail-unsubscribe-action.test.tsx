/** @jest-environment jsdom */

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { clearMailSendAttempts, MAIL_UNSUBSCRIBED_KEYWORD } from "@workspace/calendar-core";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { useMailUnsubscribeAction } from "./use-mail";
import type { MailboxMessagesPage } from "./mail-message-cache";
import type { MailRuntime } from "./mail-runtime";
import type { JmapEmailMessage } from "./types";

jest.mock("@workspace/native-core/providers/AuthProvider", () => ({}));
jest.mock("@workspace/native-core/providers/E2eeProvider", () => ({}));
jest.mock("./mail-api", () => ({}));
jest.mock("./account-bootstrap", () => ({}));
jest.mock("./mail-runtime", () => ({}));
jest.mock("../search/local-mail-search", () => ({}));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(async () => ({ type: "dismiss" })) }));
jest.mock("./outgoing-message-crypto", () => ({ createMailSealer: async () => ({ selfPublicKeyArmored: "synthetic-public-key", isCurrent: () => true, encrypt: async () => ({ armoredMessage: "synthetic-sealed-command" }), upload: async () => ({ blobId: "self-ciphertext", size: 24 }) }) }));

type Run = ReturnType<typeof useMailUnsubscribeAction>["mutateAsync"];

const sendMessage = jest.fn(async () => undefined);
const setMessageKeyword = jest.fn(async () => undefined);
const fetchMock = jest.fn<Promise<{ ok: boolean; status?: number; type?: string }>, [string, RequestInit]>();

// Only the runtime fields the unsubscribe path reads.
const runtime = {
  client: { sendMessage, setMessageKeyword, ensureEncryptOnAppendDisabled: async () => undefined },
  session: { apiUrl: "http://localhost:4001/api/mail/jmap/", accounts: { owner: {} }, primaryAccounts: { "urn:ietf:params:jmap:mail": "owner" } },
  identities: [{ id: "identity", email: "owner@solace.test" }],
  mailboxes: [{ id: "drafts", name: "Drafts", role: "drafts" }, { id: "sent", name: "Sent", role: "sent" }],
} as unknown as MailRuntime;

const message: JmapEmailMessage = {
  id: "opaque-list-mail",
  to: [{ email: "owner@solace.test" }],
  keywords: {},
  "header:Authentication-Results:asText:all": ["mx.solace.test; dkim=pass header.d=news.example"],
  "header:List-Unsubscribe:asURLs": ["mailto:leave@news.example?subject=stop", "https://news.example/u?t=1"],
  "header:List-Unsubscribe-Post:asText": "List-Unsubscribe=One-Click",
};

function Probe({ onReady }: { onReady: (run: Run) => void }) {
  const { mutateAsync } = useMailUnsubscribeAction(runtime);
  useEffect(() => onReady(mutateAsync));
  return null;
}

describe("useMailUnsubscribeAction", () => {
  let root: Root;
  let queryClient: QueryClient;
  let run: Run = async () => {
    throw new Error("Hook was not mounted");
  };

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    jest.clearAllMocks();
    clearMailSendAttempts();
    Object.defineProperty(globalThis, "fetch", { value: fetchMock, configurable: true });
    queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const page: MailboxMessagesPage = { messages: [message], total: 1, position: 0 };
    queryClient.setQueryData(QUERY_KEYS.mailMessages("inbox"), page);
    root = createRoot(document.createElement("div"));
    await act(async () =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <Probe
            onReady={(next) => {
              run = next;
            }}
          />
        </QueryClientProvider>,
      ),
    );
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    queryClient.clear();
    clearMailSendAttempts();
  });

  const cachedKeyword = () =>
    queryClient.getQueryData<MailboxMessagesPage>(QUERY_KEYS.mailMessages("inbox"))?.messages[0]?.keywords?.[
      MAIL_UNSUBSCRIBED_KEYWORD
    ];

  it("posts the RFC 8058 one-click body from the device without credentials", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    let outcome: string | null = null;
    await act(async () => {
      outcome = await run(message);
    });

    expect(outcome).toBe("unsubscribed");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://news.example/u?t=1",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
        credentials: "omit",
        redirect: "manual",
      }),
    );
    expect(sendMessage).not.toHaveBeenCalled();
    expect(setMessageKeyword).toHaveBeenCalledWith(runtime.session, "opaque-list-mail", MAIL_UNSUBSCRIBED_KEYWORD, true);
    expect(cachedKeyword()).toBe(true);
  });

  it("accepts a redirect answer without following it to an unchecked host", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 307, type: "default" });
    await act(async () => run(message));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(cachedKeyword()).toBe(true);
  });

  it("falls back to the mailto command when the sender refuses the POST", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    await act(async () => run(message));

    expect(sendMessage).toHaveBeenCalledWith(
      runtime.session,
      expect.objectContaining({ to: ["leave@news.example"], subject: "stop", fromEmail: "owner@solace.test" }),
    );
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
    expect(cachedKeyword()).toBe(true);
  });

  it("surfaces a failed mailto send instead of opening the sender's page, and marks nothing", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    sendMessage.mockRejectedValueOnce(new Error("refused"));

    await act(async () => {
      await expect(run(message)).rejects.toThrow("refused");
    });
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
    expect(cachedKeyword()).toBeUndefined();
    expect(setMessageKeyword).not.toHaveBeenCalled();
  });

  it("only opens the sender's page when that is the one way, and leaves the message unmarked", async () => {
    const pageOnly = { ...message, "header:List-Unsubscribe:asURLs": ["https://news.example/u?t=1"], "header:List-Unsubscribe-Post:asText": null };
    let outcome: string | null = null;
    await act(async () => {
      outcome = await run(pageOnly);
    });

    expect(outcome).toBe("opened");
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith("https://news.example/u?t=1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(setMessageKeyword).not.toHaveBeenCalled();
    expect(cachedKeyword()).toBeUndefined();
  });
});
