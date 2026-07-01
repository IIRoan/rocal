import type { ComposeDraft, DraftSaveStatus, MailComposeBridge } from "./mail-compose-types";

export type ComposeDraftSaver = {
  save: () => Promise<string | null>;
  flush: () => Promise<string | null>;
  cancelPending: () => void;
};

export type ComposeCloseActions = {
  dismiss: () => void;
  discardDraft?: (draftId: string) => void;
};

export const composeBridgeRef: { current: MailComposeBridge | null } = {
  current: null,
};

const composeDraftSaveRef: {
  current: ComposeDraftSaver | null;
} = { current: null };

const composeCloseActionsRef: { current: ComposeCloseActions | null } = {
  current: null,
};

export function getMailComposeBridge(): MailComposeBridge | null {
  return composeBridgeRef.current;
}

export function registerComposeDraftSaver(saver: ComposeDraftSaver | null) {
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

export function registerComposeCloseActions(
  actions: ComposeCloseActions | null,
): void {
  composeCloseActionsRef.current = actions;
}

export function getComposeCloseActionsRef() {
  return composeCloseActionsRef;
}

export type { ComposeDraft, DraftSaveStatus, MailComposeBridge };
