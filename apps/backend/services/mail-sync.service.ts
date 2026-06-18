import { createLogger } from "@workspace/logger";
import type { PrismaClient } from "../generated/prisma/index.js";
import { ForbiddenError, ValidationError } from "../lib/errors";
import { errorLogDetails } from "../lib/log-sanitization";
import type {
  StalwartJmapAdminClientLike,
  StalwartJmapEnvelope,
  StalwartJmapMethodCall,
} from "../lib/stalwart-admin";
import {
  createEmptyMailCalendarImportSummary,
  MailCalendarIngestionService,
  type MailCalendarImportSummary,
  type MailCalendarIngestionEmail,
} from "./mail-calendar-ingestion.service";

const logger = createLogger("backend:mail-sync");

const CORE_MAIL_CAPABILITIES = [
  "urn:ietf:params:jmap:core",
  "urn:ietf:params:jmap:mail",
] as const;
const MAIL_SYNC_CACHE_TTL_MS = 60_000;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

type JmapMailbox = {
  id: string;
  name: string;
  role?: string | null;
  parentId?: string | null;
  sortOrder?: number;
};

type JmapEmail = {
  id: string;
  threadId?: string;
  mailboxIds?: Record<string, boolean>;
  from?: Array<{ email: string; name?: string | null }>;
  to?: Array<{ email: string; name?: string | null }>;
  cc?: Array<{ email: string; name?: string | null }>;
  bcc?: Array<{ email: string; name?: string | null }>;
  subject?: string | null;
  receivedAt?: string;
  keywords?: Record<string, boolean>;
  bodyStructure?: MailCalendarIngestionEmail["bodyStructure"];
  bodyValues?: MailCalendarIngestionEmail["bodyValues"];
  textBody?: Array<{ partId?: string }>;
  htmlBody?: Array<{ partId?: string }>;
  attachments?: Array<{ name?: string | null; type?: string | null }>;
};

export type MailSyncThreadRecord = {
  id: string;
  emailIds: string[];
};

type JmapGetResponse<T> = {
  state: string;
  list?: T[];
  notFound?: string[];
};

type JmapChangesResponse = {
  oldState: string;
  newState: string;
  hasMoreChanges: boolean;
  created?: string[];
  updated?: string[];
  destroyed?: string[];
};

type JmapQueryResponse = {
  ids?: string[];
};

export type MailSyncCollection<T> = {
  oldState: string | null;
  newState: string;
  created: string[];
  updated: string[];
  destroyed: string[];
  records: T[];
};

export type MailSyncResult = {
  accountId: string;
  initialized: boolean;
  changedTypes: string[];
  email: MailSyncCollection<JmapEmail>;
  mailbox: MailSyncCollection<JmapMailbox>;
  thread: MailSyncCollection<MailSyncThreadRecord>;
  calendarImport: MailCalendarImportSummary;
};

export type MailReceiptSyncResult = {
  accountId: string;
  userId: string;
  changedTypes: string[];
  sync: MailSyncResult;
};

type AuthorizedDirectoryEntry = {
  id: string;
  stalwartAccountId: string;
};

type MailSyncStateRecord = {
  id: string;
  directoryEntryId: string;
  stalwartAccountId: string;
  emailState: string;
  mailboxState: string;
  threadState: string | null;
};

const mailSyncStateSelect = {
  id: true,
  directoryEntryId: true,
  stalwartAccountId: true,
  emailState: true,
  mailboxState: true,
  threadState: true,
} as const;

function uniqueIds(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function sortEmailsDescending<T extends { receivedAt?: string }>(
  records: T[],
): T[] {
  return [...records].sort((left, right) => {
    const leftTime = left.receivedAt ? Date.parse(left.receivedAt) : 0;
    const rightTime = right.receivedAt ? Date.parse(right.receivedAt) : 0;
    return rightTime - leftTime;
  });
}

function collectionResult<T>(input: {
  oldState: string | null;
  newState: string;
  created?: string[];
  updated?: string[];
  destroyed?: string[];
  records?: T[];
}): MailSyncCollection<T> {
  return {
    oldState: input.oldState,
    newState: input.newState,
    created: uniqueIds(input.created ?? []),
    updated: uniqueIds(input.updated ?? []),
    destroyed: uniqueIds(input.destroyed ?? []),
    records: input.records ?? [],
  };
}

export class MailSyncService {
  private readonly authorizedDirectoryEntryCache = new Map<
    string,
    CacheEntry<AuthorizedDirectoryEntry>
  >();
  private readonly syncStateCache = new Map<
    string,
    CacheEntry<MailSyncStateRecord | null>
  >();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly jmapAdminClient: StalwartJmapAdminClientLike,
    private readonly mailCalendarIngestion: MailCalendarIngestionService = new MailCalendarIngestionService(
      prisma,
    ),
  ) {}

  private readCached<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
  ): T | undefined {
    const cached = cache.get(key);

    if (!cached) {
      return undefined;
    }

    if (cached.expiresAt <= Date.now()) {
      cache.delete(key);
      return undefined;
    }

    return cached.value;
  }

  private writeCached<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
    value: T,
  ): T {
    cache.set(key, {
      value,
      expiresAt: Date.now() + MAIL_SYNC_CACHE_TTL_MS,
    });

    return value;
  }

  private getAuthorizedDirectoryEntryCacheKey(
    userId: string,
    accountId: string,
  ): string {
    return `${userId}:${accountId}`;
  }

  private cacheAuthorizedDirectoryEntry(
    userId: string,
    entry: AuthorizedDirectoryEntry,
  ): AuthorizedDirectoryEntry {
    return this.writeCached(
      this.authorizedDirectoryEntryCache,
      this.getAuthorizedDirectoryEntryCacheKey(userId, entry.stalwartAccountId),
      entry,
    );
  }

  private async getSyncState(
    directoryEntryId: string,
  ): Promise<MailSyncStateRecord | null> {
    const cached = this.readCached(this.syncStateCache, directoryEntryId);

    if (cached !== undefined) {
      return cached;
    }

    const syncState = await this.prisma.mailJmapSyncState.findUnique({
      where: { directoryEntryId },
      select: mailSyncStateSelect,
    });

    return this.writeCached(this.syncStateCache, directoryEntryId, syncState);
  }

  private cacheSyncState(state: MailSyncStateRecord | null): void {
    if (!state) {
      return;
    }

    this.writeCached(this.syncStateCache, state.directoryEntryId, state);
  }

  /**
   * Lightweight check for new JMAP state without advancing stored state or fetching records.
   * The stored state is intentionally NOT updated here — only syncForUser advances it.
   */
  async detectChanges(input: {
    userId: string;
    accountId: string;
  }): Promise<{ hasChanges: boolean; changedTypes: string[] }> {
    const accountId = input.accountId.trim();
    if (!accountId) {
      return { hasChanges: false, changedTypes: [] };
    }

    const directoryEntry = await this.getAuthorizedDirectoryEntry(
      input.userId,
      accountId,
    );
    const syncState = await this.getSyncState(directoryEntry.id);

    if (!syncState) {
      return { hasChanges: true, changedTypes: ["Email", "Mailbox"] };
    }

    const [emailChanged, mailboxChanged] = await Promise.all([
      this.quickChangesCheck("Email", accountId, syncState.emailState).catch(
        (error) => {
          logger.debug("JMAP Email/changes check failed", {
            accountId,
            ...errorLogDetails(error),
          });
          return false;
        },
      ),
      this.quickChangesCheck(
        "Mailbox",
        accountId,
        syncState.mailboxState,
      ).catch((error) => {
        logger.debug("JMAP Mailbox/changes check failed", {
          accountId,
          ...errorLogDetails(error),
        });
        return false;
      }),
    ]);

    const changedTypes = [
      ...(emailChanged ? ["Email"] : []),
      ...(mailboxChanged ? ["Mailbox"] : []),
    ];

    return { hasChanges: changedTypes.length > 0, changedTypes };
  }

  private async quickChangesCheck(
    typeName: "Email" | "Mailbox",
    accountId: string,
    sinceState: string,
  ): Promise<boolean> {
    const response = await this.callMethod<JmapChangesResponse>(
      `${typeName}/changes`,
      {
        accountId,
        sinceState,
        maxChanges: 1,
      },
    );

    return (
      response.hasMoreChanges ||
      (response.created?.length ?? 0) > 0 ||
      (response.updated?.length ?? 0) > 0 ||
      (response.destroyed?.length ?? 0) > 0
    );
  }

  async listAuthorizedAccountIdsForUser(userId: string): Promise<string[]> {
    const entry = await this.prisma.mailDirectoryEntry.findUnique({
      where: { userId },
      select: {
        id: true,
        stalwartAccountId: true,
      },
    });

    if (!entry) {
      return [];
    }

    this.cacheAuthorizedDirectoryEntry(userId, entry);
    return [entry.stalwartAccountId];
  }

  async syncKnownChangedAccounts(): Promise<MailReceiptSyncResult[]> {
    const entries = await this.prisma.mailDirectoryEntry.findMany({
      where: {
        userId: {
          not: null,
        },
      },
      select: {
        id: true,
        userId: true,
        stalwartAccountId: true,
      },
    });
    const results: MailReceiptSyncResult[] = [];

    for (const entry of entries) {
      if (!entry.userId) {
        continue;
      }

      try {
        this.cacheAuthorizedDirectoryEntry(entry.userId, entry);
        const { hasChanges, changedTypes } = await this.detectChanges({
          userId: entry.userId,
          accountId: entry.stalwartAccountId,
        });

        if (!hasChanges) {
          continue;
        }

        const sync = await this.syncForUser({
          userId: entry.userId,
          accountId: entry.stalwartAccountId,
        });

        results.push({
          accountId: entry.stalwartAccountId,
          userId: entry.userId,
          changedTypes: sync.changedTypes.length
            ? sync.changedTypes
            : changedTypes,
          sync,
        });
      } catch (error) {
        logger.warn("Receipt-time mail sync failed", {
          accountId: entry.stalwartAccountId,
          userId: entry.userId,
          ...errorLogDetails(error),
        });
      }
    }

    return results;
  }

  async syncForUser(input: {
    userId: string;
    accountId: string;
  }): Promise<MailSyncResult> {
    const accountId = input.accountId.trim();

    if (!accountId) {
      throw new ValidationError("A mail accountId is required.", "accountId");
    }

    const directoryEntry = await this.getAuthorizedDirectoryEntry(
      input.userId,
      accountId,
    );
    const existingState = await this.getSyncState(directoryEntry.id);

    if (!existingState) {
      const initialized = await this.initializeSyncState(
        directoryEntry,
        input.userId,
      );
      logger.info("Initialized mail sync state", {
        accountId,
        emailState: initialized.email.newState,
        mailboxState: initialized.mailbox.newState,
        threadState: initialized.thread.newState,
      });
      return initialized;
    }

    const [emailChanges, mailboxChanges, threadChanges] = await Promise.all([
      this.fetchEmailChanges(accountId, existingState.emailState),
      this.fetchMailboxChanges(accountId, existingState.mailboxState),
      this.fetchThreadChanges(
        accountId,
        existingState.threadState ?? existingState.emailState,
      ),
    ]);

    const updatedState = await this.prisma.mailJmapSyncState.update({
      where: { id: existingState.id },
      data: {
        emailState: emailChanges.newState,
        mailboxState: mailboxChanges.newState,
        threadState: threadChanges.newState,
        lastSyncedAt: new Date(),
      },
      select: mailSyncStateSelect,
    });
    this.cacheSyncState(updatedState);

    const changedTypes = [
      ...(emailChanges.created.length ||
      emailChanges.updated.length ||
      emailChanges.destroyed.length
        ? ["Email"]
        : []),
      ...(mailboxChanges.created.length ||
      mailboxChanges.updated.length ||
      mailboxChanges.destroyed.length
        ? ["Mailbox"]
        : []),
      ...(threadChanges.created.length ||
      threadChanges.updated.length ||
      threadChanges.destroyed.length
        ? ["Thread"]
        : []),
    ];
    const calendarImport = await this.ingestCalendarEventsFromMail({
      userId: input.userId,
      records: emailChanges.records,
    });

    logger.info("Mail sync completed", {
      accountId,
      changedTypes,
      emailState: emailChanges.newState,
      mailboxState: mailboxChanges.newState,
      threadState: threadChanges.newState,
    });

    return {
      accountId,
      initialized: false,
      changedTypes,
      email: emailChanges,
      mailbox: mailboxChanges,
      thread: threadChanges,
      calendarImport,
    };
  }

  private async ingestCalendarEventsFromMail(input: {
    userId: string;
    records: JmapEmail[];
  }): Promise<MailCalendarImportSummary> {
    try {
      return await this.mailCalendarIngestion.ingestFromEmails({
        userId: input.userId,
        emails: input.records,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown calendar import error";
      logger.error("Mail calendar import failed", errorLogDetails(error));
      return {
        ...createEmptyMailCalendarImportSummary(),
        messagesScanned: input.records.length,
        errors: [message],
      };
    }
  }

  private async initializeSyncState(
    directoryEntry: AuthorizedDirectoryEntry,
    userId: string,
  ): Promise<MailSyncResult> {
    const [mailboxResponse, emailResponse, threadResponse] = await Promise.all([
      this.getMailboxes(directoryEntry.stalwartAccountId),
      this.getEmailState(directoryEntry.stalwartAccountId),
      this.getThreadState(directoryEntry.stalwartAccountId),
    ]);

    const persistedState = await this.prisma.mailJmapSyncState.upsert({
      where: {
        directoryEntryId: directoryEntry.id,
      },
      create: {
        directoryEntry: {
          connect: {
            id: directoryEntry.id,
          },
        },
        stalwartAccountId: directoryEntry.stalwartAccountId,
        emailState: emailResponse.state,
        mailboxState: mailboxResponse.state,
        threadState: threadResponse.state,
        lastSyncedAt: new Date(),
      },
      update: {
        stalwartAccountId: directoryEntry.stalwartAccountId,
        emailState: emailResponse.state,
        mailboxState: mailboxResponse.state,
        threadState: threadResponse.state,
        lastSyncedAt: new Date(),
      },
      select: mailSyncStateSelect,
    });
    this.cacheSyncState(persistedState);
    const recentEmails = await this.getRecentEmails(
      directoryEntry.stalwartAccountId,
      50,
    );
    const calendarImport = await this.ingestCalendarEventsFromMail({
      userId,
      records: recentEmails,
    });

    return {
      accountId: directoryEntry.stalwartAccountId,
      initialized: true,
      changedTypes: [],
      email: collectionResult({
        oldState: null,
        newState: emailResponse.state,
      }),
      mailbox: collectionResult({
        oldState: null,
        newState: mailboxResponse.state,
        records: mailboxResponse.list ?? [],
      }),
      thread: collectionResult({
        oldState: null,
        newState: threadResponse.state,
      }),
      calendarImport,
    };
  }

  private async getAuthorizedDirectoryEntry(
    userId: string,
    accountId: string,
  ): Promise<AuthorizedDirectoryEntry> {
    const cached = this.readCached(
      this.authorizedDirectoryEntryCache,
      this.getAuthorizedDirectoryEntryCacheKey(userId, accountId),
    );

    if (cached) {
      return cached;
    }

    const entry = await this.prisma.mailDirectoryEntry.findUnique({
      where: {
        stalwartAccountId: accountId,
      },
      select: {
        id: true,
        userId: true,
        stalwartAccountId: true,
      },
    });

    if (!entry || entry.userId !== userId) {
      throw new ForbiddenError("You are not authorized to sync that mailbox.");
    }

    return this.cacheAuthorizedDirectoryEntry(userId, {
      id: entry.id,
      stalwartAccountId: entry.stalwartAccountId,
    });
  }

  private async fetchEmailChanges(
    accountId: string,
    sinceState: string,
  ): Promise<MailSyncCollection<JmapEmail>> {
    const changes = await this.collectChanges("Email", accountId, sinceState);
    const ids = uniqueIds([...changes.created, ...changes.updated]);
    const records = ids.length > 0 ? await this.getEmails(accountId, ids) : [];

    return collectionResult({
      oldState: changes.oldState,
      newState: changes.newState,
      created: changes.created,
      updated: changes.updated,
      destroyed: changes.destroyed,
      records: sortEmailsDescending(records),
    });
  }

  private async fetchMailboxChanges(
    accountId: string,
    sinceState: string,
  ): Promise<MailSyncCollection<JmapMailbox>> {
    const changes = await this.collectChanges("Mailbox", accountId, sinceState);
    const ids = uniqueIds([...changes.created, ...changes.updated]);
    const records =
      ids.length > 0 ? await this.getMailboxesByIds(accountId, ids) : [];

    return collectionResult({
      oldState: changes.oldState,
      newState: changes.newState,
      created: changes.created,
      updated: changes.updated,
      destroyed: changes.destroyed,
      records,
    });
  }

  private async fetchThreadChanges(
    accountId: string,
    sinceState: string,
  ): Promise<MailSyncCollection<MailSyncThreadRecord>> {
    const changes = await this.collectChanges("Thread", accountId, sinceState);
    const ids = uniqueIds([...changes.created, ...changes.updated]);
    const records = ids.length > 0 ? await this.getThreads(accountId, ids) : [];

    return collectionResult({
      oldState: changes.oldState,
      newState: changes.newState,
      created: changes.created,
      updated: changes.updated,
      destroyed: changes.destroyed,
      records,
    });
  }

  private async collectChanges(
    typeName: "Email" | "Mailbox" | "Thread",
    accountId: string,
    sinceState: string,
  ): Promise<{
    oldState: string;
    newState: string;
    created: string[];
    updated: string[];
    destroyed: string[];
  }> {
    let requestState = sinceState;
    let oldState = sinceState;
    const created: string[] = [];
    const updated: string[] = [];
    const destroyed: string[] = [];

    for (let attempt = 0; attempt < 25; attempt += 1) {
      const response = await this.callMethod<JmapChangesResponse>(
        `${typeName}/changes`,
        {
          accountId,
          sinceState: requestState,
          maxChanges: 200,
        },
      );

      oldState = response.oldState;
      created.push(...(response.created ?? []));
      updated.push(...(response.updated ?? []));
      destroyed.push(...(response.destroyed ?? []));
      requestState = response.newState;

      if (!response.hasMoreChanges) {
        return {
          oldState,
          newState: response.newState,
          created: uniqueIds(created),
          updated: uniqueIds(updated),
          destroyed: uniqueIds(destroyed),
        };
      }
    }

    throw new Error(
      `Mail sync exceeded change pagination limit for ${typeName}.`,
    );
  }

  private async getMailboxes(
    accountId: string,
  ): Promise<JmapGetResponse<JmapMailbox>> {
    return this.callMethod<JmapGetResponse<JmapMailbox>>("Mailbox/get", {
      accountId,
      properties: ["id", "name", "role", "parentId", "sortOrder"],
    });
  }

  private async getMailboxesByIds(
    accountId: string,
    ids: string[],
  ): Promise<JmapMailbox[]> {
    const response = await this.callMethod<JmapGetResponse<JmapMailbox>>(
      "Mailbox/get",
      {
        accountId,
        ids,
        properties: ["id", "name", "role", "parentId", "sortOrder"],
      },
    );

    return response.list ?? [];
  }

  private async getEmailState(
    accountId: string,
  ): Promise<JmapGetResponse<JmapEmail>> {
    return this.callMethod<JmapGetResponse<JmapEmail>>("Email/get", {
      accountId,
      ids: [],
      properties: ["id"],
    });
  }

  private async getThreadState(
    accountId: string,
  ): Promise<JmapGetResponse<MailSyncThreadRecord>> {
    return this.callMethod<JmapGetResponse<MailSyncThreadRecord>>(
      "Thread/get",
      {
        accountId,
        ids: [],
        properties: ["id", "emailIds"],
      },
    );
  }

  private async getEmails(
    accountId: string,
    ids: string[],
  ): Promise<JmapEmail[]> {
    const response = await this.callMethod<JmapGetResponse<JmapEmail>>(
      "Email/get",
      {
        accountId,
        ids,
        properties: [
          "id",
          "threadId",
          "mailboxIds",
          "from",
          "to",
          "cc",
          "bcc",
          "subject",
          "receivedAt",
          "keywords",
          "bodyStructure",
          "bodyValues",
          "textBody",
          "htmlBody",
          "attachments",
        ],
        fetchTextBodyValues: true,
        fetchHTMLBodyValues: true,
        fetchAllBodyValues: true,
      },
    );

    return response.list ?? [];
  }

  private async getRecentEmails(
    accountId: string,
    limit: number,
  ): Promise<JmapEmail[]> {
    const response = await this.callMethod<JmapQueryResponse>("Email/query", {
      accountId,
      sort: [{ property: "receivedAt", isAscending: false }],
      limit,
    });
    const ids = response.ids ?? [];
    return ids.length > 0 ? this.getEmails(accountId, ids) : [];
  }

  private async getThreads(
    accountId: string,
    ids: string[],
  ): Promise<MailSyncThreadRecord[]> {
    const response = await this.callMethod<
      JmapGetResponse<MailSyncThreadRecord>
    >("Thread/get", {
      accountId,
      ids,
      properties: ["id", "emailIds"],
    });

    return response.list ?? [];
  }

  private async callMethod<T>(
    methodName: string,
    argumentsObject: Record<string, unknown>,
  ): Promise<T> {
    const methodCall: StalwartJmapMethodCall = [
      methodName,
      argumentsObject,
      "c1",
    ];
    const envelope = await this.jmapAdminClient.callJmap({
      using: [...CORE_MAIL_CAPABILITIES],
      methodCalls: [methodCall],
    });

    return this.getMethodResult<T>(envelope, methodName);
  }

  private getMethodResult<T>(
    envelope: StalwartJmapEnvelope,
    methodName: string,
  ): T {
    const tuple = (envelope.methodResponses ?? []).find(
      (entry) => entry[0] === methodName,
    );

    if (!tuple) {
      throw new Error(`Stalwart JMAP response did not include ${methodName}.`);
    }

    return tuple[1] as T;
  }
}
