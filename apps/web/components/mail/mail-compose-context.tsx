"use client";

import React, {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { JmapEmailMessage } from "@/lib/mail/types";

type MailReplyContext = {
  threadId: string | null;
  inReplyTo?: string[];
  references?: string[];
};
import { extractMessageBodies } from "@/lib/mail/message-security";

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
  attachments: File[];
  replyContext: MailReplyContext | null;
};

export type MailComposeBridge = {
  getDraft: () => ComposeDraft;
  resetDraft: () => void;
  seedReply: (message: JmapEmailMessage, plaintext: string | null) => void;
  seedForward: (message: JmapEmailMessage, plaintext: string | null) => void;
};

const composeBridgeRef: { current: MailComposeBridge | null } = {
  current: null,
};

export function getMailComposeBridge(): MailComposeBridge | null {
  return composeBridgeRef.current;
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
  composeAttachments: File[];
  setComposeAttachments: React.Dispatch<React.SetStateAction<File[]>>;
};

type MailComposeChromeContextValue = {
  isComposeOpen: boolean;
  setIsComposeOpen: (open: boolean) => void;
  isFullCompose: boolean;
  setIsFullCompose: (open: boolean) => void;
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

export function MailComposeProvider({ children }: { children: ReactNode }) {
  const [composeTo, setComposeTo] = useState("");
  const [composeCc, setComposeCc] = useState("");
  const [composeBcc, setComposeBcc] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeAttachments, setComposeAttachments] = useState<File[]>([]);
  const [composeReplyContext, setComposeReplyContext] =
    useState<MailReplyContext | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isFullCompose, setIsFullCompose] = useState(false);

  const draft = useMemo(
    () => ({
      to: composeTo,
      cc: composeCc,
      bcc: composeBcc,
      subject: composeSubject,
      body: composeBody,
      attachments: composeAttachments,
      replyContext: composeReplyContext,
    }),
    [
      composeTo,
      composeCc,
      composeBcc,
      composeSubject,
      composeBody,
      composeAttachments,
      composeReplyContext,
    ],
  );

  const resetDraft = useCallback(() => {
    setComposeTo("");
    setComposeCc("");
    setComposeBcc("");
    setComposeSubject("");
    setComposeBody("");
    setComposeAttachments([]);
    setComposeReplyContext(null);
    setIsComposeOpen(false);
    setIsFullCompose(false);
  }, []);

  const seedReply = useCallback(
    (message: JmapEmailMessage, plaintext: string | null) => {
      const sender = message.from?.[0]?.email ?? "";
      const subject = message.subject ?? "";
      const { text } = extractMessageBodies(message);
      const body = plaintext ?? text ?? "";
      const date = message.receivedAt
        ? new Date(message.receivedAt).toLocaleString()
        : "";
      setComposeTo(sender);
      setComposeCc("");
      setComposeBcc("");
      setComposeSubject(subject.startsWith("Re: ") ? subject : `Re: ${subject}`);
      setComposeBody(`\n\n---\nOn ${date}, ${sender} wrote:\n${body}`);
      setComposeAttachments([]);
      setComposeReplyContext(buildReplyContext(message));
      setIsComposeOpen(true);
    },
    [],
  );

  const seedForward = useCallback(
    (message: JmapEmailMessage, plaintext: string | null) => {
      const sender = message.from?.[0]?.email ?? "";
      const subject = message.subject ?? "";
      const { text } = extractMessageBodies(message);
      const body = plaintext ?? text ?? "";
      setComposeTo("");
      setComposeCc("");
      setComposeBcc("");
      setComposeSubject(
        subject.startsWith("Fwd: ") ? subject : `Fwd: ${subject}`,
      );
      setComposeBody(`\n\n---\nForwarded message from ${sender}:\n${body}`);
      setComposeAttachments([]);
      setComposeReplyContext(null);
      setIsComposeOpen(true);
    },
    [],
  );

  useEffect(() => {
    composeBridgeRef.current = {
      getDraft: () => draft,
      resetDraft,
      seedReply,
      seedForward,
    };
    return () => {
      composeBridgeRef.current = null;
    };
  }, [draft, resetDraft, seedReply, seedForward]);

  const fieldsValue = useMemo(
    () => ({
      composeTo,
      setComposeTo,
      composeCc,
      setComposeCc,
      composeBcc,
      setComposeBcc,
      composeSubject,
      setComposeSubject,
      composeBody,
      setComposeBody,
      composeAttachments,
      setComposeAttachments,
    }),
    [
      composeTo,
      composeCc,
      composeBcc,
      composeSubject,
      composeBody,
      composeAttachments,
    ],
  );

  const chromeValue = useMemo(
    () => ({
      isComposeOpen,
      setIsComposeOpen,
      isFullCompose,
      setIsFullCompose,
    }),
    [isComposeOpen, isFullCompose],
  );

  return (
    <MailComposeChromeContext.Provider value={chromeValue}>
      <MailComposeFieldsContext.Provider value={fieldsValue}>
        {children}
      </MailComposeFieldsContext.Provider>
    </MailComposeChromeContext.Provider>
  );
}
