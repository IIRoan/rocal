import type { MailServerLimits } from "@workspace/calendar-core";
import type {
  JmapEmailMessage,
  JmapIdentity,
  JmapMailbox,
  LabelDef,
  MailAttachment,
  MailSignatureVerificationState,
} from "@/lib/mail/types";

export interface MessageReaderLoadingState {
  conversation?: boolean;
  messageBody?: boolean;
  decrypting?: boolean;
}

export interface MessageReaderNavigationState {
  hasPrev?: boolean;
  hasNext?: boolean;
}

export interface MessageReaderProps {
  message: JmapEmailMessage | null;
  selectedMessageId?: string | null;
  conversationMessages?: JmapEmailMessage[];
  loading?: MessageReaderLoadingState;
  onSelectConversationMessage?: (id: string) => void;
  plaintext: string | null;
  decryptedHtml: string | null;
  attachments?: MailAttachment[];
  signatureVerificationState: MailSignatureVerificationState;
  decryptError: string | null;
  accountEncryptedAtRest: boolean;
  isBusy: boolean;
  mailboxes: JmapMailbox[];
  currentMailboxId: string | null;
  labels?: LabelDef[];
  onReply: () => void;
  onForward: () => void;
  onDelete: () => void;
  onMove: (targetMailboxId: string) => void;
  onMarkAsUnread: () => void;
  onToggleFlagged?: () => void;
  onSetLabel?: (labelId: string, assigned: boolean) => void;
  onCreateLabel?: (name: string, color: string) => Promise<LabelDef | null>;
  onUpdateLabel?: (
    labelId: string,
    updates: { name: string; color: string },
  ) => Promise<void> | void;
  onDeleteLabel?: (labelId: string) => void;
  timeFormat?: "12h" | "24h";
  timezone?: string;
  onClose?: () => void;
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
  navigation?: MessageReaderNavigationState;
  onArchive?: () => void;
  onSendReply?: (text: string, files: File[]) => Promise<void>;
  onLoadAttachmentPreview?: (attachment: MailAttachment) => Promise<
    | {
        kind: "image" | "pdf";
        url: string;
        type: string;
      }
    | {
        kind: "text";
        text: string;
        type: string;
      }
    | null
  >;
  onPreviewAttachment?: (attachment: MailAttachment) => void;
  onDownloadAttachment?: (attachment: MailAttachment) => void;
  onUntrash?: () => void;
  onReportSpam?: () => void;
  onNotSpam?: () => void;
  onConversationMessageDelete?: (id: string) => void;
  onConversationMessageMarkUnread?: (id: string) => void;
  onConversationMessageMove?: (id: string, mailboxId: string) => void;
  accountEmail?: string;
  accountName?: string | null;
  identities?: JmapIdentity[];
  mailServerLimits?: MailServerLimits;
}
