import { AppState } from "react-native";
import * as Crypto from "expo-crypto";
import {
  useRiftboundAutoSync,
  useRiftboundForm,
  useRiftboundImportNotifier,
} from "@workspace/calendar-client/use-riftbound";
import type { RiftboundPreferences } from "@workspace/calendar-core/riftbound-settings";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { calendarApiService as api } from "@workspace/native-core/lib/api";
import { useAuth } from "@workspace/native-core/providers/AuthProvider";
import { useE2ee } from "@workspace/native-core/providers/E2eeProvider";

function hashIdentity(value: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}
function isActive() {
  return AppState.currentState === "active";
}
function subscribeToResume(run: () => void) {
  const subscription = AppState.addEventListener("change", (state) => {
    if (state === "active") run();
  });
  return () => subscription.remove();
}
export function useNativeRiftboundForm(
  initial: RiftboundPreferences | undefined,
  saveSettings: (
    value: RiftboundPreferences,
    isCurrent: () => boolean,
  ) => Promise<void>,
) {
  const { user } = useAuth();
  const onImported = useRiftboundImportNotifier(
    initial,
    QUERY_KEYS.paletteEventCorpus(),
  );
  return useRiftboundForm({
    scope: user?.id ?? null,
    api,
    initial,
    saveSettings,
    hashIdentity,
    onImported,
  });
}
export function useNativeRiftboundAutoSync(preferences?: RiftboundPreferences) {
  const { user, isAuthenticated } = useAuth();
  const { isReady } = useE2ee();
  const onImported = useRiftboundImportNotifier(
    preferences,
    QUERY_KEYS.paletteEventCorpus(),
  );
  useRiftboundAutoSync({
    api,
    preferences,
    scope: user?.id ?? null,
    enabled: isAuthenticated && isReady,
    isActive,
    subscribeToResume,
    hashIdentity,
    onImported,
  });
}
