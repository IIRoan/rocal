/** @jest-environment jsdom */

import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { encryptForRecipients } from "../lib/mail/mail-crypto";
import type { MailRuntime } from "../lib/mail/mail-runtime";
import { useComposeDraftAutosave, type DraftSaveResult } from "./use-compose-draft-autosave";

const ARMORED = "-----BEGIN PGP MESSAGE-----\nsealed\n-----END PGP MESSAGE-----";

jest.mock("../lib/mail/mail-crypto", () => ({
  ensureVaultLoaded: jest.fn(async () => ({ vault: { publicKeyArmored: "self-key" } })),
  encryptForRecipients: jest.fn(async () => ({
    armoredMessage: "-----BEGIN PGP MESSAGE-----\nsealed\n-----END PGP MESSAGE-----",
  })),
}));
jest.mock("../lib/mail/mail-api", () => ({ getRecipientKey: jest.fn() }));

const saveDraft = jest.fn(
  async (_session: unknown, _input: Record<string, unknown>) => "draft-2",
);
const uploadBlob = jest.fn(
  async (_session: unknown, bytes: Uint8Array, _type: string) => ({
    blobId: "sealed-draft",
    size: bytes.byteLength,
    name: "",
    type: "text/plain",
  }),
);
const runtime = {
  client: { saveDraft, uploadBlob },
  session: { apiUrl: "https://mail.example.com/jmap/" },
  mailboxes: [{ id: "drafts-1", name: "Drafts", role: "drafts" }],
  identities: [{ id: "identity-1", email: "me@solace.onl", name: "Me" }],
} as unknown as MailRuntime; // Only the client calls the draft save makes are exercised.

it("saves a draft only as ciphertext sealed to the account's own key", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.createElement("div"));
  let save: (() => Promise<DraftSaveResult>) | null = null;

  function Probe() {
    const autosave = useComposeDraftAutosave({
      runtime,
      enabled: false,
      to: "ann@example.com",
      cc: "",
      bcc: "",
      subject: "Plans",
      body: "Meet at the harbour",
      identityId: "identity-1",
      draftId: "draft-1",
      setDraftId: () => undefined,
      setDraftSaveStatus: () => undefined,
    });
    useEffect(() => {
      save = autosave.saveDraft;
    });
    return null;
  }

  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <Probe />
        </QueryClientProvider>,
      ),
    );
    let result: DraftSaveResult | undefined;
    await act(async () => {
      result = await save?.();
    });

    expect(result).toEqual({ status: "saved", draftId: "draft-2" });
    expect(encryptForRecipients).toHaveBeenCalledWith({
      plaintext: expect.stringContaining("Meet at the harbour"),
      recipientPublicKeysArmored: ["self-key"],
    });
    expect(uploadBlob).toHaveBeenCalledWith(
      runtime.session,
      new TextEncoder().encode(ARMORED),
      "text/plain",
    );
    const saved = saveDraft.mock.calls[0]?.[1];
    expect(saved).toEqual(
      expect.objectContaining({
        draftsMailboxId: "drafts-1",
        to: ["ann@example.com"],
        subject: "Plans",
        ciphertext: { blobId: "sealed-draft", size: ARMORED.length },
        previousDraftId: "draft-1",
      }),
    );
    expect(JSON.stringify(saved)).not.toContain("harbour");
  } finally {
    act(() => root.unmount());
  }
});
