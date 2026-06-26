"use client";

import { use } from "react";
import {
  MailComposeChromeContext,
  MailComposeClosePromptContext,
  MailComposeFieldsContext,
} from "./mail-compose-contexts";

export type {
  ComposeMode,
  ComposeDraft,
  DraftSaveStatus,
  MailComposeBridge,
} from "./mail-compose-types";

export type {
  ComposeDraftSaver,
  ComposeCloseActions,
} from "./mail-compose-bridge";

export { MailComposeProvider } from "./mail-compose-provider";

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
