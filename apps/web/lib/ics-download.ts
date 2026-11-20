import type { EventIcsExport } from "@workspace/calendar-core/event-ics-export";

/** Downloads an .ics built in the browser through an in-memory Blob, so its content never reaches the server. */
export function saveIcsFile({ icsContent, filename }: EventIcsExport): void {
  const objectUrl = URL.createObjectURL(
    new Blob([icsContent], { type: "text/calendar" }),
  );
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
