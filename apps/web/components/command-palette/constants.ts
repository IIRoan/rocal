export type TimezoneOption = {
  value: string;
  label: string;
  searchText: string;
};

type TimezoneEntry = {
  value: string;
  name: string;
  region?: string;
};

const TIMEZONE_GROUP_ENTRIES: Record<string, TimezoneEntry[]> = {
  Popular: [
    { value: "UTC", name: "Coordinated Universal Time", region: "UTC" },
    {
      value: "Europe/Amsterdam",
      name: "Amsterdam",
      region: "Central European Time",
    },
    { value: "Europe/London", name: "London", region: "UK" },
    {
      value: "America/New_York",
      name: "New York",
      region: "Eastern Time",
    },
    {
      value: "America/Chicago",
      name: "Chicago",
      region: "Central Time",
    },
    {
      value: "America/Denver",
      name: "Denver",
      region: "Mountain Time",
    },
    {
      value: "America/Los_Angeles",
      name: "Los Angeles",
      region: "Pacific Time",
    },
    { value: "Asia/Tokyo", name: "Tokyo", region: "Japan" },
    { value: "Asia/Singapore", name: "Singapore" },
    { value: "Australia/Sydney", name: "Sydney" },
  ],
  Americas: [
    { value: "America/Anchorage", name: "Anchorage", region: "Alaska" },
    { value: "America/Phoenix", name: "Phoenix", region: "Arizona" },
    { value: "America/Toronto", name: "Toronto" },
    { value: "America/Vancouver", name: "Vancouver" },
    { value: "America/Mexico_City", name: "Mexico City" },
    { value: "America/Bogota", name: "Bogotá" },
    { value: "America/Lima", name: "Lima" },
    { value: "America/Caracas", name: "Caracas" },
    { value: "America/Santiago", name: "Santiago" },
    { value: "America/Sao_Paulo", name: "São Paulo" },
    { value: "America/Montevideo", name: "Montevideo" },
    {
      value: "America/Argentina/Buenos_Aires",
      name: "Buenos Aires",
    },
    { value: "America/Havana", name: "Havana" },
    { value: "America/Guatemala", name: "Guatemala City" },
    { value: "Pacific/Honolulu", name: "Honolulu", region: "Hawaii" },
  ],
  "Europe & Africa": [
    { value: "Europe/Dublin", name: "Dublin" },
    { value: "Europe/Lisbon", name: "Lisbon" },
    { value: "Europe/Paris", name: "Paris" },
    { value: "Europe/Brussels", name: "Brussels" },
    { value: "Europe/Berlin", name: "Berlin" },
    { value: "Europe/Rome", name: "Rome" },
    { value: "Europe/Madrid", name: "Madrid" },
    { value: "Europe/Vienna", name: "Vienna" },
    { value: "Europe/Zurich", name: "Zurich" },
    { value: "Europe/Stockholm", name: "Stockholm" },
    { value: "Europe/Oslo", name: "Oslo" },
    { value: "Europe/Copenhagen", name: "Copenhagen" },
    { value: "Europe/Helsinki", name: "Helsinki" },
    { value: "Europe/Warsaw", name: "Warsaw" },
    { value: "Europe/Prague", name: "Prague" },
    { value: "Europe/Athens", name: "Athens" },
    { value: "Europe/Bucharest", name: "Bucharest" },
    { value: "Europe/Istanbul", name: "Istanbul" },
    { value: "Europe/Moscow", name: "Moscow" },
    { value: "Africa/Cairo", name: "Cairo" },
    { value: "Africa/Johannesburg", name: "Johannesburg" },
    { value: "Africa/Lagos", name: "Lagos" },
    { value: "Africa/Nairobi", name: "Nairobi" },
  ],
  "Asia & Pacific": [
    { value: "Asia/Dubai", name: "Dubai" },
    { value: "Asia/Jerusalem", name: "Jerusalem" },
    { value: "Asia/Riyadh", name: "Riyadh" },
    { value: "Asia/Tehran", name: "Tehran" },
    { value: "Asia/Kolkata", name: "Mumbai", region: "India" },
    { value: "Asia/Karachi", name: "Karachi" },
    { value: "Asia/Dhaka", name: "Dhaka" },
    { value: "Asia/Bangkok", name: "Bangkok" },
    { value: "Asia/Jakarta", name: "Jakarta" },
    { value: "Asia/Hong_Kong", name: "Hong Kong" },
    { value: "Asia/Shanghai", name: "Shanghai" },
    { value: "Asia/Taipei", name: "Taipei" },
    { value: "Asia/Seoul", name: "Seoul" },
    { value: "Asia/Kuala_Lumpur", name: "Kuala Lumpur" },
    { value: "Asia/Manila", name: "Manila" },
    { value: "Australia/Perth", name: "Perth" },
    { value: "Australia/Adelaide", name: "Adelaide" },
    { value: "Australia/Brisbane", name: "Brisbane" },
    { value: "Australia/Melbourne", name: "Melbourne" },
    { value: "Pacific/Auckland", name: "Auckland" },
    { value: "Pacific/Fiji", name: "Fiji" },
  ],
};

const TIMEZONE_SEARCH_ALIASES: Partial<Record<string, string[]>> = {
  "Europe/Amsterdam": ["cest", "cet"],
  "Europe/Berlin": ["cest", "cet"],
  "Europe/Brussels": ["cest", "cet"],
  "Europe/Paris": ["cest", "cet"],
  "Europe/Rome": ["cest", "cet"],
  "Europe/Madrid": ["cest", "cet"],
  "Europe/Vienna": ["cest", "cet"],
  "Europe/Zurich": ["cest", "cet"],
  "Europe/Stockholm": ["cest", "cet"],
  "Europe/Oslo": ["cest", "cet"],
  "Europe/Copenhagen": ["cest", "cet"],
  "Europe/Warsaw": ["cest", "cet"],
  "Europe/Prague": ["cest", "cet"],
  "Europe/Athens": ["eest", "eet"],
  "Europe/Helsinki": ["eest", "eet"],
  "Europe/London": ["bst", "gmt"],
  "Europe/Dublin": ["ist", "gmt"],
  "America/New_York": ["est", "edt"],
  "America/Chicago": ["cst", "cdt"],
  "America/Denver": ["mst", "mdt"],
  "America/Los_Angeles": ["pst", "pdt"],
};

function getTimezoneDisplayParts(
  timezone: string,
  date = new Date(),
): { abbreviation: string; offset: string } {
  try {
    const abbreviation =
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        timeZoneName: "short",
      })
        .formatToParts(date)
        .find((part) => part.type === "timeZoneName")?.value ?? "";

    const offsetRaw =
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        timeZoneName: "shortOffset",
      })
        .formatToParts(date)
        .find((part) => part.type === "timeZoneName")?.value ?? "";

    return {
      abbreviation,
      offset: offsetRaw.replace(/^GMT/, "UTC"),
    };
  } catch {
    return { abbreviation: "", offset: "" };
  }
}

function buildTimezoneOption(
  entry: TimezoneEntry,
  date = new Date(),
): TimezoneOption {
  if (entry.value === "UTC") {
    return {
      value: entry.value,
      label: "UTC (Coordinated Universal Time)",
      searchText: "utc coordinated universal time gmt",
    };
  }

  const title = entry.region ? `${entry.region} (${entry.name})` : entry.name;
  const { abbreviation, offset } = getTimezoneDisplayParts(entry.value, date);
  const label = [title, abbreviation, offset].filter(Boolean).join(" · ");

  return {
    value: entry.value,
    label,
    searchText: [
      entry.value,
      entry.name,
      entry.region,
      abbreviation,
      offset,
      label,
      ...(TIMEZONE_SEARCH_ALIASES[entry.value] ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  };
}

export function getTimezonePickerGroups(
  date = new Date(),
): Record<string, TimezoneOption[]> {
  const groups: Record<string, TimezoneOption[]> = {};

  for (const [groupName, entries] of Object.entries(TIMEZONE_GROUP_ENTRIES)) {
    groups[groupName] = entries.map((entry) => buildTimezoneOption(entry, date));
  }

  return groups;
}

export function getAllTimezonePickerOptions(
  date = new Date(),
): TimezoneOption[] {
  return Object.values(getTimezonePickerGroups(date)).flat();
}

export function getTimezonePickerLabel(
  timezone: string,
  date = new Date(),
): string {
  for (const entries of Object.values(TIMEZONE_GROUP_ENTRIES)) {
    const entry = entries.find((item) => item.value === timezone);
    if (entry) {
      return buildTimezoneOption(entry, date).label;
    }
  }

  const { abbreviation, offset } = getTimezoneDisplayParts(timezone, date);
  return [timezone.replaceAll("_", " "), abbreviation, offset]
    .filter(Boolean)
    .join(" · ");
}

export const TIMEZONE_GROUPS = getTimezonePickerGroups();

export const ALL_TIMEZONES = getAllTimezonePickerOptions();

export const SETTINGS_PANEL_STYLE = {
  minHeight: "320px",
  maxHeight: "calc(100dvh - 200px)",
} as const;

export const WORKING_DAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

export type PaletteView =
  | "main"
  | "appearance"
  | "time-region"
  | "timezone"
  | "notifications"
  | "calendar-defaults"
  | "account"
  | "security"
  | "passkeys"
  | "calendars"
  | "calendar-create"
  | "calendar-edit"
  | "subscriptions"
  | "subscriptions-add-feed"
  | "subscriptions-holidays"
  | "subscriptions-edit"
  | "events"
  | "event-editor"
  | "invites"
  | "search";
