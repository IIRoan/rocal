/** @jest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearMailSendAttempts, MAIL_UNSUBSCRIBED_KEYWORD, type MailKeywordEdit } from "@workspace/calendar-core";
import { useMailUnsubscribeAction } from "@/hooks/use-mail-unsubscribe-action";
import type { ActiveMailboxState } from "@/lib/mail/mail-app-helpers";
import type { JmapEmailMessage } from "@/lib/mail/types";

jest.mock("@workspace/ui/lib/toast", () => ({ toast: { loading: jest.fn(), error: jest.fn(), success: jest.fn() } }));
jest.mock("@workspace/logger", () => ({ createLogger: () => ({ error: jest.fn() }) }));
jest.mock("@/lib/mail/mail-app-helpers", () => ({
  createMailSealer: () => ({ selfPublicKeyArmored: "synthetic-public-key", isCurrent: () => true, encrypt: async () => ({ armoredMessage: "synthetic-sealed-command" }), upload: async () => ({ blobId: "self-ciphertext", size: 24 }) }),
  getPrimaryMailboxId: (boxes: Array<{ id: string; role: string }>, role: string) => boxes.find((box) => box.role === role)?.id ?? null,
}));

type Unsubscribe = ReturnType<typeof useMailUnsubscribeAction>;

const sendMessage = jest.fn<(session: unknown, input: { to: string[]; subject: string; textBody: string; fromEmail: string }) => Promise<void>>();
const setMessageKeyword = jest.fn<(session: unknown, id: string, keyword: string, enabled: boolean) => Promise<void>>();
const patchMessageKeyword = jest.fn();
const tracked: MailKeywordEdit[][] = [];

const mailbox = {
  client: { sendMessage, setMessageKeyword, ensureEncryptOnAppendDisabled: async () => undefined },
  session: { apiUrl: "http://localhost:4001/api/mail/jmap/", accounts: { owner: {} }, primaryAccounts: { "urn:ietf:params:jmap:mail": "owner" } },
  identities: [{ id: "identity", email: "owner@solace.test" }],
  mailboxes: [{ id: "drafts", name: "Drafts", role: "drafts" }, { id: "sent", name: "Sent", role: "sent" }],
} as unknown as ActiveMailboxState; // Only the fields the unsubscribe path reads.

function listMessage(urls: string[], oneClick = false): JmapEmailMessage {
  return {
    id: "opaque-list-mail",
    to: [{ email: "owner@solace.test" }],
    "header:Authentication-Results:asText:all": ["mx.solace.test; dkim=pass header.d=news.example"],
    "header:List-Unsubscribe:asURLs": urls,
    "header:List-Unsubscribe-Post:asText": oneClick ? "List-Unsubscribe=One-Click" : null,
  };
}

function Probe({ onReady }: { onReady: (run: Unsubscribe) => void }) {
  const run = useMailUnsubscribeAction({
    activeMailbox: mailbox,
    patchMessageKeyword,
    trackKeywordWrite: async (edits, write) => {
      tracked.push(edits);
      await write();
    },
  });
  useEffect(() => onReady(run));
  return null;
}

describe("useMailUnsubscribeAction", () => {
  let root: Root;
  let run: Unsubscribe = async () => {
    throw new Error("Hook was not mounted");
  };
  const open = jest.spyOn(window, "open").mockImplementation(() => null);

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    jest.clearAllMocks();
    tracked.length = 0;
    clearMailSendAttempts();
    sendMessage.mockResolvedValue(undefined);
    setMessageKeyword.mockResolvedValue(undefined);
    root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe onReady={(next) => { run = next; }} />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    clearMailSendAttempts();
  });

  it("hands the one-click target to the link page by an opaque id, before mailto", async () => {
    await act(async () => run(listMessage(["mailto:leave@news.example", "https://news.example/u?t=1"], true)));

    expect(open).toHaveBeenCalledTimes(1);
    const [url, target, features] = open.mock.calls[0] ?? [];
    expect(String(url)).toMatch(new RegExp(`^${window.location.origin}/mail/link#[0-9a-f-]{36}\\.0$`));
    expect(String(url)).not.toContain("news.example");
    expect([target, features]).toEqual(["_blank", "noopener,noreferrer"]);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(setMessageKeyword).toHaveBeenCalledWith(mailbox.session, "opaque-list-mail", MAIL_UNSUBSCRIBED_KEYWORD, true);
  });

  it("sends the mailto command from the receiving address when one-click is not offered", async () => {
    await act(async () => run(listMessage(["mailto:leave@news.example?subject=stop", "https://news.example/u"])));

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[1]).toMatchObject({
      to: ["leave@news.example"],
      subject: "stop",
      textBody: "Please unsubscribe me.",
      fromEmail: "owner@solace.test",
    });
    expect(open).not.toHaveBeenCalled();
    expect(tracked).toEqual([[{ messageId: "opaque-list-mail", keyword: MAIL_UNSUBSCRIBED_KEYWORD, enabled: true }]]);
    expect(setMessageKeyword).toHaveBeenCalledWith(mailbox.session, "opaque-list-mail", MAIL_UNSUBSCRIBED_KEYWORD, true);
  });

  it("falls back to the sender's page when the mailto send fails", async () => {
    sendMessage.mockRejectedValue(new Error("Submission refused"));
    await act(async () => run(listMessage(["mailto:leave@news.example", "https://news.example/u"])));

    expect(open).toHaveBeenCalledWith("https://news.example/u", "_blank", "noopener,noreferrer");
    expect(patchMessageKeyword).toHaveBeenCalledTimes(1);
    expect(setMessageKeyword).toHaveBeenCalledTimes(1);
  });

  it("rolls the keyword back when no method works", async () => {
    sendMessage.mockRejectedValue(new Error("Submission refused"));
    await act(async () => run(listMessage(["mailto:leave@news.example"])));

    expect(patchMessageKeyword.mock.calls).toEqual([
      [expect.objectContaining({ id: "opaque-list-mail" }), MAIL_UNSUBSCRIBED_KEYWORD, true],
      [expect.objectContaining({ id: "opaque-list-mail" }), MAIL_UNSUBSCRIBED_KEYWORD, false],
    ]);
    expect(setMessageKeyword).not.toHaveBeenCalled();
  });
});
