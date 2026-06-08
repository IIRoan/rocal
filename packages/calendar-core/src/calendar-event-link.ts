const EVENT_ID_LINE_REGEX =
  /\bEvent\s+ID\s*:\s*([A-Za-z0-9][A-Za-z0-9_.:-]{2,})\b/i;
const EVENT_QUERY_REGEX = /[?&]eventId=([^&#\s<>"']+)/i;
const SOLACE_REMINDER_SUBJECT_REGEX =
  /\b(?:encrypted event|event reminder)\b/i;
const REMINDER_LEAD_TIME_REGEX =
  /\b(\d+)\s+minutes?\b/i;

export type CalendarEventLinkSource = {
  subject?: string | null;
  bodies?: Array<string | null | undefined>;
};

function cleanEventId(value: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value).trim();
  } catch {
    decoded = value.trim();
  }
  const cleaned = decoded.replace(/[),.;\]]+$/g, "");
  return cleaned.length > 0 ? cleaned : null;
}

export function extractLinkedCalendarEventId(
  source: CalendarEventLinkSource,
): string | null {
  const candidates = [
    source.subject ?? "",
    ...(source.bodies ?? []),
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const lineMatch = EVENT_ID_LINE_REGEX.exec(candidate);
    if (lineMatch?.[1]) {
      return cleanEventId(lineMatch[1]);
    }

    const queryMatch = EVENT_QUERY_REGEX.exec(candidate);
    if (queryMatch?.[1]) {
      return cleanEventId(queryMatch[1]);
    }
  }

  return null;
}

export function isSolaceEventReminderEmail(
  source: CalendarEventLinkSource,
): boolean {
  if (!extractLinkedCalendarEventId(source)) {
    return false;
  }

  const subject = source.subject ?? "";
  if (SOLACE_REMINDER_SUBJECT_REGEX.test(subject)) {
    return true;
  }

  const combinedBodies = (source.bodies ?? []).join("\n");
  return (
    EVENT_ID_LINE_REGEX.test(combinedBodies) &&
    /\bOpen\s+event\b/i.test(combinedBodies)
  );
}

export function extractReminderLeadMinutes(
  source: CalendarEventLinkSource,
): number | null {
  const candidates = [
    source.subject ?? "",
    ...(source.bodies ?? []),
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const match = REMINDER_LEAD_TIME_REGEX.exec(candidate);
    if (match?.[1]) {
      const minutes = Number.parseInt(match[1], 10);
      if (Number.isFinite(minutes) && minutes >= 0) {
        return minutes;
      }
    }
  }

  return null;
}
