import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { CalendarEvent } from "@workspace/calendar-core";
import { buildEventIcsExport } from "@workspace/calendar-core/event-ics-export";

const ICS_MIME_TYPE = "text/calendar";
const ICS_UTI = "com.apple.ical.ics";

/** Writes the decrypted .ics to the cache only for the share sheet and deletes it afterwards, so no plaintext copy stays on disk. */
export async function shareEventIcs(
  event: CalendarEvent,
  options: { calendarName?: string | null; timezone?: string | null } = {},
): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device.");
  }

  const { icsContent, filename } = buildEventIcsExport(event, options);
  const file = new File(Paths.cache, filename);
  try {
    file.create({ overwrite: true });
    file.write(icsContent);
    await Sharing.shareAsync(file.uri, {
      mimeType: ICS_MIME_TYPE,
      dialogTitle: filename,
      ...(Platform.OS === "ios" ? { UTI: ICS_UTI } : null),
    });
  } finally {
    if (file.exists) {
      file.delete();
    }
  }
}
