import type { JmapEmailMessage as Message, MailAttachment } from "@workspace/calendar-core";

export type {
  JmapBodyPartRef,
  JmapBodyStructure,
  JmapBodyValue,
  JmapEmailChanges,
  JmapIdentity,
  JmapMailbox,
  JmapSession,
  MailAccountStatus,
  MailAddress,
  MailAttachment as JmapAttachment,
  MailAttachmentContent,
  MailBootstrapRequest,
  MailDemoConfig,
  MailOAuthConfig,
  MailSignup as MailSignupResponse,
  MailVaultKdfParams,
  MessageEncryptionState,
} from "@workspace/calendar-core";

export type JmapEmailMessage = Message<MailAttachment>;

/** Keys stay unique across a thread because decrypted attachments have no blob id. */
export type KeyedAttachment = { key: string; attachment: MailAttachment };

export type JmapEmailPlacement = Pick<
  JmapEmailMessage,
  "id" | "mailboxIds" | "keywords"
>;

export type LabelDef = {
  id: string;
  name: string;
  color: string;
};
