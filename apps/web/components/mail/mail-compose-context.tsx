"use client";

import React, {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { resolveReplyRecipients, type MailServerLimits } from "@workspace/calendar-core";
import type { JmapEmailMessage, JmapIdentity } from "@/lib/mail/types";
import { extractMessageBodies } from "@/lib/mail/message-security";
import { htmlToPlainText } from "@/lib/mail/signature-utils";

type MailReplyContext = {
  threadId: string | null;
  inReplyTo?: string[];
  references?: string[];
};

function buildReplyContext(
  message: Pick<JmapEmailMessage, "threadId" | "messageId" | "references">,
): MailReplyContext {
  const messageIds = (message.messageId ?? []).filter(Boolean);
  const references = Array.from(
    new Set([...(message.references ?? []).filter(Boolean), ...messageIds]),
  );

  return {
    threadId: message.threadId ?? null,
    inReplyTo: messageIds.length > 0 ? messageIds : undefined,
    references: references.length > 0 ? references : undefined,
  };
}

export type ComposeDraft = {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  htmlBody: string;
  attachments: File[];
  replyContext: MailReplyContext | null;
  identityId: string | null;
  draftId: string | null;
};

export type DraftSaveStatus = "idle" | "saving" | "saved" | "error";

export type MailComposeBridge = {
  getDraft: () => ComposeDraft;
  resetDraft: () => void;
  clearCompose: () => void;
  seedReply: (message: JmapEmailMessage, plaintext: string | null) => void;
  seedForward: (message: JmapEmailMessage, plaintext: string | null) => void;
  seedNewMessage: (recipient: {
    email: string;
    name?: string | null;
  }) => void;
  seedDraft: (
    message: JmapEmailMessage,
    overrides?: {
      plaintext?: string | null;
      html?: string | null;
    },
  ) => void;
  markDirty: () => void;
  getDraftIdRef: () => string | null;
  setDraftId: (id: string | null) => void;
  setDraftSaveStatus: (status: DraftSaveStatus) => void;
};

const composeBridgeRef: { current: MailComposeBridge | null } = {
  current: null,
};

const composeDraftSaveRef: {
  current: (() => Promise<string | null>) | null;
} = { current: null };

export function getMailComposeBridge(): MailComposeBridge | null {
  return composeBridgeRef.current;
}

export function registerComposeDraftSaver(
  saver: (() => Promise<string | null>) | null,
) {
  composeDraftSaveRef.current = saver;
}

export async function flushComposeDraftSave(): Promise<string | null> {
  if (!composeDraftSaveRef.current) {
    return null;
  }
  return composeDraftSaveRef.current();
}

type MailComposeFieldsContextValue = {
  composeTo: string;
  setComposeTo: (value: string) => void;
  composeCc: string;
  setComposeCc: (value: string) => void;
  composeBcc: string;
  setComposeBcc: (value: string) => void;
  composeSubject: string;
  setComposeSubject: (value: string) => void;
  composeBody: string;
  setComposeBody: (value: string) => void;
  composeHtmlBody: string;
  setComposeHtmlBody: (value: string) => void;
  composeAttachments: File[];
  setComposeAttachments: React.Dispatch<React.SetStateAction<File[]>>;
  mailServerLimits: MailServerLimits;
  selectedIdentityId: string | null;
  setSelectedIdentityId: (id: string | null) => void;
  draftSaveStatus: DraftSaveStatus;
  setDraftSaveStatus: (status: DraftSaveStatus) => void;
  composeDraftId: string | null;
  clearCompose: () => void;
};

type MailComposeChromeContextValue = {
  isComposeOpen: boolean;
  setIsComposeOpen: (open: boolean) => void;
  isFullCompose: boolean;
  setIsFullCompose: (open: boolean) => void;
  dismissCompose: () => void;
};

const MailComposeFieldsContext = createContext<
  MailComposeFieldsContextValue | undefined
>(undefined);

const MailComposeChromeContext = createContext<
  MailComposeChromeContextValue | undefined
>(undefined);

export function useMailCompose() {
  const context = use(MailComposeFieldsContext);
  if (!context) {
    throw new Error("useMailCompose must be used within MailComposeProvider");
  }
  return context;
}

export function useMailComposeChrome() {
  const context = use(MailComposeChromeContext);
  if (!context) {
    throw new Error(
      "useMailComposeChrome must be used within MailComposeProvider",
    );
  }
  return context;
}

function addressesToCsv(
  addresses: Array<{ email?: string | null }> | undefined,
): string {
  return (addresses ?? [])
    .map((entry) => entry.email?.trim())
    .filter(Boolean)
    .join(", ");
}

export function MailComposeProvider({
  children,
  identities = [],
  mailServerLimits,
}: {
  children: ReactNode;
  identities?: JmapIdentity[];
  mailServerLimits: MailServerLimits;
}) {
  const [composeTo, setComposeTo] = useState("");
  const [composeCc, setComposeCc] = useState("");
  const [composeBcc, setComposeBcc] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeHtmlBody, setComposeHtmlBody] = useState("");
  const [composeAttachments, setComposeAttachments] = useState<File[]>([]);
  const [composeReplyContext, setComposeReplyContext] =
    useState<MailReplyContext | null>(null);
  const [selectedIdentityId, setSelectedIdentityId] = useState<string | null>(
    null,
  );
  const resolvedIdentityId =
    selectedIdentityId &&
    identities.some((entry) => entry.id === selectedIdentityId)
      ? selectedIdentityId
      : (identities[0]?.id ?? null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftSaveStatus, setDraftSaveStatus] =
    useState<DraftSaveStatus>("idle");
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isFullCompose, setIsFullCompose] = useState(false);
  const draftIdRef = useRef<string | null>(null);
  const isDirtyRef = useRef(false);

  useEffect(() => {
    draftIdRef.current = draftId;
  }, [draftId]);

  const markDirty = useCallback(() => {
    isDirtyRef.current = true;
  }, []);

  const draft = useMemo(
    () => ({
      to: composeTo,
      cc: composeCc,
      bcc: composeBcc,
      subject: composeSubject,
      body: composeBody,
      htmlBody: composeHtmlBody,
      attachments: composeAttachments,
      replyContext: composeReplyContext,
      identityId: resolvedIdentityId,
      draftId,
    }),
    [
      composeTo,
      composeCc,
      composeBcc,
      composeSubject,
      composeBody,
      composeHtmlBody,
      composeAttachments,
      composeReplyContext,
      resolvedIdentityId,
      draftId,
    ],
  );

  const resetDraft = useCallback(() => {
    setComposeTo("");
    setComposeCc("");
    setComposeBcc("");
    setComposeSubject("");
    setComposeBody("");
    setComposeHtmlBody("");
    setComposeAttachments([]);
    setComposeReplyContext(null);
    setDraftId(null);
    draftIdRef.current = null;
    isDirtyRef.current = false;
    setDraftSaveStatus("idle");
    setIsComposeOpen(false);
    setIsFullCompose(false);
    setSelectedIdentityId(identities[0]?.id ?? null);
  }, [identities]);

  const clearCompose = useCallback(() => {
    setComposeTo("");
    setComposeCc("");
    setComposeBcc("");
    setComposeSubject("");
    setComposeBody("");
    setComposeHtmlBody("");
    setComposeAttachments([]);
    setComposeReplyContext(null);
    setDraftId(null);
    draftIdRef.current = null;
    isDirtyRef.current = false;
    setDraftSaveStatus("idle");
    setSelectedIdentityId(identities[0]?.id ?? null);
  }, [identities]);

  const dismissCompose = useCallback(() => {
    clearCompose();
    setIsComposeOpen(false);
    setIsFullCompose(false);
  }, [clearCompose]);

  const seedReply = useCallback(
    (message: JmapEmailMessage, plaintext: string | null) => {
      const sender = message.from?.[0]?.email ?? "";
      const currentIdentityEmail =
        identities.find((entry) => entry.id === resolvedIdentityId)?.email ??
        identities[0]?.email ??
        null;
      const replyRecipients = resolveReplyRecipients({
        from: message.from,
        to: message.to,
        cc: message.cc,
        currentUserEmail: currentIdentityEmail,
      });
      const subject = message.subject ?? "";
      const { text, html } = extractMessageBodies(message);
      const body = plaintext ?? text ?? "";
      const htmlBody = html ?? `<p>${body.replace(/\n/g, "<br>")}</p>`;
      const date = message.receivedAt
        ? new Date(message.receivedAt).toLocaleString()
        : "";
      setComposeTo(replyRecipients.join(", "));
      setComposeCc("");
      setComposeBcc("");
      setComposeSubject(subject.startsWith("Re: ") ? subject : `Re: ${subject}`);
      const quotedPlain = `\n\n---\nOn ${date}, ${sender} wrote:\n${body}`;
      const quotedHtml = `<p></p><hr><p>On ${date}, ${sender} wrote:</p><blockquote>${htmlBody}</blockquote>`;
      setComposeBody(quotedPlain);
      setComposeHtmlBody(quotedHtml);
      setComposeAttachments([]);
      setComposeReplyContext(buildReplyContext(message));
      setDraftId(null);
      draftIdRef.current = null;
      isDirtyRef.current = true;
      setIsComposeOpen(true);
    },
    [identities, resolvedIdentityId],
  );

  const seedForward = useCallback(
    (message: JmapEmailMessage, plaintext: string | null) => {
      const sender = message.from?.[0]?.email ?? "";
      const subject = message.subject ?? "";
      const { text, html } = extractMessageBodies(message);
      const body = plaintext ?? text ?? "";
      const htmlBody = html ?? `<p>${body.replace(/\n/g, "<br>")}</p>`;
      setComposeTo("");
      setComposeCc("");
      setComposeBcc("");
      setComposeSubject(
        subject.startsWith("Fwd: ") ? subject : `Fwd: ${subject}`,
      );
      setComposeBody(`\n\n---\nForwarded message from ${sender}:\n${body}`);
      setComposeHtmlBody(
        `<p></p><hr><p>Forwarded message from ${sender}:</p>${htmlBody}`,
      );
      setComposeAttachments([]);
      setComposeReplyContext(null);
      setDraftId(null);
      draftIdRef.current = null;
      isDirtyRef.current = true;
      setIsComposeOpen(true);
    },
    [],
  );

  const seedNewMessage = useCallback(
    (recipient: { email: string; name?: string | null }) => {
      const email = recipient.email.trim();
      const name = recipient.name?.trim();
      const to =
        name && name.toLowerCase() !== email.toLowerCase()
          ? `${name} <${email}>`
          : email;

      setComposeTo(to);
      setComposeCc("");
      setComposeBcc("");
      setComposeSubject("");
      setComposeBody("");
      setComposeHtmlBody("");
      setComposeAttachments([]);
      setComposeReplyContext(null);
      setDraftId(null);
      draftIdRef.current = null;
      isDirtyRef.current = true;
      setDraftSaveStatus("idle");
      setIsComposeOpen(true);
      setIsFullCompose(false);
    },
    [],
  );

  const seedDraft = useCallback(
    (
      message: JmapEmailMessage,
      overrides?: {
        plaintext?: string | null;
        html?: string | null;
      },
    ) => {
      const { text, html } = extractMessageBodies(message);
      const bodyText =
        overrides?.plaintext != null ? overrides.plaintext : (text ?? "");
      const htmlBody =
        overrides?.html != null
          ? overrides.html
          : (html ??
            (bodyText ? `<p>${bodyText.replace(/\n/g, "<br>")}</p>` : ""));
      setComposeTo(addressesToCsv(message.to));
      setComposeCc(addressesToCsv(message.cc));
      setComposeBcc(addressesToCsv(message.bcc));
      setComposeSubject(message.subject ?? "");
      setComposeHtmlBody(htmlBody);
      setComposeBody(bodyText);
      setComposeAttachments([]);
      setComposeReplyContext(buildReplyContext(message));
      setDraftId(message.id);
      draftIdRef.current = message.id;
      isDirtyRef.current = false;
      setDraftSaveStatus("idle");
      setIsComposeOpen(false);
      setIsFullCompose(true);
    },
    [],
  );

  useEffect(() => {
    composeBridgeRef.current = {
      getDraft: () => draft,
      resetDraft,
      clearCompose,
      seedReply,
      seedForward,
      seedNewMessage,
      seedDraft,
      markDirty,
      getDraftIdRef: () => draftIdRef.current,
      setDraftId: (id) => {
        draftIdRef.current = id;
        setDraftId(id);
      },
      setDraftSaveStatus,
    };
    return () => {
      composeBridgeRef.current = null;
    };
  }, [
    draft,
    resetDraft,
    clearCompose,
    seedReply,
    seedForward,
    seedNewMessage,
    seedDraft,
    markDirty,
    setDraftSaveStatus,
  ]);

  const fieldsValue = useMemo(
    () => ({
      composeTo,
      setComposeTo: (value: string) => {
        markDirty();
        setComposeTo(value);
      },
      composeCc,
      setComposeCc: (value: string) => {
        markDirty();
        setComposeCc(value);
      },
      composeBcc,
      setComposeBcc: (value: string) => {
        markDirty();
        setComposeBcc(value);
      },
      composeSubject,
      setComposeSubject: (value: string) => {
        markDirty();
        setComposeSubject(value);
      },
      composeBody,
      setComposeBody: (value: string) => {
        markDirty();
        setComposeBody(value);
      },
      composeHtmlBody,
      setComposeHtmlBody: (value: string) => {
        markDirty();
        setComposeHtmlBody(value);
        setComposeBody(htmlToPlainText(value));
      },
      composeAttachments,
      setComposeAttachments,
      mailServerLimits,
      selectedIdentityId: resolvedIdentityId,
      setSelectedIdentityId: (id: string | null) => {
        markDirty();
        setSelectedIdentityId(id);
      },
      draftSaveStatus,
      setDraftSaveStatus,
      composeDraftId: draftId,
      clearCompose,
    }),
    [
      composeTo,
      composeCc,
      composeBcc,
      composeSubject,
      composeBody,
      composeHtmlBody,
      composeAttachments,
      mailServerLimits,
      resolvedIdentityId,
      draftSaveStatus,
      draftId,
      markDirty,
      clearCompose,
    ],
  );

  const chromeValue = useMemo(
    () => ({
      isComposeOpen,
      setIsComposeOpen,
      isFullCompose,
      setIsFullCompose,
      dismissCompose,
    }),
    [isComposeOpen, isFullCompose, dismissCompose],
  );

  return (
    <MailComposeChromeContext.Provider value={chromeValue}>
      <MailComposeFieldsContext.Provider value={fieldsValue}>
        {children}
      </MailComposeFieldsContext.Provider>
    </MailComposeChromeContext.Provider>
  );
}
