/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { clearMailSendAttempts, resolveMailServerPolicy, SIMPLELOGIN_DONE_KEYWORD } from "@workspace/calendar-core";
import { useSimpleLoginAliasAction } from "./use-mail";
import { StalwartJmapClient } from "./jmap-client";
import type { MailRuntime } from "./mail-runtime";
import type { JmapEmailMessage } from "./types";
import type { MailboxMessagesPage } from "./mail-message-cache";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";

jest.mock("@workspace/native-core/providers/AuthProvider", () => ({}));
jest.mock("@workspace/native-core/providers/E2eeProvider", () => ({}));
jest.mock("./mail-api", () => ({}));
jest.mock("./account-bootstrap", () => ({}));
jest.mock("./mail-runtime", () => ({}));
jest.mock("../search/local-mail-search", () => ({}));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(async () => ({ type: "dismiss" })) }));
jest.mock("./outgoing-message-crypto", () => ({ createMailSealer: async () => ({ selfPublicKeyArmored: "synthetic-public-key", isCurrent: () => true, encrypt: async () => ({ armoredMessage: "synthetic-sealed-command" }), upload: async () => ({ blobId: "self-ciphertext", size: 24 }) }) }));

it("runs, undoes and runs SimpleLogin again using distinct real transport attempts", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  clearMailSendAttempts();
  const submissionIds: string[] = [];
  let prepared = 0;
  const client = new StalwartJmapClient({ baseUrl: "http://localhost:4001/api/mail/jmap", accessToken: "synthetic-token", fetcher: async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { methodCalls: [string, Record<string, unknown>, string][] };
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
  const runtime: MailRuntime = {
    client, session: { apiUrl: "http://localhost:4001/api/mail/jmap/", accounts: { owner: {} }, primaryAccounts: { "urn:ietf:params:jmap:mail": "owner" } }, accountId: "owner",
    config: { defaultDomain: "solace.test", discoveryBaseUrl: "http://localhost:4001/api/mail/jmap", signupEnabled: false, oauth: { mailTokenEndpoint: "http://localhost:4001/api/mail/token" } },
    identities: [{ id: "identity", email: "owner@solace.test" }], pickerIdentities: [], encryptedAtRest: false, mailServerPolicy: resolveMailServerPolicy({}),
    mailboxes: [{ id: "drafts", name: "Drafts", role: "drafts" }, { id: "sent", name: "Sent", role: "sent" }],
  };
  const message: JmapEmailMessage = { id: "opaque-forward", to: [{ email: "alias@example.test" }], "header:Delivered-To:asAddresses:all": [[{ email: "owner@solace.test" }]], "header:X-Solace-SimpleLogin:asText": "forward", "header:X-SimpleLogin-Envelope-To:asAddresses": [{ email: "alias@example.test" }], "header:X-SimpleLogin-Unsub-Behaviour:asText": "alias-disable", "header:List-Unsubscribe:asURLs": ["mailto:unsubscribe@simplelogin.co?subject=un.WzIsIDEzNzQzNjAyXQ.token_-x"] };
  let run: ReturnType<typeof useSimpleLoginAliasAction>["mutateAsync"] = async () => { throw new Error("Hook was not mounted"); };
  function Probe() { run = useSimpleLoginAliasAction(runtime).mutateAsync; return null; }
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<QueryClientProvider client={queryClient}><Probe /></QueryClientProvider>));
    const page: MailboxMessagesPage = { messages: [message], total: 1, position: 0 };
    queryClient.setQueryData(QUERY_KEYS.mailMessages("inbox"), page);
    let finishRead: ((value: MailboxMessagesPage) => void) | undefined;
    const staleRead = queryClient.fetchQuery({
      queryKey: QUERY_KEYS.mailMessages("inbox"),
      queryFn: () => new Promise<MailboxMessagesPage>((resolve) => { finishRead = resolve; }),
    }).catch(() => undefined);
    await act(async () => { await run({ message, mode: "run" }); });
    await act(async () => { finishRead?.(page); await staleRead; });
    expect(queryClient.getQueryData<MailboxMessagesPage>(QUERY_KEYS.mailMessages("inbox"))?.messages[0]?.keywords?.[SIMPLELOGIN_DONE_KEYWORD]).toBe(true);
    await act(async () => { await run({ message, mode: "undo" }); });
    await act(async () => { await run({ message, mode: "run" }); });
    expect(submissionIds).toEqual(["original-1", "original-2"]);
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    queryClient.clear();
    clearMailSendAttempts();
  }
});
