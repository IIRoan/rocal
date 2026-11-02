import { formatInTimeZone } from "date-fns-tz";
import { resolveTimezone } from "./timezone";

type MailThreadAddress = { email?: string | null; name?: string | null };

export type MailThreadMessage = {
  id: string;
  receivedAt?: string | null;
  from?: readonly MailThreadAddress[] | null;
  to?: readonly MailThreadAddress[] | null;
  cc?: readonly MailThreadAddress[] | null;
};

export type MailThreadParticipant = {
  email: string;
  name: string | null;
  isSelf: boolean;
};

export type MailThreadStackEntry<T> =
  | { kind: "message"; message: T; expanded: boolean }
  | { kind: "folded"; count: number; firstHiddenId: string };

/** A run of more than this many collapsed messages on one side of the open message folds into a count. */
const MAIL_THREAD_FOLD_AFTER = 3;

/** Everyone on the thread in order of first appearance, with the signed-in account last. */
export function getMailThreadParticipants(
  messages: readonly MailThreadMessage[],
  accountEmail?: string | null,
): MailThreadParticipant[] {
  const self = accountEmail?.trim().toLowerCase() ?? "";
  const byEmail = new Map<string, MailThreadParticipant>();
  for (const message of messages) {
    for (const address of [
      ...(message.from ?? []),
      ...(message.to ?? []),
      ...(message.cc ?? []),
    ]) {
      const email = address.email?.trim();
      if (!email) continue;
      const key = email.toLowerCase();
      const name = address.name?.trim() || null;
      const existing = byEmail.get(key);
      if (!existing) {
        byEmail.set(key, { email, name, isSelf: key === self });
      } else if (!existing.name && name) {
        byEmail.set(key, { ...existing, name });
      }
    }
  }
  const participants = Array.from(byEmail.values());
  return [
    ...participants.filter((participant) => !participant.isSelf),
    ...participants.filter((participant) => participant.isSelf),
  ];
}

/** "Mar 25 – Mar 29" from a thread's first to last message in the user's time zone, or one day when both fall on it. */
export function formatMailThreadDateRange(
  messages: readonly MailThreadMessage[],
  timezone?: string | null,
  now: Date = new Date(),
): string | null {
  const times = messages
    .map((message) => Date.parse(message.receivedAt ?? ""))
    .filter((time) => Number.isFinite(time));
  if (times.length === 0) return null;
  const zone = resolveTimezone(timezone);
  const currentYear = formatInTimeZone(now, zone, "yyyy");
  const label = (time: number) =>
    formatInTimeZone(
      time,
      zone,
      formatInTimeZone(time, zone, "yyyy") === currentYear
        ? "MMM d"
        : "MMM d, yyyy",
    );
  const first = label(Math.min(...times));
  const last = label(Math.max(...times));
  return first === last ? first : `${first} – ${last}`;
}

/** The thread with the open message expanded in place (the newest when none is open); long runs around it fold unless `showAll`. */
export function planMailThreadStack<T extends { id: string }>(
  messages: readonly T[],
  expandedId: string | null | undefined,
  showAll: boolean,
): MailThreadStackEntry<T>[] {
  const found = messages.findIndex((message) => message.id === expandedId);
  const open = found >= 0 ? found : messages.length - 1;
  const openMessage = messages[open];
  if (!openMessage) return [];
  const collapsed = (message: T): MailThreadStackEntry<T> => ({
    kind: "message",
    message,
    expanded: false,
  });
  const fold = (side: readonly T[]): MailThreadStackEntry<T>[] => {
    const first = side[0];
    const hidden = side.slice(1, -1);
    const last = side[side.length - 1];
    const firstHidden = hidden[0];
    if (showAll || side.length <= MAIL_THREAD_FOLD_AFTER || !first || !last || !firstHidden) {
      return side.map(collapsed);
    }
    return [
      collapsed(first),
      { kind: "folded", count: hidden.length, firstHiddenId: firstHidden.id },
      collapsed(last),
    ];
  };
  return [
    ...fold(messages.slice(0, open)),
    { kind: "message", message: openMessage, expanded: true },
    ...fold(messages.slice(open + 1)),
  ];
}
