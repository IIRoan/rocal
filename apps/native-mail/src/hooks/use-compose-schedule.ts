import { useState } from "react";
import { formatScheduledSendShortTime } from "@workspace/calendar-core";
import { useUserTimeFormat } from "@workspace/native-core/hooks/use-user-time-format";
import { useUserTimezone } from "@workspace/native-core/hooks/use-user-timezone";

/** A picked send time only arms the composer's Schedule button; nothing is scheduled until the user presses it. */
export function useComposeSchedule() {
  const timezone = useUserTimezone();
  const timeFormat = useUserTimeFormat();
  const [sheet, setSheet] = useState({ open: false, key: 0 });
  const [sendAt, setSendAt] = useState<string | null>(null);

  return {
    sendAt,
    label: sendAt ? formatScheduledSendShortTime(sendAt, timezone, timeFormat) : null,
    open: () => setSheet((current) => ({ open: true, key: current.key + 1 })),
    clear: () => setSendAt(null),
    sheet: {
      key: sheet.key,
      visible: sheet.open,
      onSchedule: setSendAt,
      onDismiss: () => setSheet((current) => ({ ...current, open: false })),
    },
  };
}
