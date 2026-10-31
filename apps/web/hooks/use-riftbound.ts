"use client";

import {
  useRiftboundAutoSync,
  useRiftboundForm,
  useRiftboundImportNotifier,
} from "@workspace/calendar-client/use-riftbound";
import type { RiftboundPreferences } from "@workspace/calendar-core/riftbound-settings";
import { calendarApiService as api } from "@/lib/calendar-api-service";
import { webQueryKeys } from "@/lib/query-keys";
import { useSession } from "@/lib/auth-client";

async function hashIdentity(value: string): Promise<string> {
  const bytes = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
function isActive() {
  return document.visibilityState === "visible";
}
function subscribeToResume(run: () => void) {
  document.addEventListener("visibilitychange", run);
  window.addEventListener("focus", run);
  return () => {
    document.removeEventListener("visibilitychange", run);
    window.removeEventListener("focus", run);
  };
}

export function useWebRiftboundForm(
  initial: RiftboundPreferences | undefined,
  saveSettings: (
    value: RiftboundPreferences,
    isCurrent: () => boolean,
  ) => Promise<void>,
) {
  const { data: session } = useSession();
  const onImported = useRiftboundImportNotifier(
    initial,
    webQueryKeys.unifiedSearchCalendarCorpus(),
  );
  return useRiftboundForm({
    scope: session?.user?.id ?? null,
    api,
    initial,
    saveSettings,
    hashIdentity,
    onImported,
  });
}
export function useWebRiftboundAutoSync(preferences?: RiftboundPreferences) {
  const { data: session } = useSession();
  const onImported = useRiftboundImportNotifier(
    preferences,
    webQueryKeys.unifiedSearchCalendarCorpus(),
  );
  useRiftboundAutoSync({
    api,
    preferences,
    scope: session?.user?.id ?? null,
    enabled: !!session?.user,
    isActive,
    subscribeToResume,
    hashIdentity,
    onImported,
  });
}
