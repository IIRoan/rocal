import * as SecureStore from "expo-secure-store";
import { createSessionDataStore } from "@workspace/native-core/lib/session-data-lifecycle";
import { SECURE_STORE_KEYS } from "@workspace/native-core/lib/constants";

const key = SECURE_STORE_KEYS.MAIL_TRUST_ESTABLISHMENT;
const store = createSessionDataStore(() => SecureStore.deleteItemAsync(key));

export async function readMailTrustAnchor(
  accountId: string,
): Promise<string | null> {
  const scope = store.capture(accountId);
  const value = await store.run(scope.isCurrent, () =>
    SecureStore.getItemAsync(key),
  );
  if (value === undefined || !scope.isCurrent())
    throw new Error("Mail encryption session changed.");
  return value;
}
export async function writeMailTrustAnchor(
  accountId: string,
  ciphertext: string,
): Promise<void> {
  const scope = store.capture(accountId);
  const result = await store.run(scope.isCurrent, async () => {
    await SecureStore.setItemAsync(key, ciphertext, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    return true;
  });
  if (!result || !scope.isCurrent())
    throw new Error("Mail encryption session changed.");
}
