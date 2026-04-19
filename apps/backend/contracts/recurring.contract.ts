import type { RecurrenceRule } from "../lib/recurrence";

export type RecurringRuleInput =
  | string
  | {
      frequency: RecurrenceRule["frequency"];
      interval: number;
      count?: number;
      until?: string;
      timezone?: string;
      byWeekDay?: number[];
      byMonthDay?: number[];
      byMonth?: number[];
    };

export type RecurringUpdates = {
  title?: string;
  description?: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  location?: string;
  color?: string;
  reminder?: number;
  recurrence?: string;
  calendarId?: string;
  categoryId?: string;
};

export type RecurrenceValidateResult = {
  valid: boolean;
  errors: string[];
  description: string | null;
  rule?: RecurrenceRule;
};

export type RecurrencePreviewInput = {
  eventStart: string;
  eventEnd: string;
  recurrenceRule: RecurringRuleInput;
  previewDays?: number;
};

export type RecurrencePreviewResult = {
  instances: Array<{ date: string; isOriginal: boolean }>;
  description: string;
  totalInstances: number;
};

export type RecurringEditInput = {
  userId: string;
  eventId: string;
  editScope: "this_only" | "this_and_future" | "all";
  occurrenceDate?: string;
  updates: RecurringUpdates;
};

export type RecurringDeleteInput = {
  userId: string;
  eventId: string;
  deleteScope: "this_only" | "this_and_future" | "all";
  occurrenceDate?: string;
};

export type RecurringDeleteResult = {
  success: boolean;
  message: string;
  deletedEventId: string;
  action: string;
};

export type RecurrencePattern = {
  rule: RecurrenceRule;
  description: string;
};

export interface IRecurringService {
  validate(rule: RecurringRuleInput): RecurrenceValidateResult;
  preview(input: RecurrencePreviewInput): RecurrencePreviewResult;
  editSeries(input: RecurringEditInput): Promise<unknown>;
  deleteSeries(input: RecurringDeleteInput): Promise<RecurringDeleteResult>;
  getCommonPatterns(): {
    patterns: Record<string, RecurrencePattern>;
  };
}
