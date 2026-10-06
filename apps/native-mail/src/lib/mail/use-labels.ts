/** Label definitions ({ id, name, color }) live in the encrypted vault; assignments are `keywords/label:<id>`. */
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import * as ExpoCrypto from "expo-crypto";
import {
  MAIL_LABEL_PRESET_COLORS,
} from "@workspace/calendar-core";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import {
  ensureVaultLoaded,
  getVaultLabels,
  isVaultLoaded,
  saveVaultLabels,
} from "./mail-crypto";
import type { MailRuntime } from "./mail-runtime";
import type { LabelDef } from "./types";

/** @deprecated Legacy on-device store — migrated into the vault on first unlock. */
const LEGACY_STORAGE_KEY = "mail_labels_v1";

const NO_LABELS: LabelDef[] = [];

/** Same palette as web, so a label keeps its color whichever client created it. */
export const LABEL_COLOR_OPTIONS = MAIL_LABEL_PRESET_COLORS.map(
  ({ hex, label }) => ({ value: hex, label }),
);

export { getAllMessageLabels, getMessageLabels } from "@workspace/calendar-core";

function isLabelDef(value: unknown): value is LabelDef {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.color === "string"
  );
}

async function loadLegacyLocalLabels(): Promise<LabelDef[]> {
  try {
    const raw = await SecureStore.getItemAsync(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isLabelDef) : [];
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
      // Vault unlock is optional for listing mail — label names may be missing until the user opens an encrypted message or creates a label.
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

/** Label definitions plus CRUD helpers; definitions live in the encrypted vault, assignments in JMAP keywords. */
export function useLabels(options: UseLabelsOptions = {}) {
  const { runtime = null, enabled = true } = options;
  const queryClient = useQueryClient();
  const canLoad = enabled && Boolean(runtime);

  const query = useQuery({
    queryKey: QUERY_KEYS.mailLabels(),
    queryFn: () => {
      if (!runtime) {
        throw new Error("Mail is not ready yet.");
      }
      return loadLabelsFromVault(runtime);
    },
    enabled: canLoad,
    staleTime: Infinity,
    retry: false,
  });

  const labels = query.data ?? NO_LABELS;

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
      // A failed refresh leaves the previously loaded labels in place.
      void query.refetch().catch(() => undefined);
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
