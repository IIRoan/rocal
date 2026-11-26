"use client";

import { createContext } from "react";
import type { MailServerLimits } from "@workspace/calendar-core";
import type { QuotedInlineAttachment } from "@/lib/mail/compose-editor-utils";
import type { JmapEmailMessage } from "@/lib/mail/types";
import type { ComposeMode, DraftSaveStatus } from "./mail-compose-types";

export type MailComposeFieldsContextValue = {
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
  setComposeHtmlBody: React.Dispatch<React.SetStateAction<string>>;
  plainTextMode: boolean;
  setPlainTextMode: (plainTextMode: boolean) => void;
  composeAttachments: File[];
  setComposeAttachments: React.Dispatch<React.SetStateAction<File[]>>;
  mailServerLimits: MailServerLimits;
  selectedIdentityId: string | null;
  setSelectedIdentityId: (id: string | null) => void;
  signatureChoice: string | null | undefined;
  setSignatureChoice: (choice: string | null | undefined) => void;
  draftSaveStatus: DraftSaveStatus;
  setDraftSaveStatus: (status: DraftSaveStatus) => void;
  composeDraftId: string | null;
  clearCompose: () => void;
  composeMode: ComposeMode;
  composeReplySource: JmapEmailMessage | null;
  quotedAttachments: QuotedInlineAttachment[];
  openNewCompose: () => void;
  composeSessionId: number;
  requestComposeClose: (afterClose?: () => void) => boolean;
};

export type MailComposeChromeContextValue = {
  isComposeOpen: boolean;
  setIsComposeOpen: (open: boolean) => void;
  isFullCompose: boolean;
  setIsFullCompose: (open: boolean) => void;
  /** The docked compose window is folded to its title bar. */
  isComposeMinimized: boolean;
  setIsComposeMinimized: (minimized: boolean) => void;
  dismissCompose: () => void;
};

export const MailComposeFieldsContext = createContext<
  MailComposeFieldsContextValue | undefined
>(undefined);

export const MailComposeChromeContext = createContext<
  MailComposeChromeContextValue | undefined
>(undefined);
