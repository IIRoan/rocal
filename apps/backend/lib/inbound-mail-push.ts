import type {
  MailSyncCollection,
  MailSyncResult,
} from "../services/mail-sync.service";

/** Opaque ref only; sender/subject are fetched on-device by the iOS NSE. */
export type InboundMailPushItem = {
  emailId: string;
};

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function uniqueRecords<T extends { id: string }>(records: T[]): T[] {
  const byId = new Map<string, T>();
  for (const record of records) {
    byId.set(record.id, record);
  }
  return [...byId.values()];
}

function mergeCollection<T extends { id: string }>(
  pending: MailSyncCollection<T>,
  next: MailSyncCollection<T>,
): MailSyncCollection<T> {
  return {
    ...next,
    created: uniqueStrings([...pending.created, ...next.created]),
    updated: uniqueStrings([...pending.updated, ...next.updated]),
    destroyed: uniqueStrings([...pending.destroyed, ...next.destroyed]),
    records: uniqueRecords([...pending.records, ...next.records]),
  };
}

export function mergeInboundMailPushItems(
  ...groups: InboundMailPushItem[][]
): InboundMailPushItem[] {
  const ids = new Set<string>();
  for (const group of groups) {
    for (const item of group) {
      const emailId = item.emailId.trim();
      if (emailId) ids.add(emailId);
    }
  }
  return [...ids].map((emailId) => ({ emailId }));
}

export function coalescePendingMailSync(
  pending: MailSyncResult | undefined,
  next: MailSyncResult | undefined,
): MailSyncResult | undefined {
  if (!next) {
    return pending;
  }
  if (!pending) {
    return next;
  }

  return {
    ...next,
    changedTypes: uniqueStrings([
      ...pending.changedTypes,
      ...next.changedTypes,
    ]),
    email: mergeCollection(pending.email, next.email),
    mailbox: mergeCollection(pending.mailbox, next.mailbox),
    thread: mergeCollection(pending.thread, next.thread),
    calendarImport: {
      messagesScanned:
        pending.calendarImport.messagesScanned +
        next.calendarImport.messagesScanned,
      icsPartsFound:
        pending.calendarImport.icsPartsFound + next.calendarImport.icsPartsFound,
      eventsCreated:
        pending.calendarImport.eventsCreated + next.calendarImport.eventsCreated,
      eventsUpdated:
        pending.calendarImport.eventsUpdated + next.calendarImport.eventsUpdated,
      eventsDeleted:
        pending.calendarImport.eventsDeleted + next.calendarImport.eventsDeleted,
      errors: uniqueStrings([
        ...pending.calendarImport.errors,
        ...next.calendarImport.errors,
      ]),
    },
  };
}
