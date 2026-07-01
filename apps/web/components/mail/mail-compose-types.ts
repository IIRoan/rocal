import type { JmapEmailMessage } from "@/lib/mail/types";

export type ComposeMode = "new" | "reply" | "forward" | "draft";

export type MailReplyContext = {
  threadId: string | null;
  inReplyTo?: string[];
  references?: string[];
};

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
