import { sanitizeNotificationDisplayTitle } from "./notification-job";
import type {
  MailSyncCollection,
  MailSyncResult,
} from "../services/mail-sync.service";

export type InboundMailPushItem = {
  emailId: string;
  subject: string | null;
  fromName: string | null;
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
  const byId = new Map<string, InboundMailPushItem>();
  for (const group of groups) {
    for (const item of group) {
      const emailId = item.emailId.trim();
      if (!emailId) continue;
      const existing = byId.get(emailId);
      if (!existing) {
        byId.set(emailId, { ...item, emailId });
        continue;
      }
      byId.set(emailId, {
        emailId,
        subject: existing.subject ?? item.subject,
        fromName: existing.fromName ?? item.fromName,
      });
    }
  }
  return [...byId.values()];
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

export function isEmailAddressForPush(
  value: string | null | undefined,
): boolean {
  const trimmed = value?.trim();
  return Boolean(
    trimmed && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed),
  );
}

export function mergeInboundMailPushMetadata(
  item: InboundMailPushItem,
  metadata: InboundMailPushItem,
): InboundMailPushItem {
  const fromName = isEmailAddressForPush(item.fromName)
    ? (metadata.fromName ?? item.fromName)
    : (item.fromName ?? metadata.fromName);

  return {
    emailId: metadata.emailId,
    subject: item.subject ?? metadata.subject,
    fromName,
  };
}

export function inboundPushItemFromEmailRecord(record: {
  id: string;
  subject?: string | null;
  from?: Array<{ email: string; name?: string | null }>;
}): InboundMailPushItem {
  return {
    emailId: record.id,
    subject: sanitizeNotificationDisplayTitle(record.subject),
    fromName:
      sanitizeNotificationDisplayTitle(record.from?.[0]?.name) ??
      sanitizeNotificationDisplayTitle(record.from?.[0]?.email),
  };
}
