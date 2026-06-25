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
import {
  appendPlainTextSignature,
  buildEmbeddedSignatureHtml,
  getPlainTextSignature,
  hasEmbeddedSignature,
  htmlToPlainText,
  resolveComposeSignatureIdentity,
} from "@/lib/mail/signature-utils";
import { buildQuotedHtmlBlock } from "@/components/mail/quoted-html";
import {
  rewriteCidImagesForEditor,
  sanitizeQuotedEmailHtml,
  type QuotedInlineAttachment,
} from "@/lib/mail/compose-editor-utils";
import { resetComposeInlineImages } from "@/lib/mail/compose-inline-images";
import { readMailComposeSettings } from "@/lib/mail/compose-settings";
import { resolveReplyFrom } from "@/lib/mail/reply-identity";

export type ComposeMode = "new" | "reply" | "forward" | "draft";

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
  composeMode: ComposeMode;
  signatureAlreadyEmbedded: boolean;
};

export type DraftSaveStatus = "idle" | "saving" | "saved" | "error";

type ComposeSnapshot = {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  htmlBody: string;
  attachmentCount: number;
  identityId: string | null;
};

function buildComposeSnapshot(draft: ComposeDraft): ComposeSnapshot {
  return {
    to: draft.to,
    cc: draft.cc,
    bcc: draft.bcc,
    subject: draft.subject,
    body: draft.body,
    htmlBody: draft.htmlBody,
    attachmentCount: draft.attachments.length,
    identityId: draft.identityId,
  };
}

export type MailComposeBridge = {
  getDraft: () => ComposeDraft;
  resetDraft: () => void;
  clearCompose: () => void;
  openNewCompose: () => void;
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
  openDraftEditor: (
    message: JmapEmailMessage,
    overrides?: {
      plaintext?: string | null;
      html?: string | null;
    },
  ) => void;
  markDirty: () => void;
  isComposeDirty: () => boolean;
  captureComposeBaseline: () => void;
  acknowledgeSavedDraft: () => void;
  getDraftIdRef: () => string | null;
  setDraftId: (id: string | null) => void;
  setDraftSaveStatus: (status: DraftSaveStatus) => void;
  bumpComposeSessionId: () => void;
};

const composeBridgeRef: { current: MailComposeBridge | null } = {
  current: null,
};

export type ComposeDraftSaver = {
  save: () => Promise<string | null>;
  flush: () => Promise<string | null>;
  cancelPending: () => void;
};

const composeDraftSaveRef: {
  current: ComposeDraftSaver | null;
} = { current: null };

export function getMailComposeBridge(): MailComposeBridge | null {
  return composeBridgeRef.current;
}

export function registerComposeDraftSaver(
  saver: ComposeDraftSaver | null,
) {
  composeDraftSaveRef.current = saver;
}

export async function flushComposeDraftSave(): Promise<string | null> {
  if (!composeDraftSaveRef.current) {
    return null;
  }
  return composeDraftSaveRef.current.flush();
}

export function cancelComposeDraftSave(): void {
  composeDraftSaveRef.current?.cancelPending();
}

export type ComposeCloseActions = {
  dismiss: () => void;
  discardDraft?: (draftId: string) => void;
};

const composeCloseActionsRef: { current: ComposeCloseActions | null } = {
  current: null,
};

export function registerComposeCloseActions(
  actions: ComposeCloseActions | null,
): void {
  composeCloseActionsRef.current = actions;
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
  composeMode: ComposeMode;
  quotedAttachments: QuotedInlineAttachment[];
  openNewCompose: () => void;
  composeSessionId: number;
  requestComposeClose: (afterClose?: () => void) => boolean;
};

type MailComposeClosePromptContextValue = {
  composeClosePromptOpen: boolean;
  setComposeClosePromptOpen: (open: boolean) => void;
  keepEditing: () => void;
  saveDraftAndClose: () => Promise<void>;
  discardAndClose: () => void;
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

const MailComposeClosePromptContext = createContext<
  MailComposeClosePromptContextValue | undefined
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

export function useMailComposeClosePrompt() {
  const context = use(MailComposeClosePromptContext);
  if (!context) {
    throw new Error(
      "useMailComposeClosePrompt must be used within MailComposeProvider",
    );
  }
  return context;
}

export function useComposeActive(): boolean {
  const { isComposeOpen, isFullCompose } = useMailComposeChrome();
  return isComposeOpen || isFullCompose;
}

const pendingCloseActionRef: { current: (() => void) | null } = {
  current: null,
};

function addressesToCsv(
  addresses: Array<{ email?: string | null }> | undefined,
): string {
  return (addresses ?? [])
    .map((entry) => entry.email?.trim())
    .filter(Boolean)
    .join(", ");
}

function resolveSignatureIdentity(
  identities: JmapIdentity[],
  identityId: string | null,
): JmapIdentity | null {
  return resolveComposeSignatureIdentity(identities, identityId);
}

function mapQuotedAttachments(
  message: JmapEmailMessage,
): QuotedInlineAttachment[] {
  return (message.attachments ?? []).map((attachment) => ({
    blobId: attachment.blobId,
    name: attachment.name,
    type: attachment.type,
    size: attachment.size,
    disposition: attachment.disposition,
    cid: attachment.cid,
  }));
}

function buildNewComposeBodies(
  identity: JmapIdentity | null,
): { body: string; htmlBody: string; signatureAlreadyEmbedded: boolean } {
  const settings = readMailComposeSettings();
  const signatureIdentity = resolveSignatureIdentity(
    identity ? [identity] : [],
    identity?.id ?? null,
  );
  const hasSignature = Boolean(
    signatureIdentity?.htmlSignature?.trim() ||
      signatureIdentity?.textSignature?.trim(),
  );

  if (settings.plainTextMode) {
    if (!hasSignature || !signatureIdentity) {
      return { body: "", htmlBody: "", signatureAlreadyEmbedded: false };
    }
    const body = appendPlainTextSignature("", signatureIdentity, {
      separator: settings.signatureSeparatorEnabled,
    });
    return { body, htmlBody: "", signatureAlreadyEmbedded: true };
  }

  const embedded = buildEmbeddedSignatureHtml(signatureIdentity, {
    embed: hasSignature,
    separator: settings.signatureSeparatorEnabled,
  });
  return {
    body: "",
    htmlBody: embedded ? `<p></p>${embedded}` : "",
    signatureAlreadyEmbedded: hasSignature,
  };
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
  const [composeMode, setComposeMode] = useState<ComposeMode>("new");
  const [quotedAttachments, setQuotedAttachments] = useState<
    QuotedInlineAttachment[]
  >([]);
  const [signatureAlreadyEmbedded, setSignatureAlreadyEmbedded] =
    useState(false);
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
  const [composeSessionId, setComposeSessionId] = useState(0);
  const [composeClosePromptOpen, setComposeClosePromptOpen] = useState(false);
  const draftIdRef = useRef<string | null>(null);
  const baselineRef = useRef<ComposeSnapshot | null>(null);
  const explicitCloseRef = useRef(false);

  useEffect(() => {
    draftIdRef.current = draftId;
  }, [draftId]);

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
      composeMode,
      signatureAlreadyEmbedded,
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
      composeMode,
      signatureAlreadyEmbedded,
    ],
  );

  const draftRef = useRef(draft);
  draftRef.current = draft;

  const markDirty = useCallback(() => {
    /* baseline comparison handles dirty detection */
  }, []);

  const captureComposeBaseline = useCallback(() => {
    baselineRef.current = buildComposeSnapshot(draftRef.current);
  }, []);

  const acknowledgeSavedDraft = useCallback(() => {
    baselineRef.current = buildComposeSnapshot(draftRef.current);
  }, []);

  const isComposeDirty = useCallback(() => {
    const baseline = baselineRef.current;
    if (!baseline) return true;
    return (
      JSON.stringify(buildComposeSnapshot(draftRef.current)) !==
      JSON.stringify(baseline)
    );
  }, []);

  const shouldConfirmComposeClose = useCallback(() => {
    if (isComposeDirty()) return true;
    if (draftIdRef.current) return true;
    return false;
  }, [isComposeDirty]);

  const runPendingCloseAction = useCallback(() => {
    const action = pendingCloseActionRef.current;
    pendingCloseActionRef.current = null;
    action?.();
  }, []);

  const bumpComposeSessionId = useCallback(() => {
    setComposeSessionId((current) => current + 1);
  }, []);

  const requestComposeClose = useCallback(
    (afterClose?: () => void) => {
      if (!shouldConfirmComposeClose()) {
        pendingCloseActionRef.current = null;
        return true;
      }
      pendingCloseActionRef.current = afterClose ?? null;
      setComposeClosePromptOpen(true);
      return false;
    },
    [shouldConfirmComposeClose],
  );

  const handleKeepEditing = useCallback(() => {
    pendingCloseActionRef.current = null;
    setComposeClosePromptOpen(false);
  }, []);

  const handleSaveDraftAndClose = useCallback(async () => {
    setComposeClosePromptOpen(false);
    await flushComposeDraftSave();
    composeCloseActionsRef.current?.dismiss();
    runPendingCloseAction();
  }, [runPendingCloseAction]);

  const handleDiscardAndClose = useCallback(() => {
    setComposeClosePromptOpen(false);
    const currentDraftId = draftIdRef.current;
    if (currentDraftId) {
      composeCloseActionsRef.current?.discardDraft?.(currentDraftId);
    }
    composeCloseActionsRef.current?.dismiss();
    runPendingCloseAction();
  }, [runPendingCloseAction]);

  const closePromptValue = useMemo(
    () => ({
      composeClosePromptOpen,
      setComposeClosePromptOpen,
      keepEditing: handleKeepEditing,
      saveDraftAndClose: handleSaveDraftAndClose,
      discardAndClose: handleDiscardAndClose,
    }),
    [
      composeClosePromptOpen,
      handleKeepEditing,
      handleSaveDraftAndClose,
      handleDiscardAndClose,
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
    setComposeMode("new");
    setQuotedAttachments([]);
    setSignatureAlreadyEmbedded(false);
    setDraftId(null);
    draftIdRef.current = null;
    baselineRef.current = null;
    explicitCloseRef.current = false;
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
    setComposeMode("new");
    setQuotedAttachments([]);
    setSignatureAlreadyEmbedded(false);
    setDraftId(null);
    draftIdRef.current = null;
    baselineRef.current = null;
    explicitCloseRef.current = false;
    setDraftSaveStatus("idle");
    setSelectedIdentityId(identities[0]?.id ?? null);
    resetComposeInlineImages();
  }, [identities]);

  const dismissCompose = useCallback(() => {
    clearCompose();
    setIsComposeOpen(false);
    setIsFullCompose(false);
  }, [clearCompose]);

  const openNewCompose = useCallback(() => {
    const identity =
      identities.find((entry) => entry.id === resolvedIdentityId) ??
      identities[0] ??
      null;
    setComposeTo("");
    setComposeCc("");
    setComposeBcc("");
    setComposeSubject("");
    setComposeAttachments([]);
    setComposeReplyContext(null);
    setQuotedAttachments([]);
    setComposeMode("new");
    setDraftId(null);
    draftIdRef.current = null;
    baselineRef.current = null;
    explicitCloseRef.current = false;
    setDraftSaveStatus("idle");
    resetComposeInlineImages();
    const seeded = buildNewComposeBodies(identity);
    setComposeBody(seeded.body);
    setComposeHtmlBody(seeded.htmlBody);
    setSignatureAlreadyEmbedded(seeded.signatureAlreadyEmbedded);
    baselineRef.current = buildComposeSnapshot({
      to: "",
      cc: "",
      bcc: "",
      subject: "",
      body: seeded.body,
      htmlBody: seeded.htmlBody,
      attachments: [],
      replyContext: null,
      identityId: resolvedIdentityId,
      draftId: null,
      composeMode: "new",
      signatureAlreadyEmbedded: seeded.signatureAlreadyEmbedded,
    });
    setIsComposeOpen(true);
    setIsFullCompose(false);
  }, [identities, resolvedIdentityId]);

  const seedReply = useCallback(
    (message: JmapEmailMessage, plaintext: string | null) => {
      const settings = readMailComposeSettings();
      const sender = message.from?.[0]?.email ?? "";
      let replyIdentityId = resolvedIdentityId;
      if (settings.autoSelectReplyIdentity) {
        const resolved = resolveReplyFrom(identities, {
          to: message.to,
          cc: message.cc,
          bcc: message.bcc,
        });
        if (resolved) {
          replyIdentityId = resolved.identityId;
          setSelectedIdentityId(resolved.identityId);
        }
      }
      const currentIdentity =
        identities.find((entry) => entry.id === replyIdentityId) ??
        identities[0] ??
        null;
      const signatureIdentity = resolveSignatureIdentity(
        identities,
        currentIdentity?.id ?? null,
      );
      const currentIdentityEmail = currentIdentity?.email ?? null;
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
      const from = message.from?.[0];
      const fromLabel = from?.name || from?.email || sender;
      const embedAboveQuote =
        settings.signaturePosition === "above_quote" &&
        Boolean(
          signatureIdentity?.htmlSignature?.trim() ||
            signatureIdentity?.textSignature?.trim(),
        );
      const signatureBlock = embedAboveQuote
        ? buildEmbeddedSignatureHtml(signatureIdentity, {
            embed: true,
            separator: settings.signatureSeparatorEnabled,
          })
        : "";

      setComposeTo(replyRecipients.join(", "));
      setComposeCc("");
      setComposeBcc("");
      setComposeSubject(subject.startsWith("Re: ") ? subject : `Re: ${subject}`);
      const quotedPlain = `\n\n---\nOn ${date}, ${sender} wrote:\n${body}`;
      const sanitizedQuote = rewriteCidImagesForEditor(
        sanitizeQuotedEmailHtml(htmlBody),
      );
      const quotedHtml = settings.plainTextMode
        ? ""
        : `<p></p>${signatureBlock}<div><p>On ${date}, ${fromLabel} wrote:</p></div>${buildQuotedHtmlBlock(sanitizedQuote)}`;
      const plainBody = settings.plainTextMode
        ? `${embedAboveQuote ? `${settings.signatureSeparatorEnabled ? "\n\n-- \n" : "\n\n"}${getPlainTextSignature(signatureIdentity)}` : ""}\n\nOn ${date}, ${fromLabel} wrote:\n${body
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n")}`
        : quotedPlain;
      setComposeBody(plainBody);
      setComposeHtmlBody(quotedHtml);
      setComposeAttachments([]);
      setComposeReplyContext(buildReplyContext(message));
      setComposeMode("reply");
      setQuotedAttachments(mapQuotedAttachments(message));
      setSignatureAlreadyEmbedded(embedAboveQuote);
      setDraftId(null);
      draftIdRef.current = null;
      baselineRef.current = null;
      explicitCloseRef.current = false;
      resetComposeInlineImages();
      setIsComposeOpen(true);
    },
    [identities, resolvedIdentityId],
  );

  const seedForward = useCallback(
    (message: JmapEmailMessage, plaintext: string | null) => {
      const settings = readMailComposeSettings();
      const sender = message.from?.[0]?.email ?? "";
      let forwardIdentityId = resolvedIdentityId;
      if (settings.autoSelectReplyIdentity) {
        const resolved = resolveReplyFrom(identities, {
          to: message.to,
          cc: message.cc,
          bcc: message.bcc,
        });
        if (resolved) {
          forwardIdentityId = resolved.identityId;
          setSelectedIdentityId(resolved.identityId);
        }
      }
      const subject = message.subject ?? "";
      const { text, html } = extractMessageBodies(message);
      const body = plaintext ?? text ?? "";
      const htmlBody = html ?? `<p>${body.replace(/\n/g, "<br>")}</p>`;
      const currentIdentity =
        identities.find((entry) => entry.id === forwardIdentityId) ??
        identities[0] ??
        null;
      const signatureIdentity = resolveSignatureIdentity(
        identities,
        currentIdentity?.id ?? null,
      );
      const embedAboveQuote =
        settings.signaturePosition === "above_quote" &&
        Boolean(
          signatureIdentity?.htmlSignature?.trim() ||
            signatureIdentity?.textSignature?.trim(),
        );
      const signatureBlock = embedAboveQuote
        ? buildEmbeddedSignatureHtml(signatureIdentity, {
            embed: true,
            separator: settings.signatureSeparatorEnabled,
          })
        : "";
      setComposeTo("");
      setComposeCc("");
      setComposeBcc("");
      setComposeSubject(
        subject.startsWith("Fwd: ") ? subject : `Fwd: ${subject}`,
      );
      const date = message.receivedAt
        ? new Date(message.receivedAt).toLocaleString()
        : "";
      const from = message.from?.[0];
      const fromFull =
        from?.name && from.email && from.name !== from.email
          ? `${from.name} <${from.email}>`
          : (from?.email || from?.name || sender);
      const sanitizedQuote = rewriteCidImagesForEditor(
        sanitizeQuotedEmailHtml(htmlBody),
      );
      const forwardHeader = `<div>---------- Forwarded message ----------<br>From: ${fromFull}<br>Date: ${date}<br>Subject: ${subject}<br><br></div>`;
      const plainForward = `---------- Forwarded message ----------\nFrom: ${fromFull}\nDate: ${date}\nSubject: ${subject}\n\n${body}`;
      const plainBody = settings.plainTextMode
        ? `${embedAboveQuote ? `${settings.signatureSeparatorEnabled ? "\n\n-- \n" : "\n\n"}${getPlainTextSignature(signatureIdentity)}` : ""}\n\n${plainForward}`
        : `\n\n---\nForwarded message from ${sender}:\n${body}`;
      setComposeBody(plainBody);
      setComposeHtmlBody(
        settings.plainTextMode
          ? ""
          : `<p></p>${signatureBlock}${forwardHeader}${buildQuotedHtmlBlock(sanitizedQuote)}`,
      );
      setComposeAttachments([]);
      setComposeReplyContext(null);
      setComposeMode("forward");
      setQuotedAttachments(mapQuotedAttachments(message));
      setSignatureAlreadyEmbedded(embedAboveQuote);
      setDraftId(null);
      draftIdRef.current = null;
      baselineRef.current = null;
      explicitCloseRef.current = false;
      resetComposeInlineImages();
      setIsComposeOpen(true);
    },
    [identities, resolvedIdentityId],
  );

  const seedNewMessage = useCallback(
    (recipient: { email: string; name?: string | null }) => {
      const email = recipient.email.trim();
      const name = recipient.name?.trim();
      const to =
        name && name.toLowerCase() !== email.toLowerCase()
          ? `${name} <${email}>`
          : email;
      const identity =
        identities.find((entry) => entry.id === resolvedIdentityId) ??
        identities[0] ??
        null;
      const seeded = buildNewComposeBodies(identity);

      setComposeTo(to);
      setComposeCc("");
      setComposeBcc("");
      setComposeSubject("");
      setComposeBody(seeded.body);
      setComposeHtmlBody(seeded.htmlBody);
      setComposeAttachments([]);
      setComposeReplyContext(null);
      setComposeMode("new");
      setQuotedAttachments([]);
      setSignatureAlreadyEmbedded(seeded.signatureAlreadyEmbedded);
      setDraftId(null);
      draftIdRef.current = null;
      baselineRef.current = null;
      explicitCloseRef.current = false;
      setDraftSaveStatus("idle");
      resetComposeInlineImages();
      setIsComposeOpen(true);
      setIsFullCompose(false);
    },
    [identities, resolvedIdentityId],
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
      setComposeMode("draft");
      setQuotedAttachments(mapQuotedAttachments(message));
      setSignatureAlreadyEmbedded(hasEmbeddedSignature(htmlBody));
      const draftFromEmail = message.from?.[0]?.email;
      const matchedIdentity = draftFromEmail
        ? identities.find((identity) => identity.email === draftFromEmail)
        : null;
      const draftIdentityId =
        matchedIdentity?.id ?? resolvedIdentityId ?? identities[0]?.id ?? null;
      if (draftIdentityId) {
        setSelectedIdentityId(draftIdentityId);
      }
      setDraftId(message.id);
      draftIdRef.current = message.id;
      baselineRef.current = buildComposeSnapshot({
        to: addressesToCsv(message.to),
        cc: addressesToCsv(message.cc),
        bcc: addressesToCsv(message.bcc),
        subject: message.subject ?? "",
        body: bodyText,
        htmlBody,
        attachments: [],
        replyContext: buildReplyContext(message),
        identityId: draftIdentityId,
        draftId: message.id,
        composeMode: "draft",
        signatureAlreadyEmbedded: hasEmbeddedSignature(htmlBody),
      });
      setDraftSaveStatus("idle");
      setIsComposeOpen(false);
      setIsFullCompose(true);
    },
    [identities, resolvedIdentityId],
  );

  const openDraftEditor = useCallback(
    (
      message: JmapEmailMessage,
      overrides?: {
        plaintext?: string | null;
        html?: string | null;
      },
    ) => {
      bumpComposeSessionId();
      seedDraft(message, overrides);
    },
    [bumpComposeSessionId, seedDraft],
  );

  useEffect(() => {
    composeBridgeRef.current = {
      getDraft: () => draftRef.current,
      resetDraft,
      clearCompose,
      openNewCompose,
      seedReply,
      seedForward,
      seedNewMessage,
      seedDraft,
      openDraftEditor,
      markDirty,
      isComposeDirty,
      captureComposeBaseline,
      acknowledgeSavedDraft,
      bumpComposeSessionId,
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
    resetDraft,
    clearCompose,
    openNewCompose,
    seedReply,
    seedForward,
    seedNewMessage,
    seedDraft,
    openDraftEditor,
    markDirty,
    isComposeDirty,
    captureComposeBaseline,
    acknowledgeSavedDraft,
    bumpComposeSessionId,
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
      composeMode,
      quotedAttachments,
      openNewCompose,
      composeSessionId,
      requestComposeClose,
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
      composeMode,
      quotedAttachments,
      openNewCompose,
      composeSessionId,
      requestComposeClose,
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
        <MailComposeClosePromptContext.Provider value={closePromptValue}>
          {children}
        </MailComposeClosePromptContext.Provider>
      </MailComposeFieldsContext.Provider>
    </MailComposeChromeContext.Provider>
  );
}
