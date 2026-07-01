"use client";

import { useCallback, useEffect, useRef } from "react";
import { createLogger } from "@workspace/logger";
import type { StalwartJmapClient } from "@/lib/mail/jmap-client";
import type { JmapEmailMessage, JmapSession } from "@/lib/mail/types";
import {
  getMailComposeBridge,
  registerComposeDraftSaver,
} from "@/components/mail/mail-compose-bridge";
import {
  useMailCompose,
  useMailComposeChrome,
} from "@/components/mail/mail-compose-context";
import {
  validateJmapRequestSize,
  estimateOutgoingJmapMessageBytes,
  validateOutgoingMessageSize,
} from "@workspace/calendar-core";
import type { MailServerPolicy } from "@workspace/calendar-core";
import { resolveOutgoingComposeBodies } from "@/lib/mail/signature-utils";
import { readMailComposeSettings } from "@/lib/mail/compose-settings";

const log = createLogger("compose-draft-autosave");
const AUTOSAVE_DEBOUNCE_MS = 2000;

function getPrimaryMailboxId(
  mailboxes: Array<{ id: string; role?: string | null }>,
  role: string,
): string | null {
  return mailboxes.find((m) => m.role === role)?.id ?? mailboxes[0]?.id ?? null;
}

type ComposeDraftAutosaveInput = {
  client: StalwartJmapClient | null;
  session: JmapSession | null;
  mailboxes: Array<{ id: string; role?: string | null }>;
  identities: Array<{
    id: string;
    email: string;
    name?: string | null;
  }>;
  fallbackFromEmail: string;
  mailServerPolicy?: MailServerPolicy | null;
  enabled: boolean;
  onDraftSaved?: (input: {
    savedDraftId: string;
    previousDraftId: string | null;
    preview: JmapEmailMessage;
  }) => void;
};

export function useComposeDraftAutosave(input: ComposeDraftAutosaveInput) {
  const {
    client,
    session,
    mailboxes,
    identities,
    fallbackFromEmail,
    mailServerPolicy,
    onDraftSaved,
    enabled,
  } = input;
  const { isComposeOpen, isFullCompose } = useMailComposeChrome();
  const composeActive = isComposeOpen || isFullCompose;
  const {
    composeTo,
    composeCc,
    composeBcc,
    composeSubject,
    composeBody,
    composeHtmlBody,
    selectedIdentityId,
  } = useMailCompose();
  const inflightSaveRef = useRef<Promise<string | null> | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedDataRef = useRef<string>("");

  const saveDraftOnce = useCallback(async (): Promise<string | null> => {
    const bridge = getMailComposeBridge();
    if (!bridge || !client || !session) return null;

    const draft = bridge.getDraft();
    const parseList = (raw: string) =>
      raw
        .split(/[,;]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);

    const toAddresses = parseList(draft.to);
    const ccAddresses = parseList(draft.cc);
    const bccAddresses = parseList(draft.bcc);
    const composeSettings = readMailComposeSettings();
    const { textBody: plainBody, htmlBody } = resolveOutgoingComposeBodies({
      body: draft.body,
      htmlBody: draft.htmlBody,
      signatureAlreadyEmbedded: draft.signatureAlreadyEmbedded,
    });
    const htmlForDraft = composeSettings.plainTextMode ? undefined : htmlBody;

    if (
      !toAddresses.length &&
      !draft.subject.trim() &&
      !plainBody &&
      !htmlForDraft
    ) {
      return bridge.getDraftIdRef();
    }

    const previousDraftId = bridge.getDraftIdRef();
    const payloadKey = JSON.stringify({
      to: toAddresses,
      cc: ccAddresses,
      bcc: bccAddresses,
      subject: draft.subject,
      body: plainBody,
      htmlBody: htmlForDraft ?? "",
      identityId: draft.identityId,
      draftId: previousDraftId,
    });

    if (payloadKey === lastSavedDataRef.current) {
      return previousDraftId;
    }

    const draftsMailboxId = getPrimaryMailboxId(mailboxes, "drafts");
    if (!draftsMailboxId) return null;

    if (mailServerPolicy) {
      const estimatedBytes = estimateOutgoingJmapMessageBytes({
        subject: draft.subject.trim() || "(No subject)",
        textBody: plainBody,
        htmlBody: htmlForDraft,
      });
      const messageSizeError = validateOutgoingMessageSize(
        estimatedBytes,
        mailServerPolicy.limits.maxMessageSizeBytes,
      );
      if (messageSizeError) {
        bridge.setDraftSaveStatus("error");
        return null;
      }
      const requestSizeError = validateJmapRequestSize(
        estimatedBytes,
        mailServerPolicy,
      );
      if (requestSizeError) {
        bridge.setDraftSaveStatus("error");
        return null;
      }
    }

    const identity =
      identities.find((entry) => entry.id === draft.identityId) ??
      identities[0];
    const fromEmail = identity?.email ?? fallbackFromEmail;
    const fromName = identity?.name ?? null;

    bridge.setDraftSaveStatus("saving");

    try {
      const savedDraftId = await client.saveDraft(session, {
        draftsMailboxId,
        fromEmail,
        fromName,
        to: toAddresses,
        cc: ccAddresses.length ? ccAddresses : undefined,
        bcc: bccAddresses.length ? bccAddresses : undefined,
        subject: draft.subject.trim() || "(No subject)",
        textBody: plainBody,
        htmlBody: htmlForDraft,
        previousDraftId: previousDraftId ?? undefined,
      });

      bridge.setDraftId(savedDraftId);
      lastSavedDataRef.current = payloadKey;
      bridge.acknowledgeSavedDraft();
      bridge.setDraftSaveStatus("saved");
      window.setTimeout(() => {
        bridge.setDraftSaveStatus("idle");
      }, 2000);

      onDraftSaved?.({
        savedDraftId,
        previousDraftId,
        preview: {
          id: savedDraftId,
          subject: draft.subject.trim() || "(No subject)",
          preview: (plainBody || draft.subject.trim() || "(No subject)").slice(
            0,
            256,
          ),
          receivedAt: new Date().toISOString(),
          keywords: { $draft: true },
          mailboxIds: { [draftsMailboxId]: true },
          from: [{ email: fromEmail, ...(fromName ? { name: fromName } : {}) }],
          to: toAddresses.map((email) => ({ email })),
        },
      });

      return savedDraftId;
    } catch (error) {
      log.error("Failed to auto-save draft", error);
      bridge.setDraftSaveStatus("error");
      window.setTimeout(() => {
        bridge.setDraftSaveStatus("idle");
      }, 3000);
      return null;
    }
  }, [
    client,
    fallbackFromEmail,
    identities,
    mailboxes,
    mailServerPolicy,
    onDraftSaved,
    session,
  ]);

  const cancelPendingSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
  }, []);

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

  const flushDraftSave = useCallback(async (): Promise<string | null> => {
    cancelPendingSave();
    const previous = inflightSaveRef.current;
    if (previous) {
      try {
        await previous;
      } catch {
        /* prior failure already surfaced */
      }
    }
    return saveDraftOnce();
  }, [cancelPendingSave, saveDraftOnce]);

  useEffect(() => {
    registerComposeDraftSaver({
      save: saveDraft,
      flush: flushDraftSave,
      cancelPending: cancelPendingSave,
    });
    return () => registerComposeDraftSaver(null);
  }, [cancelPendingSave, flushDraftSave, saveDraft]);

  useEffect(() => {
    if (!enabled || !composeActive) {
      cancelPendingSave();
      return cancelPendingSave;
    }

    const bridge = getMailComposeBridge();
    if (!bridge?.isComposeDirty()) {
      return cancelPendingSave;
    }

    const hasContent =
      composeTo.trim() ||
      composeSubject.trim() ||
      composeBody.trim() ||
      composeHtmlBody.trim();
    if (!hasContent) {
      return cancelPendingSave;
    }

    cancelPendingSave();
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      void saveDraft();
    }, AUTOSAVE_DEBOUNCE_MS) as ReturnType<typeof setTimeout>;

    return cancelPendingSave;
  }, [
    composeTo,
    composeCc,
    composeBcc,
    composeSubject,
    composeBody,
    composeHtmlBody,
    selectedIdentityId,
    enabled,
    composeActive,
    saveDraft,
    cancelPendingSave,
  ]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const bridge = getMailComposeBridge();
      if (!bridge?.isComposeDirty()) return;
      void flushDraftSave();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [flushDraftSave]);

  return { saveDraft, flushDraftSave, inflightSaveRef };
}
