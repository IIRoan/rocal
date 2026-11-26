import type { MailServerPolicy } from "./mail-server-policy";
import { formatClockTime, formatDateTimeLabel, type TimeFormat } from "./time-format";
import {
  formatInUserTimezone,
  utcToPickerDate,
  wallClockFromCalendarDayKey,
  wallClockToUtc,
} from "./timezone";

export const SCHEDULED_SEND_KEYWORD_PREFIX = "$solace-scheduled-";
export const MIN_SCHEDULE_LEAD_MS = 120_000;
/** Stalwart's MTA enforces a 7-day FUTURERELEASE limit (pinned in `30-mta.ndjson`) even where JMAP advertises more. */
export const MAX_SEALED_HOLD_MS = 7 * 86_400_000;
/** Plaintext for outside recipients waits readable in the queue, so it is held at most a day. */
export const MAX_EXTERNAL_HOLD_MS = 86_400_000;
export const SCHEDULED_SEND_EXTERNAL_NOTICE =
  "People outside Solace get this message unencrypted, and it waits readable on the mail server until it's sent.";

export type MailSendHold = { forSeconds: number } | { until: string };

export type ScheduledMailSend = {
  submissionId: string;
  emailId: string;
  sendAt: string;
  subject: string;
  recipients: string[];
};

/** Sealed copies always report an attachment (the ciphertext part), so the notice cannot be conditional. */
export const SCHEDULED_SEND_CANCELED_NOTICE = "Moved to Drafts. Attachments aren't kept when you edit it.";
export const CANCELED_SEND_IN_SENT_NOTICE = "Send canceled, but the message is still in Sent.";

export type ScheduledSendPreset = { label: string; sendAt: string };

const HOLD_UNTIL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export function scheduledSendKeyword(token: string): string {
  if (!/^[a-f0-9]{32}$/.test(token)) throw new Error("Invalid submission reference.");
  return `${SCHEDULED_SEND_KEYWORD_PREFIX}${token}`;
}

export function scheduledSendLatest(
  now: number,
  policy: Pick<MailServerPolicy, "maxDelayedSendSeconds">,
  hasExternalRecipients: boolean,
): number {
  const serverMax = Math.min(policy.maxDelayedSendSeconds * 1000, MAX_SEALED_HOLD_MS);
  return now + (hasExternalRecipients ? Math.min(serverMax, MAX_EXTERNAL_HOLD_MS) : serverMax);
}

/** JMAP HOLDUNTIL takes whole seconds in UTC. */
export function toHoldUntil(instant: Date): string {
  return instant.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Presets outside `[now + 2 min, latest]` are left out. */
export function getScheduledSendPresets(now: Date, timezone: string, latest: number): ScheduledSendPreset[] {
  const today = utcToPickerDate(now, timezone);
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const daysToMonday = ((8 - today.getDay()) % 7) || 7;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + daysToMonday);
  const at = (day: Date, hours: number) => toHoldUntil(wallClockToUtc(day, hours, 0, timezone));
  const presets = [
    { label: "Tomorrow morning", sendAt: at(tomorrow, 8) },
    { label: "Tomorrow afternoon", sendAt: at(tomorrow, 13) },
  ];
  if (daysToMonday !== 1) presets.push({ label: "Monday morning", sendAt: at(monday, 8) });
  return presets.filter((preset) => {
    const time = Date.parse(preset.sendAt);
    return time >= now.getTime() + MIN_SCHEDULE_LEAD_MS && time <= latest;
  });
}

/** Day `YYYY-MM-DD` and time `HH:MM` as wall-clock time in the user's zone. */
export function parseScheduledSendInput(day: string, time: string, timezone: string): string | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const instant = wallClockFromCalendarDayKey(day.trim(), hours, minutes, timezone);
  return instant && !Number.isNaN(instant.getTime()) ? toHoldUntil(instant) : null;
}

export function formatScheduledSendTime(sendAt: string, timezone: string, timeFormat: TimeFormat): string {
  return formatDateTimeLabel(new Date(sendAt), timezone, timeFormat);
}

/** Presets are at most a week out, so the year only costs room beside their labels. */
export function formatScheduledSendShortTime(sendAt: string, timezone: string, timeFormat: TimeFormat): string {
  const at = new Date(sendAt);
  return `${formatInUserTimezone(at, timezone, "MMM d")}, ${formatClockTime(at, timezone, timeFormat)}`;
}

export function resolveMailSendHold(input: {
  sendAt?: string | null;
  undoSendSeconds: number;
  policy: Pick<MailServerPolicy, "maxDelayedSendSeconds">;
  hasExternalRecipients: boolean;
  now: number;
}): { hold?: MailSendHold; error?: string } {
  const { policy } = input;
  if (input.sendAt) {
    if (policy.maxDelayedSendSeconds <= 0) return { error: "This mail server can't schedule messages." };
    const at = Date.parse(input.sendAt);
    if (!HOLD_UNTIL_PATTERN.test(input.sendAt) || Number.isNaN(at)) return { error: "Invalid send time." };
    if (at < input.now + MIN_SCHEDULE_LEAD_MS) return { error: "Pick a time at least 2 minutes from now." };
    if (at > scheduledSendLatest(input.now, policy, input.hasExternalRecipients)) {
      return {
        error: input.hasExternalRecipients
          ? "Messages to people outside Solace can be scheduled up to 24 hours ahead."
          : "Pick a time within the next 7 days.",
      };
    }
    return { hold: { until: input.sendAt } };
  }
  const seconds = Math.min(input.undoSendSeconds, policy.maxDelayedSendSeconds);
  return seconds > 0 ? { hold: { forSeconds: seconds } } : {};
}

/** Defence in depth: plaintext for outside recipients never waits in the queue longer than a day. */
export function assertMailSendHold(
  message: { hold?: MailSendHold; sentCopyCiphertext: unknown },
  now: number,
): void {
  const hold = message.hold;
  if (!hold || "forSeconds" in hold) return;
  const at = Date.parse(hold.until);
  const limit = message.sentCopyCiphertext !== null ? MAX_EXTERNAL_HOLD_MS : MAX_SEALED_HOLD_MS;
  if (Number.isNaN(at) || at > now + limit) throw new Error("Invalid send time.");
}
