/** @deprecated Import CalendarApiService from "@workspace/calendar-client"; this file only adds the web default instance. */
export { CalendarApiService } from "@workspace/calendar-client";

import { CalendarApiService } from "@workspace/calendar-client";
import { httpClient } from "./api-clients";
import { WebE2eeProvider } from "./web-e2ee-provider";

// Default web instance with the web E2EE provider
export const calendarApiService = new CalendarApiService(
  httpClient,
  new WebE2eeProvider(),
);
