import type { MailAuthResultsFields } from "./mail-auth-results";
import type { MailSimpleLoginFields } from "./mail-simplelogin";
import type { MailUnsubscribeFields } from "./mail-unsubscribe";

export type JmapSession = {
  accounts: Record<string, { name?: string }>;
  primaryAccounts: Record<string, string>;
  apiUrl: string;
  downloadUrl?: string;
  uploadUrl?: string;
  eventSourceUrl?: string;
  username?: string;
  capabilities?: Record<string, unknown>;
};

export type JmapMailbox = {
  id: string;
  name: string;
  role?: string | null;
  parentId?: string | null;
  sortOrder?: number;
};

export type JmapIdentity = {
  id: string;
  email: string;
  name?: string | null;
  textSignature?: string | null;
  htmlSignature?: string | null;
};

export type JmapEmailChanges = {
  oldState: string;
  newState: string;
  hasMoreChanges?: boolean;
  created: string[];
  updated: string[];
  destroyed: string[];
};

export type JmapBodyPartRef = {
  partId?: string;
  type?: string;
};

export type JmapBodyValue = {
  value?: string;
  isTruncated?: boolean;
};

export type JmapBodyStructure = {
  type?: string;
  blobId?: string;
  name?: string;
  subParts?: JmapBodyStructure[];
};

export type JmapMessageBody = {
  bodyStructure?: JmapBodyStructure;
  bodyValues?: Record<string, JmapBodyValue>;
  textBody?: JmapBodyPartRef[];
  htmlBody?: JmapBodyPartRef[];
};

export type MailAddress = {
  email: string;
  name?: string | null;
};

export type MailAttachmentContent = ArrayBuffer | Uint8Array | string;

export type MailAttachment = {
  blobId?: string | null;
  name?: string | null;
  type?: string | null;
  size?: number | null;
  disposition?: string | null;
  cid?: string | null;
  content?: MailAttachmentContent | null;
};

export type JmapAttachment = Omit<MailAttachment, "content">;

export type JmapEmailMessage<
  Attachment extends JmapAttachment = JmapAttachment,
> = JmapMessageBody &
  MailSimpleLoginFields &
  MailUnsubscribeFields &
  MailAuthResultsFields & {
    id: string;
    threadId?: string;
    messageId?: string[];
    inReplyTo?: string[];
    references?: string[];
    mailboxIds?: Record<string, boolean>;
    subject?: string | null;
    from?: MailAddress[];
    to?: MailAddress[];
    cc?: MailAddress[];
    bcc?: MailAddress[];
    receivedAt?: string;
    keywords?: Record<string, boolean>;
    preview?: string | null;
    hasAttachment?: boolean;
    size?: number;
    attachments?: Attachment[];
    /** JMAP header:* property — Received header values */
    "header:Received"?: string[] | null;
    /** JMAP header:* property — DKIM-Signature header values */
    "header:DKIM-Signature"?: string[] | null;
  };
