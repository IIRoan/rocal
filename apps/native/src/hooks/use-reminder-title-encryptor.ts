import { useCallback } from "react";
import { useE2ee } from "../providers/E2eeProvider";
import type { ReminderTitleEncryptor } from "../lib/event-reminder-notifications";
import { encryptReminderTitle } from "../lib/notification-title-crypto";

/** Encrypts reminder titles under the notification key derived on-device. */
export function useReminderTitleEncryptor(): ReminderTitleEncryptor {
  const { runWithAccountKey } = useE2ee();
  return useCallback(
    async (eventId, title) => {
      // runWithAccountKey yields null when there is no account key yet. Wrap the
      // result so that case stays distinct from "empty title" (also null): no
      // key means undefined, which leaves the stored ciphertext alone.
      const encrypted = await runWithAccountKey(async (accountKey) => ({
        value: await encryptReminderTitle(accountKey, eventId, title),
      }));
      return encrypted ? encrypted.value : undefined;
    },
    [runWithAccountKey],
  );
}
