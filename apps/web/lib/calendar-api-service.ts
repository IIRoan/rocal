/**
 * @deprecated Import `CalendarApiService` from "@workspace/calendar-client" instead.
 * This file provides a web-specific default instance for backwards compatibility.
 */
export { CalendarApiService } from "@workspace/calendar-client";

import { CalendarApiService } from "@workspace/calendar-client";
import { httpClient } from "./http-client";
import { WebE2eeProvider } from "./web-e2ee-provider";
import { getApiBaseUrl } from "./api-url";
import type { ApiError } from "./types/calendar";

/**
 * Web-specific extension of CalendarApiService that adds browser-only
 * methods like ICS file download.
 */
class WebCalendarApiService extends CalendarApiService {
  async downloadEventICS(id: string): Promise<void> {
    const apiBaseUrl = getApiBaseUrl().replace(/\/+$/, "");
    const response = await fetch(
      `${apiBaseUrl}/api/events/${encodeURIComponent(id)}/ics`,
      {
        method: "GET",
        credentials: "include",
      },
    );

    if (!response.ok) {
      let message = "Failed to download ICS file";
      try {
        const maybeJson = await response.json();
        if (
          typeof maybeJson?.message === "string" &&
          maybeJson.message.trim()
        ) {
          message = maybeJson.message.trim();
        }
      } catch {
        // Ignore parse failures, keep generic message.
      }

      throw {
        error: "Download Error",
        message,
        statusCode: response.status,
      } as ApiError;
    }

    const blob = await response.blob();
    const fallbackFilename = "event.ics";
    const contentDisposition =
      response.headers.get("content-disposition") || "";
    const filenameMatch = /filename="?([^"]+)"?/i.exec(contentDisposition);
    const filename = filenameMatch?.[1] || fallbackFilename;

    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(objectUrl);
  }
}

// Default web instance with web-specific E2EE provider and ICS download
export const calendarApiService = new WebCalendarApiService(
  httpClient,
  new WebE2eeProvider(),
);
