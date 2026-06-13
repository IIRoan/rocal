import { useCallback, useEffect, useRef } from "react";
import { createLogger } from "@workspace/logger";
import { getPrimaryMailboxId } from "../lib/mail/mail-helpers";
import type { MailRuntime } from "../lib/mail/mail-runtime";

const log = createLogger("native-compose-draft-autosave");
const AUTOSAVE_DEBOUNCE_MS = 2000;

export type DraftSaveStatus = "idle" | "saving" | "saved" | "error";

type ComposeDraftAutosaveInput = {
  runtime: MailRuntime | undefined;
  enabled: boolean;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  identityId: string | null;
  draftId: string | null;
  setDraftId: (id: string | null) => void;
  setDraftSaveStatus: (status: DraftSaveStatus) => void;
};

function parseAddressList(raw: string): string[] {
  return raw
    .split(/[,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function useComposeDraftAutosave(input: ComposeDraftAutosaveInput) {
  const inflightSaveRef = useRef<Promise<string | null> | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedDataRef = useRef<string>("");

  const saveDraftOnce = useCallback(async (): Promise<string | null> => {
    if (!input.runtime) return input.draftId;

    const toAddresses = parseAddressList(input.to);
    const ccAddresses = parseAddressList(input.cc);
    const bccAddresses = parseAddressList(input.bcc);
    const plainBody = input.body.trim();

    if (!toAddresses.length && !input.subject.trim() && !plainBody) {
      return input.draftId;
    }

    const payloadKey = JSON.stringify({
      to: toAddresses,
      cc: ccAddresses,
      bcc: bccAddresses,
      subject: input.subject,
      body: plainBody,
      identityId: input.identityId,
      draftId: input.draftId,
    });

    if (payloadKey === lastSavedDataRef.current) {
      return input.draftId;
    }

    const draftsMailboxId = getPrimaryMailboxId(
      input.runtime.mailboxes,
      "drafts",
    );
    if (!draftsMailboxId) return null;

    const identity =
      input.runtime.identities.find((entry) => entry.id === input.identityId) ??
      input.runtime.identities[0];
    const fromEmail =
      identity?.email ?? input.runtime.identities[0]?.email ?? "";
    const fromName = identity?.name ?? null;

    input.setDraftSaveStatus("saving");

    try {
      const savedDraftId = await input.runtime.client.saveDraft(
        input.runtime.session,
        {
          draftsMailboxId,
          fromEmail,
          fromName,
          to: toAddresses,
          cc: ccAddresses.length ? ccAddresses : undefined,
          bcc: bccAddresses.length ? bccAddresses : undefined,
          subject: input.subject.trim() || "(No subject)",
          textBody: plainBody,
          previousDraftId: input.draftId ?? undefined,
        },
      );

      input.setDraftId(savedDraftId);
      lastSavedDataRef.current = payloadKey;
      input.setDraftSaveStatus("saved");
      setTimeout(() => input.setDraftSaveStatus("idle"), 2000);
      return savedDraftId;
    } catch (error) {
      log.error("Failed to auto-save draft", error);
      input.setDraftSaveStatus("error");
      setTimeout(() => input.setDraftSaveStatus("idle"), 3000);
      return null;
    }
  }, [
    input.bcc,
    input.body,
    input.cc,
    input.draftId,
    input.identityId,
    input.runtime,
    input.setDraftId,
    input.setDraftSaveStatus,
    input.subject,
    input.to,
  ]);

  const saveDraft = useCallback((): Promise<string | null> => {
    const previous = inflightSaveRef.current;
    const promise = (async () => {
      if (previous) {
        try {
          await previous;
        } catch {
          /* prior failure already surfaced */
        }
      }
      return saveDraftOnce();
    })();
    inflightSaveRef.current = promise;
    promise.finally(() => {
      if (inflightSaveRef.current === promise) {
        inflightSaveRef.current = null;
      }
    });
    return promise;
  }, [saveDraftOnce]);

  useEffect(() => {
    if (!input.enabled || !input.runtime) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      return;
    }

    const hasContent =
      input.to.trim() ||
      input.subject.trim() ||
      input.body.trim();
    if (!hasContent) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      void saveDraft();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    input.bcc,
    input.body,
    input.cc,
    input.enabled,
    input.identityId,
    input.runtime,
    input.subject,
    input.to,
    saveDraft,
  ]);

  return { saveDraft, inflightSaveRef };
}
