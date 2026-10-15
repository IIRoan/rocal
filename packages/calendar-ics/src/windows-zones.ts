import WINDOWS_ZONES from "./windows-zones.json";
import { normalizeIcsTimezone } from "./index";

/** Where an event is filed (always a tz database zone) and the zone or offset its wall times are read in. */
export interface IcsEventZone {
  timezone: string;
  readIn: string;
}

type Table = Record<string, { iana: string[] }>;

const normalizeLabel = (label: string) =>
  label.replace(/\s+/g, " ").trim().toLowerCase();

/** The solace-server reader's index: each label, the label without its "(UTC±hh:mm)" prefix, and that prefix-less label's comma parts. */
const INDEX = new Map<string, string>();
for (const label of Object.keys(WINDOWS_ZONES as Table).sort()) {
  const iana = (WINDOWS_ZONES as Table)[label]?.iana[0];
  if (!iana) continue;
  const add = (variant: string) => {
    const key = normalizeLabel(variant);
    if (key && !INDEX.has(key)) INDEX.set(key, iana);
  };
  add(label);
  const bare = label.replace(/^\((?:utc|gmt)[^)]*\)\s*/i, "");
  if (bare !== label) {
    add(bare);
    if (bare.includes(",")) bare.split(",").forEach(add);
  }
}

function windowsZone(label: string): string | undefined {
  const exact = (WINDOWS_ZONES as Table)[label]?.iana[0];
  if (exact) return exact;
  const indexed = INDEX.get(normalizeLabel(label));
  if (indexed) return indexed;
  if (!label.includes(",")) return undefined;
  return label
    .split(",")
    .map((part) => INDEX.get(normalizeLabel(part)))
    .find(Boolean);
}

/** "+05:30", "UTC-4", "(UTC+02:00) City" as signed minutes within ±14:00. */
function offsetMinutes(label: string): number | undefined {
  const text = label.trim();
  const found = text.startsWith("(")
    ? /([+-]\d{1,2}:\d{2})/.exec(text)?.[1]
    : text
        .replace(/^\(?(?:utc|gmt)\)?/i, "")
        .replace(/\)$/, "")
        .trim();
  const match = found ? /^([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(found) : null;
  if (!match) return undefined;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? 0);
  if (minutes >= 60 || hours > 14 || (hours === 14 && minutes !== 0))
    return undefined;
  const total = hours * 60 + minutes;
  return match[1] === "-" ? -total : total;
}

function isNamedZone(zone: string): boolean {
  if (/^[+-]\d/.test(zone)) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** A TZID as solace-server files it: an IANA name, a Windows name or label through CLDR's table, a whole-hour offset as Etc/GMT±N, else the user's zone. */
export function resolveIcsEventZone(
  tzid: string | undefined,
  fallback: string,
): IcsEventZone {
  const zone = normalizeIcsTimezone(tzid);
  if (!zone) return { timezone: fallback, readIn: fallback };
  if (isNamedZone(zone)) return { timezone: zone, readIn: zone };
  const mapped = windowsZone(zone);
  if (mapped && isNamedZone(mapped))
    return { timezone: mapped, readIn: mapped };
  const minutes = offsetMinutes(zone);
  if (minutes === undefined) return { timezone: fallback, readIn: fallback };
  const hours = Math.abs(minutes) / 60;
  if (minutes % 60 === 0) {
    const etc =
      minutes === 0 ? "Etc/GMT" : `Etc/GMT${minutes > 0 ? "-" : "+"}${hours}`;
    return { timezone: etc, readIn: etc };
  }
  const pad = (value: number) => String(Math.floor(value)).padStart(2, "0");
  const offset = `${minutes < 0 ? "-" : "+"}${pad(hours)}:${pad(Math.abs(minutes) % 60)}`;
  return { timezone: fallback, readIn: offset };
}
