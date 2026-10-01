import { LockOpen, ShieldAlert, ShieldCheck } from "lucide-react";
import {
  getCalendarEncryptionNotice,
  type CalendarEncryptionKind,
  type EncryptableCalendarItem,
} from "@workspace/calendar-core";

export {
  resolveEncryptionState,
  type CalendarEncryptionKind,
  type EncryptableCalendarItem,
  type EncryptionDisplayState,
} from "@workspace/calendar-core";

export function getEncryptionStatusMeta(
  item: EncryptableCalendarItem,
  kind: CalendarEncryptionKind = "event",
) {
  const notice = getCalendarEncryptionNotice(item, kind);
  return {
    ...notice,
    Icon:
      notice.state === "encrypted"
        ? ShieldCheck
        : notice.state === "pending"
          ? ShieldAlert
          : LockOpen,
    iconClassName:
      notice.state === "encrypted" ? "text-primary" : "text-muted-foreground",
  };
}
