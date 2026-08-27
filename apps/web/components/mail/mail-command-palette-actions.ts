import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { UnifiedSearchResult } from "@workspace/calendar-core";
import type { UpdateSettingsRequest, UserSettings } from "@/lib/types/calendar";
import type { JmapEmailMessage } from "@/lib/mail/types";
import {
  persistAccountDeletion,
  persistEncryptionPasswordReset,
  persistPasswordChange,
  persistPasswordSet,
  persistProfileUpdate,
  persistSettingsUpdate,
} from "../command-palette/command-palette-actions";
import type { MailPaletteItem } from "./mail-command-palette-items";
import type { MailPaletteView } from "./mail-command-palette-ui-state";

export async function runMailSettingUpdate<K extends keyof UserSettings>(input: {
  localSettings: UserSettings | null;
  saving: boolean;
  key: K;
  value: UserSettings[K];
  setLocalSettings: (next: UserSettings) => void;
  setSaving: (value: boolean) => void;
  updateSettings: (data: UpdateSettingsRequest) => Promise<unknown>;
}): Promise<void> {
  if (!input.localSettings || input.saving) return;

  const previous = input.localSettings;
  const next = { ...input.localSettings, [input.key]: input.value };
  input.setLocalSettings(next);
  input.setSaving(true);
  const result = await persistSettingsUpdate({
    updateSettings: input.updateSettings,
    next,
  });
  if (!result.ok) {
    input.setLocalSettings(previous);
  }
  input.setSaving(false);
}

export async function runMailAccountDeletion(input: {
  queryClient: QueryClient;
  setBusy: (value: boolean) => void;
  onDeleted: () => void;
}): Promise<void> {
  input.setBusy(true);
  const result = await persistAccountDeletion({
    queryClient: input.queryClient,
  });
  if (result.ok) {
    input.onDeleted();
  }
  input.setBusy(false);
}

export async function runMailPasswordChange(input: {
  currentPassword: string;
  newPassword: string;
  setBusy: (value: boolean) => void;
}): Promise<void> {
  input.setBusy(true);
  const result = await persistPasswordChange({
    currentPassword: input.currentPassword,
    newPassword: input.newPassword,
  });
  input.setBusy(false);
  if (result.ok === false) {
    throw result.error;
  }
}

export async function runMailPasswordSet(input: {
  newPassword: string;
  refetchAccounts?: () => Promise<unknown>;
  setBusy: (value: boolean) => void;
}): Promise<void> {
  input.setBusy(true);
  const result = await persistPasswordSet({
    newPassword: input.newPassword,
    refetchAccounts: input.refetchAccounts,
  });
  input.setBusy(false);
  if (result.ok === false) {
    throw result.error;
  }
}

export async function runMailEncryptionPasswordReset(input: {
  sessionUserId: string | null;
  newPassword: string;
  setBusy: (value: boolean) => void;
}): Promise<void> {
  if (!input.sessionUserId) {
    throw new Error("Your session is unavailable. Please try again.");
  }

  input.setBusy(true);
  const result = await persistEncryptionPasswordReset({
    sessionUserId: input.sessionUserId,
    newPassword: input.newPassword,
  });
  input.setBusy(false);
  if (result.ok === false) {
    throw result.error;
  }
}

export async function runMailProfileUpdate(input: {
  imageUrl?: string;
  setBusy: (value: boolean) => void;
  onImageUpdated: (image: string | null) => void;
}): Promise<void> {
  input.setBusy(true);
  const result = await persistProfileUpdate({ imageUrl: input.imageUrl });
  if (result.ok) {
    input.onImageUpdated(result.image);
  }
  input.setBusy(false);
  if (result.ok === false) {
    throw result.error;
  }
}

export function selectMailPaletteItem(input: {
  item: MailPaletteItem;
  onOpenChange: (open: boolean) => void;
  onCompose: () => void;
  goForward: (view: MailPaletteView) => void;
}): void {
  if (input.item.id === "compose") {
    input.onOpenChange(false);
    input.onCompose();
    return;
  }
  input.goForward(input.item.id as MailPaletteView);
}

export function selectUnifiedMailPaletteResult(input: {
  result: UnifiedSearchResult<JmapEmailMessage>;
  onOpenChange: (open: boolean) => void;
  onSelectMessage?: (id: string) => void;
}): void {
  input.onOpenChange(false);
  if (input.result.source === "mail") {
    input.onSelectMessage?.(input.result.messageId);
    return;
  }

  window.location.href = `/calendar?eventId=${encodeURIComponent(
    input.result.eventId,
  )}`;
}

export function handleMailPaletteKeyDown(input: {
  event: ReactKeyboardEvent;
  currentView: MailPaletteView;
  showUnifiedSearch: boolean;
  unifiedResults: UnifiedSearchResult<JmapEmailMessage>[];
  mainListItems: MailPaletteItem[];
  selectedIndex: number;
  onMoveSelection: (delta: number, maxIndex: number) => void;
  onSelectUnified: (result: UnifiedSearchResult<JmapEmailMessage>) => void;
  onSelectItem: (item: MailPaletteItem) => void;
}): void {
  if (input.currentView !== "main") return;

  const unifiedCount = input.showUnifiedSearch
    ? input.unifiedResults.length
    : 0;
  const totalCount = unifiedCount + input.mainListItems.length;

  if (input.event.key === "ArrowDown") {
    input.event.preventDefault();
    input.onMoveSelection(1, Math.max(totalCount - 1, 0));
    return;
  }
  if (input.event.key === "ArrowUp") {
    input.event.preventDefault();
    input.onMoveSelection(-1, Math.max(totalCount - 1, 0));
    return;
  }
  if (input.event.key !== "Enter") return;

  if (input.selectedIndex < unifiedCount) {
    input.event.preventDefault();
    const result = input.unifiedResults[input.selectedIndex];
    if (result) input.onSelectUnified(result);
    return;
  }

  const item = input.mainListItems[input.selectedIndex - unifiedCount];
  if (item) {
    input.event.preventDefault();
    input.onSelectItem(item);
  }
}
