/**
 * Labels for mail messages on native.
 *
 * Label definitions ({ id, name, color }) are persisted locally in
 * expo-secure-store so they survive app restarts.  Label *assignments*
 * live on the server as `keywords/label:<id>` on each email, so they
 * are always in sync with whatever the web client sets.
 *
 * Users create their own labels with a name and color. The default state
 * is an empty list — the web app's labels (stored in the encrypted vault)
 * are not accessible from native since it cannot decrypt the vault.
 */
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import { QUERY_KEYS } from "../query-keys";
import type { LabelDef, JmapEmailMessage } from "./types";

const STORAGE_KEY = "mail_labels_v1";

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
    const id = key.slice(6); // strip "label:"
    if (knownIds.has(id)) continue;
    known.push({ id, name: id, color: "#6b7280" });
  }

  return known;
}

async function loadLabels(): Promise<LabelDef[]> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LabelDef[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveLabels(labels: LabelDef[]): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(labels));
}

/**
 * Hook that provides label definitions + CRUD helpers.
 * Labels start empty — the user creates them with a name and color.
 * They are stored locally on-device and synced with the server
 * via `keywords/label:<id>` on each message.
 *
 * Uses React Query so every consumer shares the same cache and
 * sees updates immediately after creation or deletion.
 */
export function useLabels() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEYS.mailLabels(),
    queryFn: loadLabels,
    staleTime: Infinity,
  });

  const labels = query.data ?? [];

  const createLabel = useCallback(
    async (name: string, color: string): Promise<LabelDef> => {
      const id = `label-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const newLabel: LabelDef = { id, name, color };
      const updated = [...labels, newLabel];
      await saveLabels(updated);
      queryClient.setQueryData(QUERY_KEYS.mailLabels(), updated);
      return newLabel;
    },
    [labels, queryClient],
  );

  const deleteLabel = useCallback(
    async (labelId: string): Promise<void> => {
      const updated = labels.filter((l) => l.id !== labelId);
      await saveLabels(updated);
      queryClient.setQueryData(QUERY_KEYS.mailLabels(), updated);
    },
    [labels, queryClient],
  );

  return { labels, loaded: query.isSuccess, createLabel, deleteLabel };
}
