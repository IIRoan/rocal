import type { Prisma } from "../generated/prisma/index.js";
import type {
  CalendarSubscriptionSyncResponse,
  ImportIcsResponse,
  UpdateCalendarSubscriptionRequest,
} from "@workspace/calendar-ics";

export type SyncableSubscription = Prisma.CalendarSubscriptionGetPayload<{
  include: { calendar: true };
}>;

export type SubscriptionCreateInput = {
  userId: string;
  name: string;
  url: string;
  color?: string;
};

export type SubscriptionUpdateInput = {
  userId: string;
  subscriptionId: string;
} & UpdateCalendarSubscriptionRequest;

export type SubscriptionDeleteInput = {
  userId: string;
  subscriptionId: string;
};

export type SubscriptionSyncInput = {
  userId: string;
  subscriptionId: string;
};

export type ImportIcsInput = {
  userId: string;
  calendarId: string;
  icsContent: string;
  fileName?: string;
};

export interface ISubscriptionService {
  list(userId: string): Promise<unknown[]>;
  create(input: SubscriptionCreateInput): Promise<unknown>;
  update(input: SubscriptionUpdateInput): Promise<unknown>;
  delete(input: SubscriptionDeleteInput): Promise<{ success: boolean }>;
  sync(input: SubscriptionSyncInput): Promise<CalendarSubscriptionSyncResponse>;
  importIcs(input: ImportIcsInput): Promise<ImportIcsResponse>;
}

export { type CalendarSubscriptionSyncResponse };
