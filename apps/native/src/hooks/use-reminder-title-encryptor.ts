import { useCallback } from "react";
import { useE2ee } from "../providers/E2eeProvider";
import type { ReminderTitleEncryptor } from "../lib/event-reminder-notifications";
import { encryptReminderTitle } from "../lib/notification-title-crypto";

/** Encrypts reminder titles under the notification key derived on-device. */
export function useReminderTitleEncryptor(): ReminderTitleEncryptor {
  const { runWithAccountKey } = useE2ee();
  return useCallback(
    (eventId, title) =>
      runWithAccountKey((accountKey) =>
        encryptReminderTitle(accountKey, eventId, title),
      ),
    [runWithAccountKey],
  );
}
