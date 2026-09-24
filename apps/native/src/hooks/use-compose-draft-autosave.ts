import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { composeTextToHtml, hasComposeFormatting } from "@workspace/calendar-core";
import { createLogger } from "@workspace/logger";
import { getPrimaryMailboxId } from "../lib/mail/mail-helpers";
import type { MailRuntime } from "../lib/mail/mail-runtime";
import { QUERY_KEYS } from "../lib/query-keys";

const log = createLogger("native-compose-draft-autosave");
const AUTOSAVE_DEBOUNCE_MS = 2000;

export type DraftSaveStatus = "idle" | "saving" | "saved" | "error";

export type DraftSaveResult =
  | { status: "saved"; draftId: string }
  | { status: "empty" }
  | { status: "failed" };

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

/** Whether the text fields hold anything a draft can store; drafts never keep attachments. */
export function hasDraftContent(
  fields: Pick<ComposeDraftAutosaveInput, "to" | "cc" | "bcc" | "subject" | "body">,
): boolean {
  return (
    [fields.to, fields.cc, fields.bcc].some(
      (raw) => parseAddressList(raw).length > 0,
    ) ||
    Boolean(fields.subject.trim()) ||
    Boolean(fields.body.trim())
  );
}

export function useComposeDraftAutosave(input: ComposeDraftAutosaveInput) {
  const inflightSaveRef = useRef<Promise<DraftSaveResult> | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedDataRef = useRef<string>("");
  const lastSavedDraftIdRef = useRef<string | null>(null);
  const savedDraftsMailboxIdRef = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const draftHasContent = hasDraftContent(input);

  const saveDraftOnce = useCallback(async (): Promise<DraftSaveResult> => {
    if (!draftHasContent) return { status: "empty" };
    if (!input.runtime) return { status: "failed" };

    const toAddresses = parseAddressList(input.to);
    const ccAddresses = parseAddressList(input.cc);
    const bccAddresses = parseAddressList(input.bcc);
    const plainBody = input.body.trim();
    // A save queued behind an autosave runs with its render's draftId, which that autosave already replaced.
    const previousDraftId = lastSavedDraftIdRef.current ?? input.draftId;

    const payloadKey = JSON.stringify({
      to: toAddresses,
      cc: ccAddresses,
      bcc: bccAddresses,
      subject: input.subject,
      body: plainBody,
      identityId: input.identityId,
    });

    if (previousDraftId && payloadKey === lastSavedDataRef.current) {
      return { status: "saved", draftId: previousDraftId };
    }

    const draftsMailboxId = getPrimaryMailboxId(
      input.runtime.mailboxes,
      "drafts",
    );
    if (!draftsMailboxId) return { status: "failed" };

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
          htmlBody: hasComposeFormatting(plainBody)
            ? composeTextToHtml(plainBody)
            : undefined,
          previousDraftId: previousDraftId ?? undefined,
        },
      );

      lastSavedDraftIdRef.current = savedDraftId;
      input.setDraftId(savedDraftId);
      lastSavedDataRef.current = payloadKey;
      savedDraftsMailboxIdRef.current = draftsMailboxId;
      input.setDraftSaveStatus("saved");
      setTimeout(() => input.setDraftSaveStatus("idle"), 2000);
      return { status: "saved", draftId: savedDraftId };
    } catch (error) {
      log.error("Failed to auto-save draft", error);
      input.setDraftSaveStatus("error");
      setTimeout(() => input.setDraftSaveStatus("idle"), 3000);
      return { status: "failed" };
    }
  }, [
    draftHasContent,
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

  const saveDraft = useCallback((): Promise<DraftSaveResult> => {
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

    if (!draftHasContent) return;

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
    draftHasContent,
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

  // Each save replaces the draft id, so refresh the Drafts list once compose unmounts to reopen the latest copy.
  useEffect(
    () => () => {
      const refreshDrafts = () => {
        const draftsMailboxId = savedDraftsMailboxIdRef.current;
        if (!draftsMailboxId) return;
        void queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.mailMessages(draftsMailboxId),
        });
      };
      const inflight = inflightSaveRef.current;
      if (inflight) void inflight.finally(refreshDrafts);
      else refreshDrafts();
    },
    [queryClient],
  );

  return { saveDraft, inflightSaveRef };
}
