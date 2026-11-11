/** @jest-environment jsdom */

import { expect, it, jest } from "@jest/globals";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { clearMailSendAttempts, resolveMailServerPolicy } from "@workspace/calendar-core";
import { useSimpleLoginAliasAction } from "@/hooks/use-simplelogin-alias-action";
import { StalwartJmapClient } from "@/lib/mail/jmap-client";
import type { ActiveMailboxState } from "@/lib/mail/mail-app-helpers";
import type { JmapEmailMessage } from "@/lib/mail/types";

jest.mock("@workspace/ui/lib/toast", () => ({ toast: { loading: jest.fn(), error: jest.fn(), success: jest.fn() } }));
jest.mock("@/lib/mail/mail-app-helpers", () => ({
  createMailSealer: () => ({ selfPublicKeyArmored: "synthetic-public-key", isCurrent: () => true, encrypt: async () => ({ armoredMessage: "synthetic-sealed-command" }), upload: async () => ({ blobId: "self-ciphertext", size: 24 }) }),
  getPrimaryMailboxId: (boxes: Array<{ id: string; role: string }>, role: string) => boxes.find((box) => box.role === role)?.id ?? null,
}));

it("runs, undoes and runs SimpleLogin again using distinct real transport attempts", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  clearMailSendAttempts();
  const submissionIds: string[] = [];
  let prepared = 0;
  const client = new StalwartJmapClient({ baseUrl: "http://localhost:4001/api/mail/jmap", accessToken: "synthetic-token", fetcher: async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { methodCalls: Array<[string, Record<string, unknown>, string]> };
    const call = body.methodCalls[0];
    if (!call) throw new Error("Missing method");
    const [method, params, id] = call;
    if (method === "Email/set" && params.create) {
      prepared += 1;
      const submission = body.methodCalls[1]?.[1].create as { s1: { emailId: string; envelope: { mailFrom: { parameters: { ENVID: string } } } } };
      expect(submission.s1.emailId).toBe("#draft1");
      expect(submission.s1.envelope.mailFrom.parameters.ENVID).toMatch(/^[a-f0-9]{32}$/);
      submissionIds.push(`original-${prepared}`);
      return { ok: true, status: 200, json: async () => ({ methodResponses: [["Email/set", { created: { draft1: { id: `original-${prepared}` }, sent1: { id: `self-${prepared}` } } }, "c1"], ["EmailSubmission/set", { created: { s1: { id: `receipt-${submissionIds.length}` } } }, "c2"]] }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ methodResponses: [[method, { updated: {} }, id]] }) } as Response;
  } });
  jest.spyOn(client, "ensureEncryptOnAppendDisabled").mockResolvedValue();
  client.setMailServerPolicy(resolveMailServerPolicy({}));
  const mailbox: ActiveMailboxState = {
    client, session: { apiUrl: "http://localhost:4001/api/mail/jmap/", accounts: { owner: {} }, primaryAccounts: { "urn:ietf:params:jmap:mail": "owner" } },
    identities: [{ id: "identity", email: "owner@solace.test" }], pickerIdentities: [], messages: [], email: "owner@solace.test", selectedMailboxId: null,
    mailboxes: [{ id: "drafts", name: "Drafts", role: "drafts" }, { id: "sent", name: "Sent", role: "sent" }], accountEncryptedAtRest: false, mailServerPolicy: resolveMailServerPolicy({}),
    unlockedVault: { userId: "opaque-user", email: "owner@solace.test", publicKeyArmored: "synthetic", publicKeyFingerprint: "synthetic", encryptedPrivateKeyArmored: "synthetic", kdf: "argon2id", kdfParams: { saltB64: "synthetic", memoryKiB: 8, iterations: 1, parallelism: 1 }, vaultVersion: 1, createdAt: "2026-11-10T00:00:00Z" },
  };
  const message: JmapEmailMessage = { id: "opaque-forward", to: [{ email: "alias@example.test" }], "header:Delivered-To:asAddresses:all": [[{ email: "owner@solace.test" }]], "header:X-Solace-SimpleLogin:asText": "forward", "header:X-SimpleLogin-Envelope-To:asAddresses": [{ email: "alias@example.test" }], "header:X-SimpleLogin-Unsub-Behaviour:asText": "alias-disable", "header:List-Unsubscribe:asURLs": ["mailto:unsubscribe@simplelogin.co?subject=un.WzIsIDEzNzQzNjAyXQ.token_-x"] };
  let run: ReturnType<typeof useSimpleLoginAliasAction> = async () => { throw new Error("Hook was not mounted"); };
  function Probe() { run = useSimpleLoginAliasAction({ activeMailbox: mailbox, patchMessageKeyword: () => {} }); return null; }
  const container = document.createElement("div");
  const root = createRoot(container);
  const open = jest.spyOn(window, "open").mockImplementation(() => null);
  try {
    await act(async () => root.render(<Probe />));
    await act(async () => { await run(message, "run"); });
    await act(async () => { await run(message, "undo"); });
    await act(async () => { await run(message, "run"); });
    expect(submissionIds).toEqual(["original-1", "original-2"]);
    expect(open).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    open.mockRestore();
    clearMailSendAttempts();
  }
});
