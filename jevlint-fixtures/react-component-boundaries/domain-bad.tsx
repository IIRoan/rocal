export function SubscriptionPreview({ icsText }: { icsText: string }) {
  const lines = icsText.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const events: Array<{ title: string; startsAt: string }> = [];
  let current: { title: string; startsAt: string } | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = { title: "", startsAt: "" };
    } else if (line === "END:VEVENT" && current) {
      if (!current.startsAt) throw new Error("Missing event start");
      events.push(current);
      current = null;
    } else if (current) {
      const separator = line.indexOf(":");
      if (separator < 0) continue;
      const property = line.slice(0, separator);
      const value = line.slice(separator + 1);
      if (property === "SUMMARY") current.title = value;
      if (property.startsWith("DTSTART")) current.startsAt = value;
    }
  }
  return <span>{events.length} events</span>;
}
