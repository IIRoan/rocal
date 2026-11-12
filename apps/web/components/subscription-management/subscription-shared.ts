import {
  useCreateSubscriptionMutation,
  useSyncSubscriptionMutation,
  useUpdateSubscriptionMutation,
} from "@/hooks/use-subscriptions";
import type { Calendar, CalendarSubscription } from "@/lib/types/calendar";
import { z } from "@workspace/calendar-core/zod";
import {
  NATIONAL_HOLIDAY_CALENDARS,
  isLikelyIcsFeedUrl,
} from "@workspace/calendar-ics";
import { PRESET_COLORS } from "../command-palette/navigation-config";

const ALLOWED_COLOR_VALUES = PRESET_COLORS.map((c) => c.value);
const LAST_SYNC_RELATIVE = new Intl.RelativeTimeFormat(undefined, {
  numeric: "auto",
});

const isValidColor = (value: string) =>
  ALLOWED_COLOR_VALUES.includes(value) ||
  /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(value);

export const customSubscriptionSchema = z.object({
  name: z.string().trim().min(1, "Calendar name is required").max(100),
  url: z
    .string()
    .trim()
    .min(1, "Calendar URL is required")
    .pipe(
      z.url({
        error: "Enter a full URL, such as https://example.com/calendar.ics",
      }),
    )
    .refine((value) => isLikelyIcsFeedUrl(value), {
      error: "URL should point to a calendar feed",
    }),
  color: z
    .string()
    .trim()
    .refine(isValidColor, "Choose one of the preset colors"),
});

export const editableSubscriptionSchema = z.object({
  name: z.string().trim().min(1, "Calendar name is required").max(100),
  color: z
    .string()
    .trim()
    .refine(isValidColor, "Choose one of the preset colors"),
});

export type CustomSubscriptionForm = z.infer<typeof customSubscriptionSchema>;
export type HolidayCalendar = (typeof NATIONAL_HOLIDAY_CALENDARS)[number];
export function filterHolidayCalendars(query: string): HolidayCalendar[] {
  const search = query.trim().toLowerCase();
  return NATIONAL_HOLIDAY_CALENDARS.filter(
    (holidayCalendar) =>
      !search ||
      [
        holidayCalendar.label,
        holidayCalendar.countryName,
        holidayCalendar.language,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search),
  );
}

export function formatLastSync(lastSyncAt?: string) {
  if (!lastSyncAt) return "never";

  const date = new Date(lastSyncAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return LAST_SYNC_RELATIVE.format(-diffMins, "minute");
  if (diffHours < 24) return LAST_SYNC_RELATIVE.format(-diffHours, "hour");
  if (diffDays < 7) return LAST_SYNC_RELATIVE.format(-diffDays, "day");

  return date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export type SubscriptionFormErrors = { name?: string; url?: string };
export type SubscriptionEditErrors = { name?: string; color?: string };
export type PendingSubscriptionDeletion = { id: string; name: string } | null;
export type SubscriptionViewProps = {
  subscriptions: CalendarSubscription[];
  calendars: Calendar[];
  refetchCalendars: () => Promise<unknown>;
  onBack: () => void;
  onDelete: (subscription: CalendarSubscription) => void;
  loading: boolean;
  queryError: unknown;
  onRetry: () => void;
  createMutation: ReturnType<typeof useCreateSubscriptionMutation>;
  updateMutation: ReturnType<typeof useUpdateSubscriptionMutation>;
  syncMutation: ReturnType<typeof useSyncSubscriptionMutation>;
};

export function resolveSubscriptionEditValues(
  subscription: CalendarSubscription | null,
  calendar: Calendar | undefined,
  override: { name?: string; color?: string },
) {
  return {
    name: override.name ?? subscription?.calendar.name ?? calendar?.name ?? "",
    color:
      override.color ?? subscription?.calendar.color ?? calendar?.color ?? "",
    isHoliday:
      subscription?.calendar.kind === "public_holiday" ||
      calendar?.kind === "public_holiday",
  };
}
