import { z } from "./zod";
import type { Schema } from "@workspace/api-contracts";
import { formatReminderShort } from "./event-editor-options";

const plainText = z
  .string()
  .trim()
  .max(1000)
  .regex(/^[^\u0000-\u001f\u007f]*$/);
export const riftboundRiotIdSchema = plainText
  .min(3)
  .max(100)
  .regex(/^[^#]+#[^#\s]+$/, "Enter a Riot ID including #TAG.");
/** Stores live in sealed settings, whose size the API caps. */
export const riftboundStoreSchema = z.strictObject({
  id: z.guid(),
  name: plainText.min(1).max(200),
  address: plainText.max(200),
});
export type RiftboundStore = Schema<"RiftboundStore">;
export const riftboundPreferencesSchema = z
  .strictObject({
    enabled: z.boolean(),
    riotId: z.union([z.literal(""), riftboundRiotIdSchema]),
    stores: z.array(riftboundStoreSchema).max(10),
    calendarId: z.string().max(128),
    registeredOnly: z.boolean(),
    durationMinutes: z.number().int().min(1).max(1440),
  })
  .superRefine((value, context) => {
    if (!value.enabled) return;
    if (!value.calendarId)
      context.addIssue({
        code: "custom",
        message: "Choose a calendar.",
        path: ["calendarId"],
      });
    if (!value.stores.length)
      context.addIssue({
        code: "custom",
        message: "Add at least one frequent store.",
        path: ["stores"],
      });
    if (
      new Set(value.stores.map((store) => store.id)).size !==
      value.stores.length
    )
      context.addIssue({
        code: "custom",
        message: "Each store can only be added once.",
        path: ["stores"],
      });
    if (value.registeredOnly && !value.riotId)
      context.addIssue({
        code: "custom",
        message: "Enter your Riot ID for registration matching.",
        path: ["riotId"],
      });
  });
export type RiftboundPreferences = z.infer<typeof riftboundPreferencesSchema>;
export const DEFAULT_RIFTBOUND_PREFERENCES: RiftboundPreferences = {
  enabled: false,
  riotId: "",
  stores: [],
  calendarId: "",
  registeredOnly: false,
  durationMinutes: 240,
};

/** Copy both platforms show for the Riftbound settings. */
export const RIFTBOUND_SETTINGS_COPY = {
  importLabel: "Import Riftbound events",
  importDescription:
    "Past 30 days and upcoming, every 15 minutes while Calendar is open. No Riot login.",
  registeredLabel: "Only events I’m registered for",
  registeredDescription: "Waitlists don’t count.",
  registeredNote:
    "Solace sees imported event times, so it could match you to a public roster and learn your Riot ID.",
  riotIdHint: "Your exact roster name, including spaces and #TAG. Kept encrypted.",
  storesHint:
    "Paste any public Play Riftbound event link. Up to 10 stores; only public events near each venue are found.",
  storeError: "The store could not be found. Check the event link and try again.",
  noStores: "No stores yet.",
  noCalendars: "Create a calendar before enabling Riftbound.",
  durationHint:
    "Riftbound end times are often wrong, so imports use this length. Existing imports are never edited or deleted.",
} as const;

/** Event lengths offered for imports; a saved length outside the list stays selectable. */
export function riftboundDurationOptions(current: number) {
  return [...new Set([120, 180, 240, 360, 480, current])]
    .sort((a, b) => a - b)
    .map((minutes) => ({ value: minutes, label: formatReminderShort(minutes) }));
}

export function riftboundSyncMutationKey(scope: string | null) {
  return ["riftbound-sync", scope] as const;
}

export function normalizeRiftboundRiotId(value: string): string {
  const [name, tag] = riftboundRiotIdSchema
    .parse(value.normalize("NFKC"))
    .split("#");
  return `${name?.trim().toLowerCase()}#${tag?.trim().toLowerCase()}`;
}

export const riftboundPublicEventSchema = z.strictObject({
  id: z.string().regex(/^\d{1,30}$/),
  storeId: z.guid(),
  title: plainText.min(1),
  start: z.iso.datetime({ offset: true }),
  location: plainText,
  registeredRiotIdHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(2000),
});
export type RiftboundPublicEvent = Schema<"RiftboundPublicEvent">;
/** Riftbound event IDs this account already imported, sealed so deleted or moved copies stay gone. */
export const riftboundImportedIdsSchema = z
  .array(z.string().regex(/^\d{1,30}$/))
  .max(200);

/** Drops records that fail validation one by one, so one bad event never blocks the rest. */
export function selectRiftboundEvents(
  events: RiftboundPublicEvent[],
  config: RiftboundPreferences,
  identityHash: string,
) {
  const stores = new Set(config.stores.map((store) => store.id));
  return events.slice(0, 200).flatMap((event) => {
    const parsed = riftboundPublicEventSchema.safeParse(event);
    return parsed.success ? [parsed.data] : [];
  }).filter(
    (event) =>
      stores.has(event.storeId) &&
      (!config.registeredOnly ||
        event.registeredRiotIdHashes.includes(identityHash)),
  );
}

export function riftboundQueryAffected(
  key: readonly unknown[],
  events: { start: string }[],
  durationMinutes: number,
): boolean {
  if (key[0] !== "events" || typeof key[1] !== "string") return false;
  if (typeof key[2] === "string") {
    const start = Date.parse(key[1]),
      end = Date.parse(key[2]);
    return events.some(
      (event) =>
        Date.parse(event.start) < end &&
        Date.parse(event.start) + durationMinutes * 60_000 > start,
    );
  }
  const months = new Set<string>();
  for (const event of events) {
    const date = new Date(event.start);
    for (const offset of [-1, 0, 1])
      months.add(
        new Date(
          Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1),
        )
          .toISOString()
          .slice(0, 7),
      );
  }
  return months.has(key[1]);
}
