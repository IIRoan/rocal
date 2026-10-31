import { buildIcsCalendar } from "@workspace/calendar-ics";
import { z } from "./zod";

const RIFTBOUND_ORIGIN = "https://playriftbound.com";
const riftboundEventIdSchema = z.string().regex(/^\d{1,30}$/);
const riftboundDurationSchema = z.number().int().min(1).max(1440);

const textSchema = z
  .string()
  .trim()
  .max(1000)
  .regex(/^[^\u0000-\u001f\u007f]*$/);
const instantSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
const eventSchema = z.strictObject({
  id: riftboundEventIdSchema,
  title: textSchema.min(1),
  start: instantSchema,
  location: textSchema,
});

export type RiftboundEvent = z.infer<typeof eventSchema>;

function riftboundEventUrl(id: string): string {
  return `${RIFTBOUND_ORIGIN}/en-US/events/${riftboundEventIdSchema.parse(id)}`;
}

export function parseRiftboundEventUrl(value: string): string {
  const url = new URL(value);
  if (
    url.origin !== RIFTBOUND_ORIGIN ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Use a public Play Riftbound event URL without query parameters.",
    );
  }
  const match = /^\/[a-z]{2}-[a-z]{2}\/events\/(\d{1,30})\/?$/i.exec(
    url.pathname,
  );
  return riftboundEventIdSchema.parse(match?.[1]);
}

export function buildRiftboundIcs(
  input: RiftboundEvent[],
  durationMinutes: number,
): string {
  const events = z.array(eventSchema).max(2000).parse(input);
  const duration = riftboundDurationSchema.parse(durationMinutes);
  const unique = new Map<string, RiftboundEvent>();
  for (const event of events) {
    const previous = unique.get(event.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(event)) {
      throw new Error("Conflicting Riftbound event records.");
    }
    unique.set(event.id, event);
  }
  return buildIcsCalendar({
    calendar: { name: "Riftbound" },
    events: [...unique.values()]
      .sort(
        (a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id),
      )
      .map((event) => ({
        uid: `riftbound-${event.id}@playriftbound.com`,
        title: event.title,
        start: new Date(event.start),
        end: new Date(Date.parse(event.start) + duration * 60_000),
        location: event.location,
        sourceUrl: riftboundEventUrl(event.id),
        description: `${riftboundEventUrl(event.id)}\n\nDuration: ${duration} minutes. Check current registration and waitlist status on Play Riftbound.`,
      })),
  });
}
