import type { JmapEmailMessage } from "./types";
import { extractMessageBodies } from "./message-security";

const EVENT_ID_LINE_REGEX =
  /\bEvent\s+ID\s*:\s*([A-Za-z0-9][A-Za-z0-9_.:-]{2,})\b/i;
const EVENT_QUERY_REGEX = /[?&]eventId=([^&#\s<>"']+)/i;

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
  message: JmapEmailMessage,
): string | null {
  const bodies = extractMessageBodies(message);
  const candidates = [
    message.subject ?? "",
    bodies.text ?? "",
    bodies.html ?? "",
    ...Object.values(message.bodyValues ?? {}).map((bodyValue) =>
      bodyValue.value ?? "",
    ),
  ];

  for (const candidate of candidates) {
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
