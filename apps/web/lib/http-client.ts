/**
 * @deprecated Import `HttpClient` from "@workspace/calendar-client" instead.
 * This file provides a web-specific default instance for backwards compatibility.
 */
export { HttpClient } from "@workspace/calendar-client";
export type { HttpClientConfig, RequestOptions } from "@workspace/calendar-client";

import { HttpClient } from "@workspace/calendar-client";
import { getApiBaseUrl } from "./api-url";

// Default web instance with cookie-based auth and web API base URL
export const httpClient = new HttpClient({
  baseURL: getApiBaseUrl(),
});
