// Regenerates the ICS goldens from the TypeScript backend: bun --no-env-file generate.ts <checkout with node_modules>.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

process.env.TZ = "UTC";
const checkout = resolve(process.argv[2] ?? join(import.meta.dir, "../../../../.."));
const fixtures = import.meta.dir;
console.warn = () => {};

const { parseICSFile } = await import(join(checkout, "apps/backend/lib/ics-parser.ts"));
for (const name of readdirSync(fixtures).filter((file) => file.endsWith(".ics")).sort()) {
  const content = readFileSync(join(fixtures, name), "utf8");
  const results: Record<string, unknown> = {};
  for (const zone of ["UTC", "Europe/Amsterdam", "America/Los_Angeles"]) {
    const result = parseICSFile(content, zone);
    results[zone] = {
      ...result,
      events: result.events.map((event: { recurrence?: unknown }) => ({
        ...event,
        recurrenceJson: event.recurrence ? JSON.stringify(event.recurrence) : undefined,
      })),
    };
  }
  writeFileSync(join(fixtures, name.replace(/\.ics$/, ".parsed.json")), `${JSON.stringify(results, null, 2)}\n`);
}

const build = JSON.parse(readFileSync(join(fixtures, "builder/cases.json"), "utf8"));
const exported = JSON.parse(readFileSync(join(fixtures, "export/cases.json"), "utf8"));
const fixed = Date.parse(build.dtstamp);
const RealDate = Date;
class FixedDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(fixed);
    else super(...(args as [string]));
  }
  static now() {
    return fixed;
  }
}
globalThis.Date = FixedDate as DateConstructor;
const { buildIcsCalendar, buildIcsEventFile } = await import(join(checkout, "packages/calendar-ics/src/index.ts"));
const { toIcsBuildEvent } = await import(join(checkout, "apps/backend/lib/ics-export.ts"));
const withDates = (record: Record<string, unknown>) => {
  const copy: Record<string, unknown> = { ...record };
  for (const key of ["start", "end", "createdAt", "updatedAt"]) {
    if (typeof copy[key] === "string") copy[key] = new Date(copy[key] as string);
  }
  return copy;
};

for (const testCase of build.cases) {
  const ics = buildIcsCalendar({ calendar: testCase.calendar, events: testCase.events.map(withDates) });
  writeFileSync(join(fixtures, "builder", `${testCase.name}.ics`), ics);
}
for (const testCase of exported.cases) {
  const row = withDates(testCase.event);
  row.participants = (row.participants as Record<string, unknown>[]).map((participant) => ({
    ...participant,
    eventId: row.id,
    userId: null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
  const ics = buildIcsEventFile({ calendar: testCase.calendar, event: toIcsBuildEvent(row) });
  writeFileSync(join(fixtures, "export", `${testCase.name}.ics`), ics);
}
