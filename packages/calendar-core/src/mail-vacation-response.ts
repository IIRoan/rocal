import { addDays } from "date-fns";
import type { JmapMethodCallLike } from "./mail-server-policy";
import { toJmapUtcDate } from "./mail-search-filter";
import {
  formatCalendarDayKey,
  parseCalendarDayKey,
  resolveTimezone,
  utcToPickerDate,
} from "./timezone";
import { z } from "./zod";

export const VACATION_RESPONSE_CAPABILITY = "urn:ietf:params:jmap:vacationresponse";
export const VACATION_RESPONSE_USING = ["urn:ietf:params:jmap:core", VACATION_RESPONSE_CAPABILITY];
export const VACATION_REPLY_SERVER_NOTICE =
  "Your mail server keeps this reply unencrypted because it sends it for you. Leave out anything private.";
export const VACATION_REPLY_UNAVAILABLE = "Auto-reply isn't available on this mail server.";
export const VACATION_REPLY_MAX_CHARS = 5000;
export const VACATION_SUBJECT_MAX_CHARS = 200;

const SINGLETON = "singleton";

export const vacationResponseSchema = z.object({
  id: z.string(),
  isEnabled: z.boolean(),
  fromDate: z.string().nullish(),
  toDate: z.string().nullish(),
  subject: z.string().nullish(),
  textBody: z.string().nullish(),
  htmlBody: z.string().nullish(),
});

export type VacationResponse = z.infer<typeof vacationResponseSchema>;

export type VacationResponseUpdate = {
  isEnabled: boolean;
  fromDate: string | null;
  toDate: string | null;
  subject: string | null;
  textBody: string | null;
  htmlBody: null;
};

export type MailVacationForm = {
  enabled: boolean;
  fromDay: string;
  toDay: string;
  subject: string;
  text: string;
};

export type MailVacationFormError = { field: keyof MailVacationForm; message: string };

export function supportsVacationResponse(session: { capabilities?: Record<string, unknown> }): boolean {
  return Boolean(session.capabilities && VACATION_RESPONSE_CAPABILITY in session.capabilities);
}

export function vacationResponseAccountId(
  session: { primaryAccounts: Record<string, string> },
  mailAccountId: string,
): string {
  return session.primaryAccounts[VACATION_RESPONSE_CAPABILITY] ?? mailAccountId;
}

function dayKeyOf(instant: number, timezone: string): string {
  return formatCalendarDayKey(utcToPickerDate(new Date(instant), timezone));
}

/** Server dates become whole days in the user's time zone; `toDate` is an exclusive end, so its day is the one before. */
export function vacationResponseToForm(
  response: VacationResponse | null,
  timezone?: string | null,
): MailVacationForm {
  const zone = resolveTimezone(timezone);
  const from = response?.fromDate ? Date.parse(response.fromDate) : Number.NaN;
  const to = response?.toDate ? Date.parse(response.toDate) : Number.NaN;
  return {
    enabled: response?.isEnabled ?? false,
    fromDay: Number.isNaN(from) ? "" : dayKeyOf(from, zone),
    toDay: Number.isNaN(to) ? "" : dayKeyOf(to - 1, zone),
    subject: response?.subject ?? "",
    text: response?.textBody ?? "",
  };
}

/** A real YYYY-MM-DD day only: a date-time or a day that rolls over (2026-02-30) is null. */
function parseVacationDay(dayKey: string): Date | null {
  const day = parseCalendarDayKey(dayKey);
  return day && formatCalendarDayKey(day) === dayKey ? day : null;
}

function nextDayKey(dayKey: string): string {
  const day = parseVacationDay(dayKey);
  if (!day) throw new Error("Use dates like 2026-11-14.");
  return formatCalendarDayKey(addDays(day, 1));
}

/** The first problem with the form, for an inline message under that field. */
export function validateVacationForm(form: MailVacationForm): MailVacationFormError | null {
  if (form.fromDay && !parseVacationDay(form.fromDay)) {
    return { field: "fromDay", message: "Use dates like 2026-11-14." };
  }
  if (form.toDay && !parseVacationDay(form.toDay)) {
    return { field: "toDay", message: "Use dates like 2026-11-14." };
  }
  if (form.fromDay && form.toDay && form.toDay < form.fromDay) {
    return { field: "toDay", message: "The last day can't be before the first day." };
  }
  if (form.subject.length > VACATION_SUBJECT_MAX_CHARS) {
    return { field: "subject", message: `Keep the subject under ${VACATION_SUBJECT_MAX_CHARS} characters.` };
  }
  if (form.text.length > VACATION_REPLY_MAX_CHARS) {
    return { field: "text", message: "Keep the message under 5,000 characters." };
  }
  if (form.enabled && !form.text.trim()) {
    return { field: "text", message: "Write the reply before turning it on." };
  }
  return null;
}

/** Text only, so there is no HTML to sanitize; a blank subject lets the server use its default. */
export function vacationFormToUpdate(
  form: MailVacationForm,
  timezone?: string | null,
): VacationResponseUpdate {
  const error = validateVacationForm(form);
  if (error) throw new Error(error.message);
  return {
    isEnabled: form.enabled,
    fromDate: form.fromDay ? toJmapUtcDate(form.fromDay, timezone) : null,
    toDate: form.toDay ? toJmapUtcDate(nextDayKey(form.toDay), timezone) : null,
    subject: form.subject.trim() || null,
    textBody: form.text.trim() ? form.text : null,
    htmlBody: null,
  };
}

export function buildVacationResponseGetCall(accountId: string): JmapMethodCallLike {
  return ["VacationResponse/get", { accountId, ids: [SINGLETON] }, "v1"];
}

export function buildVacationResponseSetCall(
  accountId: string,
  update: VacationResponseUpdate,
): JmapMethodCallLike {
  return ["VacationResponse/set", { accountId, update: { [SINGLETON]: update } }, "v1"];
}

const vacationResponseGetSchema = z.object({ list: z.array(vacationResponseSchema) });

/** The stored reply, or `null` when the account has none yet. */
export function parseVacationResponseGet(result: unknown): VacationResponse | null {
  const parsed = vacationResponseGetSchema.safeParse(result);
  if (!parsed.success) throw new Error("The mail server sent an auto-reply it couldn't read.");
  return parsed.data.list.find((entry) => entry.id === SINGLETON) ?? null;
}

const vacationResponseSetSchema = z.object({
  updated: z.record(z.string(), z.unknown()).nullish(),
  notUpdated: z.record(z.string(), z.object({ description: z.string().nullish() })).nullish(),
});

export function assertVacationResponseSet(result: unknown): void {
  const parsed = vacationResponseSetSchema.safeParse(result);
  if (parsed.success && parsed.data.updated && SINGLETON in parsed.data.updated) return;
  const description = parsed.success ? parsed.data.notUpdated?.[SINGLETON]?.description : null;
  throw new Error(description || "Couldn't save the auto-reply.");
}
