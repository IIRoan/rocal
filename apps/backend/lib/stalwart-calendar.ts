import { createLogger } from "@workspace/logger";
import { env } from "./env";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export type StalwartJmapMethodCall = [string, Record<string, unknown>, string];

type StalwartJmapEnvelope = {
  methodResponses?: Array<[string, Record<string, unknown>, string]>;
  sessionState?: string;
};

type StalwartSetError = {
  type?: string;
  description?: string;
  properties?: string[];
};

export type StalwartCalendarRecord = {
  id: string;
  name?: string | null;
  description?: string | null;
  color?: string | null;
  timeZone?: string | null;
  sortOrder?: number | null;
  isDefault?: boolean | null;
  isSubscribed?: boolean | null;
  isVisible?: boolean | null;
};

export type StalwartCalendarEventRecord = Record<string, unknown> & {
  id: string;
  uid?: string | null;
  calendarIds?: Record<string, boolean | null>;
  title?: string | null;
  description?: string | null;
  start?: string | null;
  duration?: string | null;
  timeZone?: string | null;
  recurrenceRule?: Record<string, unknown> | null;
  locations?: Record<string, { name?: string | null } | null> | null;
  alerts?: Record<
    string,
    {
      action?: string | null;
      trigger?: {
        offset?: string | null;
      } | null;
    } | null
  > | null;
  participants?: Record<string, Record<string, unknown> | null> | null;
};

export type StalwartContactCardInput = {
  addressBookId: string;
  email: string;
  displayName?: string | null;
};

export interface StalwartCalendarClientLike {
  listCalendars(accountId: string): Promise<StalwartCalendarRecord[]>;
  createCalendar(
    accountId: string,
    calendar: {
      name: string;
      color?: string | null;
      isVisible?: boolean;
      isDefault?: boolean;
      timeZone?: string | null;
      description?: string | null;
    },
  ): Promise<{ id: string }>;
  updateCalendar(
    accountId: string,
    calendarId: string,
    patch: {
      name?: string;
      color?: string | null;
      isVisible?: boolean;
      isDefault?: boolean;
      timeZone?: string | null;
      description?: string | null;
    },
  ): Promise<void>;
  deleteCalendar(
    accountId: string,
    calendarId: string,
    options?: { removeEvents?: boolean },
  ): Promise<void>;
  queryEventIds(input: {
    accountId: string;
    filter?: Record<string, unknown>;
    sort?: Array<Record<string, unknown>>;
    limit?: number;
    expandRecurrences?: boolean;
    timeZone?: string;
  }): Promise<string[]>;
  getEvents(input: {
    accountId: string;
    ids: string[];
    properties?: string[];
    timeZone?: string;
  }): Promise<StalwartCalendarEventRecord[]>;
  createEvent(input: {
    accountId: string;
    event: Record<string, unknown>;
    sendSchedulingMessages?: boolean;
  }): Promise<{ id: string }>;
  updateEvent(input: {
    accountId: string;
    eventId: string;
    patch: Record<string, unknown>;
    sendSchedulingMessages?: boolean;
  }): Promise<void>;
  deleteEvent(input: {
    accountId: string;
    eventId: string;
    sendSchedulingMessages?: boolean;
  }): Promise<void>;
  listAddressBooks(
    accountId: string,
  ): Promise<
    Array<{ id: string; name?: string | null; isDefault?: boolean | null }>
  >;
  createContactCard(
    accountId: string,
    contact: StalwartContactCardInput,
  ): Promise<{ id: string }>;
}

const logger = createLogger("backend:stalwart-calendar");

const CORE_CAPABILITY = "urn:ietf:params:jmap:core";
const CALENDARS_CAPABILITY = "urn:ietf:params:jmap:calendars";
const CONTACTS_CAPABILITY = "urn:ietf:params:jmap:contacts";

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function getMethodResult<T>(
  envelope: StalwartJmapEnvelope,
  methodName: string,
): T {
  const tuple = (envelope.methodResponses ?? []).find(
    (entry) => entry[0] === methodName,
  );

  if (!tuple) {
    throw new Error(`Stalwart JMAP response did not include ${methodName}.`);
  }

  const payload = tuple[1];
  if (payload?.type === "error") {
    throw new Error(
      typeof payload.description === "string"
        ? payload.description
        : `Stalwart ${methodName} returned an error.`,
    );
  }

  return payload as T;
}

function assertNoSetError(
  result: {
    notCreated?: Record<string, StalwartSetError>;
    notUpdated?: Record<string, StalwartSetError>;
    notDestroyed?: Record<string, StalwartSetError>;
  },
  key: string,
  operation: "create" | "update" | "destroy",
): void {
  const error =
    operation === "create"
      ? result.notCreated?.[key]
      : operation === "update"
        ? result.notUpdated?.[key]
        : result.notDestroyed?.[key];

  if (error) {
    throw new Error(
      error.description ||
        `Stalwart calendar ${operation} failed (${error.type || "unknown"}).`,
    );
  }
}

export class StalwartCalendarClient implements StalwartCalendarClientLike {
  private readonly baseUrl: string;
  private readonly adminToken: string;
  private readonly fetcher: Fetcher;

  constructor({
    baseUrl,
    adminToken,
    fetcher = fetch,
  }: {
    baseUrl: string;
    adminToken: string;
    fetcher?: Fetcher;
  }) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.adminToken = adminToken.trim();
    this.fetcher = fetcher;
  }

  private async callJmap(input: {
    using: string[];
    methodCalls: StalwartJmapMethodCall[];
  }): Promise<StalwartJmapEnvelope> {
    if (!this.adminToken) {
      throw new Error("Stalwart calendar integration requires an admin token.");
    }

    const response = await this.fetcher(`${this.baseUrl}/jmap/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      logger.error("Stalwart calendar JMAP request failed", {
        status: response.status,
        details,
      });
      throw new Error(
        `Stalwart calendar JMAP request failed with status ${response.status}.`,
      );
    }

    return (await response.json()) as StalwartJmapEnvelope;
  }

  private callCalendarJmap(methodCalls: StalwartJmapMethodCall[]) {
    return this.callJmap({
      using: [CORE_CAPABILITY, CALENDARS_CAPABILITY],
      methodCalls,
    });
  }

  private callContactsJmap(methodCalls: StalwartJmapMethodCall[]) {
    return this.callJmap({
      using: [CORE_CAPABILITY, CONTACTS_CAPABILITY],
      methodCalls,
    });
  }

  async listCalendars(accountId: string): Promise<StalwartCalendarRecord[]> {
    const envelope = await this.callCalendarJmap([
      [
        "Calendar/get",
        {
          accountId,
          ids: null,
          properties: [
            "id",
            "name",
            "description",
            "color",
            "timeZone",
            "sortOrder",
            "isDefault",
            "isSubscribed",
            "isVisible",
          ],
        },
        "c1",
      ],
    ]);
    const result = getMethodResult<{ list?: StalwartCalendarRecord[] }>(
      envelope,
      "Calendar/get",
    );
    return result.list ?? [];
  }

  async createCalendar(
    accountId: string,
    calendar: {
      name: string;
      color?: string | null;
      isVisible?: boolean;
      isDefault?: boolean;
      timeZone?: string | null;
      description?: string | null;
    },
  ): Promise<{ id: string }> {
    const envelope = await this.callCalendarJmap([
      [
        "Calendar/set",
        {
          accountId,
          create: {
            calendar1: {
              name: calendar.name,
              color: calendar.color ?? null,
              isVisible: calendar.isVisible ?? true,
              timeZone: calendar.timeZone ?? null,
              description: calendar.description ?? null,
            },
          },
          ...(calendar.isDefault
            ? { onSuccessSetIsDefault: "#calendar1" }
            : {}),
        },
        "c1",
      ],
    ]);
    const result = getMethodResult<{
      created?: Record<string, { id?: string }>;
      notCreated?: Record<string, StalwartSetError>;
    }>(envelope, "Calendar/set");
    assertNoSetError(result, "calendar1", "create");
    const id = result.created?.calendar1?.id;
    if (!id) {
      throw new Error("Stalwart calendar create was not acknowledged.");
    }
    return { id };
  }

  async updateCalendar(
    accountId: string,
    calendarId: string,
    patch: {
      name?: string;
      color?: string | null;
      isVisible?: boolean;
      isDefault?: boolean;
      timeZone?: string | null;
      description?: string | null;
    },
  ): Promise<void> {
    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.color !== undefined) update.color = patch.color;
    if (patch.isVisible !== undefined) update.isVisible = patch.isVisible;
    if (patch.timeZone !== undefined) update.timeZone = patch.timeZone;
    if (patch.description !== undefined) update.description = patch.description;

    const envelope = await this.callCalendarJmap([
      [
        "Calendar/set",
        {
          accountId,
          update: {
            [calendarId]: update,
          },
          ...(patch.isDefault ? { onSuccessSetIsDefault: calendarId } : {}),
        },
        "c1",
      ],
    ]);
    const result = getMethodResult<{
      updated?: Record<string, null>;
      notUpdated?: Record<string, StalwartSetError>;
    }>(envelope, "Calendar/set");
    assertNoSetError(result, calendarId, "update");
  }

  async deleteCalendar(
    accountId: string,
    calendarId: string,
    options: { removeEvents?: boolean } = {},
  ): Promise<void> {
    const envelope = await this.callCalendarJmap([
      [
        "Calendar/set",
        {
          accountId,
          destroy: [calendarId],
          ...(options.removeEvents ? { onDestroyRemoveEvents: true } : {}),
        },
        "c1",
      ],
    ]);
    const result = getMethodResult<{
      destroyed?: string[];
      notDestroyed?: Record<string, StalwartSetError>;
    }>(envelope, "Calendar/set");
    assertNoSetError(result, calendarId, "destroy");
  }

  async queryEventIds(input: {
    accountId: string;
    filter?: Record<string, unknown>;
    sort?: Array<Record<string, unknown>>;
    limit?: number;
    expandRecurrences?: boolean;
    timeZone?: string;
  }): Promise<string[]> {
    const envelope = await this.callCalendarJmap([
      [
        "CalendarEvent/query",
        {
          accountId: input.accountId,
          filter: input.filter ?? {},
          sort: input.sort ?? [{ property: "start" }],
          limit: input.limit ?? 500,
          expandRecurrences: input.expandRecurrences ?? false,
          ...(input.timeZone ? { timeZone: input.timeZone } : {}),
        },
        "c1",
      ],
    ]);
    const result = getMethodResult<{ ids?: string[] }>(
      envelope,
      "CalendarEvent/query",
    );
    return result.ids ?? [];
  }

  async getEvents(input: {
    accountId: string;
    ids: string[];
    properties?: string[];
    timeZone?: string;
  }): Promise<StalwartCalendarEventRecord[]> {
    if (input.ids.length === 0) {
      return [];
    }

    const envelope = await this.callCalendarJmap([
      [
        "CalendarEvent/get",
        {
          accountId: input.accountId,
          ids: input.ids,
          properties: input.properties ?? [
            "id",
            "uid",
            "calendarIds",
            "title",
            "description",
            "start",
            "duration",
            "timeZone",
            "recurrenceRule",
            "locations",
            "alerts",
            "participants",
            "updated",
          ],
          ...(input.timeZone ? { timeZone: input.timeZone } : {}),
        },
        "c1",
      ],
    ]);
    const result = getMethodResult<{ list?: StalwartCalendarEventRecord[] }>(
      envelope,
      "CalendarEvent/get",
    );
    return result.list ?? [];
  }

  async createEvent(input: {
    accountId: string;
    event: Record<string, unknown>;
    sendSchedulingMessages?: boolean;
  }): Promise<{ id: string }> {
    const envelope = await this.callCalendarJmap([
      [
        "CalendarEvent/set",
        {
          accountId: input.accountId,
          create: {
            event1: input.event,
          },
          sendSchedulingMessages: input.sendSchedulingMessages ?? true,
        },
        "c1",
      ],
    ]);
    const result = getMethodResult<{
      created?: Record<string, { id?: string }>;
      notCreated?: Record<string, StalwartSetError>;
    }>(envelope, "CalendarEvent/set");
    assertNoSetError(result, "event1", "create");
    const id = result.created?.event1?.id;
    if (!id) {
      throw new Error("Stalwart event create was not acknowledged.");
    }
    return { id };
  }

  async updateEvent(input: {
    accountId: string;
    eventId: string;
    patch: Record<string, unknown>;
    sendSchedulingMessages?: boolean;
  }): Promise<void> {
    const envelope = await this.callCalendarJmap([
      [
        "CalendarEvent/set",
        {
          accountId: input.accountId,
          update: {
            [input.eventId]: input.patch,
          },
          sendSchedulingMessages: input.sendSchedulingMessages ?? true,
        },
        "c1",
      ],
    ]);
    const result = getMethodResult<{
      updated?: Record<string, null>;
      notUpdated?: Record<string, StalwartSetError>;
    }>(envelope, "CalendarEvent/set");
    assertNoSetError(result, input.eventId, "update");
  }

  async deleteEvent(input: {
    accountId: string;
    eventId: string;
    sendSchedulingMessages?: boolean;
  }): Promise<void> {
    const envelope = await this.callCalendarJmap([
      [
        "CalendarEvent/set",
        {
          accountId: input.accountId,
          destroy: [input.eventId],
          sendSchedulingMessages: input.sendSchedulingMessages ?? true,
        },
        "c1",
      ],
    ]);
    const result = getMethodResult<{
      destroyed?: string[];
      notDestroyed?: Record<string, StalwartSetError>;
    }>(envelope, "CalendarEvent/set");
    assertNoSetError(result, input.eventId, "destroy");
  }

  async listAddressBooks(
    accountId: string,
  ): Promise<
    Array<{ id: string; name?: string | null; isDefault?: boolean | null }>
  > {
    const envelope = await this.callContactsJmap([
      [
        "AddressBook/get",
        {
          accountId,
          ids: null,
          properties: ["id", "name", "isDefault"],
        },
        "c1",
      ],
    ]);
    const result = getMethodResult<{
      list?: Array<{
        id: string;
        name?: string | null;
        isDefault?: boolean | null;
      }>;
    }>(envelope, "AddressBook/get");
    return result.list ?? [];
  }

  async createContactCard(
    accountId: string,
    contact: StalwartContactCardInput,
  ): Promise<{ id: string }> {
    const displayName = contact.displayName?.trim() || contact.email;
    const envelope = await this.callContactsJmap([
      [
        "ContactCard/set",
        {
          accountId,
          create: {
            contact1: {
              addressBookIds: {
                [contact.addressBookId]: true,
              },
              name: {
                full: displayName,
              },
              emails: {
                "0": {
                  address: contact.email,
                },
              },
            },
          },
        },
        "c1",
      ],
    ]);
    const result = getMethodResult<{
      created?: Record<string, { id?: string }>;
      notCreated?: Record<string, StalwartSetError>;
    }>(envelope, "ContactCard/set");
    assertNoSetError(result, "contact1", "create");
    const id = result.created?.contact1?.id;
    if (!id) {
      throw new Error("Stalwart contact create was not acknowledged.");
    }
    return { id };
  }
}

export function createStalwartCalendarClient(config?: {
  baseUrl?: string;
  adminToken?: string;
  fetcher?: Fetcher;
}): StalwartCalendarClientLike | null {
  const adminToken = config?.adminToken ?? env.stalwartAdminToken;
  if (!adminToken.trim()) {
    return null;
  }

  return new StalwartCalendarClient({
    baseUrl: config?.baseUrl || env.stalwartBaseUrl,
    adminToken,
    fetcher: config?.fetcher,
  });
}
