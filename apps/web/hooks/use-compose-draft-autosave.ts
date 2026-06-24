"use client";

import { useCallback, useEffect, useRef } from "react";
import { createLogger } from "@workspace/logger";
import type { StalwartJmapClient } from "@/lib/mail/jmap-client";
import type { JmapSession } from "@/lib/mail/types";
import {
  getMailComposeBridge,
  registerComposeDraftSaver,
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
};

export function useComposeDraftAutosave(input: ComposeDraftAutosaveInput) {
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
    if (!bridge || !input.client || !input.session) return null;

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

    const payloadKey = JSON.stringify({
      to: toAddresses,
      cc: ccAddresses,
      bcc: bccAddresses,
      subject: draft.subject,
      body: plainBody,
      htmlBody: htmlForDraft ?? "",
      identityId: draft.identityId,
      draftId: bridge.getDraftIdRef(),
    });

    if (payloadKey === lastSavedDataRef.current) {
      return bridge.getDraftIdRef();
    }

    const draftsMailboxId = getPrimaryMailboxId(input.mailboxes, "drafts");
    if (!draftsMailboxId) return null;

    if (input.mailServerPolicy) {
      const estimatedBytes = estimateOutgoingJmapMessageBytes({
        subject: draft.subject.trim() || "(No subject)",
        textBody: plainBody,
        htmlBody: htmlForDraft,
      });
      const messageSizeError = validateOutgoingMessageSize(
        estimatedBytes,
        input.mailServerPolicy.limits.maxMessageSizeBytes,
      );
      if (messageSizeError) {
        bridge.setDraftSaveStatus("error");
        return null;
      }
      const requestSizeError = validateJmapRequestSize(
        estimatedBytes,
        input.mailServerPolicy,
      );
      if (requestSizeError) {
        bridge.setDraftSaveStatus("error");
        return null;
      }
    }

    const identity =
      input.identities.find((entry) => entry.id === draft.identityId) ??
      input.identities[0];
    const fromEmail =
      draft.fromEmailOverride ??
      identity?.email ??
      input.fallbackFromEmail;
    const fromName = identity?.name ?? null;

    bridge.setDraftSaveStatus("saving");

    try {
      const savedDraftId = await input.client.saveDraft(input.session, {
        draftsMailboxId,
        fromEmail,
        fromName,
        to: toAddresses,
        cc: ccAddresses.length ? ccAddresses : undefined,
        bcc: bccAddresses.length ? bccAddresses : undefined,
        subject: draft.subject.trim() || "(No subject)",
        textBody: plainBody,
        htmlBody: htmlForDraft,
        previousDraftId: bridge.getDraftIdRef() ?? undefined,
      });

      bridge.setDraftId(savedDraftId);
      lastSavedDataRef.current = payloadKey;
      bridge.setDraftSaveStatus("saved");
      window.setTimeout(() => {
        bridge.setDraftSaveStatus("idle");
      }, 2000);
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
    input.client,
    input.fallbackFromEmail,
    input.identities,
    input.mailboxes,
    input.mailServerPolicy,
    input.session,
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
    registerComposeDraftSaver(saveDraft);
    return () => registerComposeDraftSaver(null);
  }, [saveDraft]);

  useEffect(() => {
    if (!input.enabled || !composeActive) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      return;
    }

    const hasContent =
      composeTo.trim() ||
      composeSubject.trim() ||
      composeBody.trim() ||
      composeHtmlBody.trim();
    if (!hasContent) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      void saveDraft();
    }, AUTOSAVE_DEBOUNCE_MS) as ReturnType<typeof setTimeout>;

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    composeTo,
    composeCc,
    composeBcc,
    composeSubject,
    composeBody,
    composeHtmlBody,
    selectedIdentityId,
    input.enabled,
    composeActive,
    saveDraft,
  ]);

  return { saveDraft, inflightSaveRef };
}
