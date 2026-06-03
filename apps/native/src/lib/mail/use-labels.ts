/**
 * Labels for mail messages on native.
 *
 * Label definitions ({ id, name, color }) live in the encrypted mail vault
 * (same store as the web client). Label *assignments* are stored on the server
 * as `keywords/label:<id>` on each email.
 */
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import * as ExpoCrypto from "expo-crypto";
import { QUERY_KEYS } from "../query-keys";
import {
  ensureVaultLoaded,
  getVaultLabels,
  isVaultLoaded,
  saveVaultLabels,
} from "./mail-crypto";
import type { MailRuntime } from "./mail-runtime";
import type { LabelDef, JmapEmailMessage } from "./types";

/** @deprecated Legacy on-device store — migrated into the vault on first unlock. */
const LEGACY_STORAGE_KEY = "mail_labels_v1";

/** Color palette available when creating a new label. */
export const LABEL_COLOR_OPTIONS = [
  { value: "#ef4444", label: "Red" },
  { value: "#f97316", label: "Orange" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#22c55e", label: "Green" },
  { value: "#14b8a6", label: "Teal" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#6366f1", label: "Indigo" },
  { value: "#a855f7", label: "Purple" },
  { value: "#ec4899", label: "Pink" },
];

/** Resolve label definitions for keywords present on a message. */
export function getMessageLabels(
  message: JmapEmailMessage,
  labels: LabelDef[],
): LabelDef[] {
  if (!message.keywords) return [];
  const result: LabelDef[] = [];
  for (const label of labels) {
    if (message.keywords[`label:${label.id}`] === true) {
      result.push(label);
    }
  }
  return result;
}

/**
 * Also detect keywords with `label:` prefix that belong to labels
 * not yet known locally (e.g. created on web). Returns a "ghost"
 * label with the keyword-derived id so the badge is still visible.
 */
export function getAllMessageLabels(
  message: JmapEmailMessage,
  knownLabels: LabelDef[],
): LabelDef[] {
  if (!message.keywords) return [];
  const known = getMessageLabels(message, knownLabels);
  const knownIds = new Set(known.map((l) => l.id));

  for (const key of Object.keys(message.keywords)) {
    if (!key.startsWith("label:")) continue;
    const id = key.slice(6);
    if (knownIds.has(id)) continue;
    known.push({ id, name: id, color: "#6b7280" });
  }

  return known;
}

async function loadLegacyLocalLabels(): Promise<LabelDef[]> {
  try {
    const raw = await SecureStore.getItemAsync(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LabelDef[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function clearLegacyLocalLabels(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(LEGACY_STORAGE_KEY);
  } catch {
    // Non-fatal
  }
}

function mergeLabelsById(...groups: LabelDef[][]): LabelDef[] {
  const byId = new Map<string, LabelDef>();
  for (const group of groups) {
    for (const label of group) {
      byId.set(label.id, label);
    }
  }
  return Array.from(byId.values());
}

async function migrateLegacyLabelsIntoVault(
  runtime: MailRuntime,
  vaultLabels: LabelDef[],
): Promise<LabelDef[]> {
  const legacy = await loadLegacyLocalLabels();
  if (legacy.length === 0) return vaultLabels;

  const merged = mergeLabelsById(vaultLabels, legacy);
  if (merged.length !== vaultLabels.length) {
    await saveVaultLabels(merged);
  }
  await clearLegacyLocalLabels();
  return merged;
}

async function loadLabelsFromVault(runtime: MailRuntime): Promise<LabelDef[]> {
  if (!isVaultLoaded()) {
    try {
      await ensureVaultLoaded(runtime);
    } catch {
      // Vault unlock is optional for listing mail — label names may be missing
      // until the user opens an encrypted message or creates a label.
      return [];
    }
  }

  const vaultLabels = getVaultLabels();
  return migrateLegacyLabelsIntoVault(runtime, vaultLabels);
}

type UseLabelsOptions = {
  runtime?: MailRuntime | null;
  /** When false, skips vault access (e.g. mailbox not provisioned yet). */
  enabled?: boolean;
};

/**
 * Hook that provides label definitions + CRUD helpers.
 * Labels are stored in the encrypted vault (shared with web) and synced via
 * the server vault backup. Assignments use `keywords/label:<id>` on messages.
 */
export function useLabels(options: UseLabelsOptions = {}) {
  const { runtime = null, enabled = true } = options;
  const queryClient = useQueryClient();
  const canLoad = enabled && Boolean(runtime);

  const query = useQuery({
    queryKey: QUERY_KEYS.mailLabels(),
    queryFn: () => loadLabelsFromVault(runtime!),
    enabled: canLoad,
    staleTime: Infinity,
    retry: false,
  });

  const labels = query.data ?? [];

  const persistLabels = useCallback(
    async (updated: LabelDef[]) => {
      if (!runtime) {
        throw new Error("Mail is not ready yet.");
      }
      await ensureVaultLoaded(runtime);
      await saveVaultLabels(updated);
      queryClient.setQueryData(QUERY_KEYS.mailLabels(), updated);
    },
    [queryClient, runtime],
  );

  const createLabel = useCallback(
    async (name: string, color: string): Promise<LabelDef> => {
      const newLabel: LabelDef = {
        id: ExpoCrypto.randomUUID(),
        name,
        color,
      };
      const updated = [...labels, newLabel];
      await persistLabels(updated);
      return newLabel;
    },
    [labels, persistLabels],
  );

  const deleteLabel = useCallback(
    async (labelId: string): Promise<void> => {
      const updated = labels.filter((l) => l.id !== labelId);
      await persistLabels(updated);
    },
    [labels, persistLabels],
  );

  const refreshLabels = useCallback(() => {
    if (canLoad) {
      void query.refetch();
    }
  }, [canLoad, query]);

  return {
    labels,
    loaded: query.isSuccess,
    createLabel,
    deleteLabel,
    refreshLabels,
  };
}
