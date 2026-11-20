import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { CalendarEvent } from "@workspace/calendar-core";
import {
  buildEventIcsExport,
  type EventIcsExport,
} from "@workspace/calendar-core/event-ics-export";
import { createLogger } from "@workspace/logger";

const ICS_MIME_TYPE = "text/calendar";
const ICS_UTI = "com.apple.ical.ics";
const ICS_EXPORT_DIRECTORY = "ics-export";

const log = createLogger("native:ics-export");

function removeIcsExportDirectory(): void {
  const directory = new Directory(Paths.cache, ICS_EXPORT_DIRECTORY);
  if (directory.exists) {
    directory.delete();
  }
}

/** Removes plaintext exports a killed share sheet left behind, including earlier builds' loose cache-root copies; logs instead of throwing so launch and sign-out never stall on it. */
export async function clearIcsExportCache(): Promise<void> {
  try {
    removeIcsExportDirectory();
    for (const entry of Paths.cache.list()) {
      if (entry instanceof File && entry.name.endsWith(".ics")) entry.delete();
    }
  } catch (error) {
    log.warn("Could not clear the calendar export folder", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
  }
}

/** Writes the decrypted .ics to its own cache folder only for the share sheet and deletes it afterwards, so no plaintext copy stays on disk. */
export async function shareIcsFile({ icsContent, filename }: EventIcsExport): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device.");
  }

  removeIcsExportDirectory();
  const directory = new Directory(Paths.cache, ICS_EXPORT_DIRECTORY);
  directory.create({ intermediates: true, idempotent: true });
  const file = new File(directory, filename);
  try {
    file.create({ overwrite: true });
    await file.write(icsContent);
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

export async function shareEventIcs(
  event: CalendarEvent,
  options: { calendarName?: string | null; timezone?: string | null } = {},
): Promise<void> {
  await shareIcsFile(buildEventIcsExport(event, options));
}
