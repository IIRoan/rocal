import { useCallback } from "react";
import { useE2ee } from "../providers/E2eeProvider";
import type { ReminderTitleEncryptor } from "../lib/event-reminder-notifications";
import { encryptReminderTitle } from "../lib/notification-title-crypto";

/** Encrypts reminder titles under the notification key derived on-device. */
export function useReminderTitleEncryptor(): ReminderTitleEncryptor {
  const { runWithAccountKey } = useE2ee();
  return useCallback(
    async (eventId, title) => {
      // Wrapped so "no account key" (undefined, leaves the stored title alone) stays distinct from empty title.
      const encrypted = await runWithAccountKey(async (accountKey) => ({
        value: await encryptReminderTitle(accountKey, eventId, title),
      }));
      return encrypted ? encrypted.value : undefined;
    },
    [runWithAccountKey],
  );
}
