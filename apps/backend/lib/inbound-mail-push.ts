import { sanitizeNotificationDisplayTitle } from "./notification-job";
import type {
  MailSyncCollection,
  MailSyncResult,
} from "../services/mail-sync.service";

const SKIP_MAILBOX_ROLES = new Set(["sent", "drafts", "junk", "trash"]);

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

export function listInboundCreatedEmails(
  sync: MailSyncResult,
): InboundMailPushItem[] {
  const mailboxRoleById = new Map(
    sync.mailbox.records.map((mailbox) => [
      mailbox.id,
      mailbox.role?.trim().toLowerCase() ?? null,
    ]),
  );
  const emailById = new Map(
    sync.email.records.map((record) => [record.id, record]),
  );

  return sync.email.created.flatMap((createdId) => {
    const record = emailById.get(createdId);
    if (!record || record.keywords?.$draft === true) {
      return [];
    }

    const roles: Array<string | null> = [];
    for (const [mailboxId, included] of Object.entries(
      record.mailboxIds ?? {},
    )) {
      if (!included) continue;
      roles.push(mailboxRoleById.get(mailboxId) ?? null);
    }

    if (
      roles.length === 0 ||
      roles.every((role) => role !== null && SKIP_MAILBOX_ROLES.has(role))
    ) {
      return [];
    }

    return [
      {
        emailId: createdId,
        subject: sanitizeNotificationDisplayTitle(record.subject),
        fromName: sanitizeNotificationDisplayTitle(record.from?.[0]?.name),
      },
    ];
  });
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
