import {
  isPasskeyStepUpRequiredError,
  type ApiError,
} from "@workspace/calendar-core";
import { createLogger } from "@workspace/logger";

const log = createLogger("http-client");

export interface HttpClientConfig {
  /** Base URL for all API requests (e.g. "http://localhost:4001"). */
  baseURL: string;
  /** Request timeout in milliseconds. Defaults to 10 000. */
  timeout?: number;
  /** Maximum number of retries on retryable errors. Defaults to 3. */
  retries?: number;
  /** Base delay between retries in milliseconds. Defaults to 1 000. */
  retryDelay?: number;
  /** Fetch credentials mode. Defaults to "include". */
  credentials?: RequestCredentials;
  /** Extra headers merged into every request, for platform-specific auth (e.g. Bearer tokens on native). */
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
  /** Optional callback invoked when the API returns 401. */
  onAuthError?: (statusCode: 401) => void;
  /** Optional callback invoked when passkey step-up is required. */
  onPasskeyStepUpRequired?: () => void;
}

export interface RequestOptions extends RequestInit {
  timeout?: number;
  retries?: number;
}

/** Parsed JSON error body, or null when the body is not JSON at all (callers then fall back to the raw text). */
function asJsonRecord(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return null;
  }
}

/** Non-empty string field, or undefined when the API sent something else. */
function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export class HttpClient {
  private baseURL: string;
  private timeout: number;
  private retries: number;
  private retryDelay: number;
  private credentials: RequestCredentials;
  private getHeaders?: () =>
    | Record<string, string>
    | Promise<Record<string, string>>;
  private onAuthError?: (statusCode: 401) => void;
  private onPasskeyStepUpRequired?: () => void;

  constructor(config: HttpClientConfig) {
    this.baseURL = config.baseURL;
    this.timeout = config.timeout ?? 10_000;
    this.retries = config.retries ?? 3;
    this.retryDelay = config.retryDelay ?? 1_000;
    this.credentials = config.credentials ?? "include";
    this.getHeaders = config.getHeaders;
    this.onAuthError = config.onAuthError;
    this.onPasskeyStepUpRequired = config.onPasskeyStepUpRequired;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private errorName(error: unknown): string {
    return error instanceof Error ? error.name : "";
  }

  /** Status from either `status` (Response-like) or `statusCode` (ApiError). */
  private errorStatus(error: unknown): number | undefined {
    if (typeof error !== "object" || error === null) {
      return undefined;
    }
    const record = error as { status?: unknown; statusCode?: unknown };
    if (typeof record.status === "number") {
      return record.status;
    }
    return typeof record.statusCode === "number" ? record.statusCode : undefined;
  }

  private isRetryableError(error: unknown): boolean {
    // Retry on network errors and timeouts
    const name = this.errorName(error);
    if (name === "TypeError" || name === "AbortError") {
      return true;
    }

    const status = this.errorStatus(error);

    // Retry on 5xx server errors
    if (status !== undefined && status >= 500 && status < 600) {
      return true;
    }

    // Retry on specific 4xx errors that might be transient
    if (status === 408 || status === 429) {
      return true;
    }

    return false;
  }

  private logHttpError(response: Response, details: unknown): void {
    const message = `HTTP ${response.status} Error Response:`;

    if (response.status >= 500) {
      log.error(message, details);
      return;
    }

    log.warn(message, details);
  }

  private async parseErrorResponse(response: Response): Promise<ApiError> {
    try {
      const errorText = await response.text();
      this.logHttpError(response, errorText);

      const parsed = asJsonRecord(errorText);
      const fallbackMessage = parsed
        ? response.statusText
        : errorText || response.statusText;

      const apiError: ApiError = {
        error: asNonEmptyString(parsed?.error) ?? "HTTP Error",
        message:
          asNonEmptyString(parsed?.message) ??
          (fallbackMessage || `HTTP ${response.status}`),
        statusCode: response.status,
        details: parsed?.details ?? [],
      };

      this.logHttpError(response, {
        url: response.url,
        ...apiError,
      });
      return apiError;
    } catch (parseError) {
      log.error("Failed to parse error response:", parseError);
      return {
        error: "HTTP Error",
        message: response.statusText || `HTTP ${response.status}`,
        statusCode: response.status,
      };
    }
  }

  private async makeRequest<T>(
    url: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const {
      timeout = this.timeout,
      retries = this.retries,
      ...fetchOptions
    } = options;

    const fullUrl = url.startsWith("http") ? url : `${this.baseURL}${url}`;

    // Resolve platform-specific headers once per request
    const extraHeaders = this.getHeaders ? await this.getHeaders() : {};

    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      // Wire external AbortSignal (if provided) to our internal controller
      const externalSignal = (fetchOptions as RequestInit).signal as
        | AbortSignal
        | undefined;
      let abortListener: (() => void) | null = null;
      if (externalSignal) {
        if (externalSignal.aborted) {
          controller.abort();
        } else {
          abortListener = () => controller.abort();
          externalSignal.addEventListener("abort", abortListener, {
            once: true,
          });
        }
      }

      const rawBody = (fetchOptions as RequestInit).body;
      const hasBody = rawBody !== undefined && rawBody !== null && rawBody !== "";

      const requestOptions: RequestInit = {
        ...fetchOptions,
        signal: controller.signal,
        credentials: this.credentials,
        headers: {
          // Only set JSON Content-Type when a body is present. Empty DELETE/GET with application/json makes Elysia try to parse and return 400 PARSE.
          ...(hasBody ? { "Content-Type": "application/json" } : {}),
          ...extraHeaders,
          ...(fetchOptions as RequestInit).headers,
        },
      };

      try {
        const response = await fetch(fullUrl, requestOptions);
        clearTimeout(timeoutId);
        if (abortListener && externalSignal) {
          externalSignal.removeEventListener("abort", abortListener);
          abortListener = null;
        }

        if (!response.ok) {
          const retryAfterHeader = response.headers.get("retry-after");
          const error = await this.parseErrorResponse(response);

          // Don't retry authentication errors
          if (response.status === 401 || response.status === 403) {
            throw error;
          }

          const retryable = this.isRetryableError(error);
          if (attempt < retries && retryable) {
            let delayMs = this.retryDelay * Math.pow(2, attempt);

            // Respect Retry-After for 429/503 if server provides it
            if (retryAfterHeader) {
              const seconds = parseInt(retryAfterHeader, 10);
              if (!isNaN(seconds)) {
                delayMs = Math.max(delayMs, seconds * 1000);
              } else {
                const targetTime = Date.parse(retryAfterHeader);
                if (!isNaN(targetTime)) {
                  delayMs = Math.max(delayMs, targetTime - Date.now());
                }
              }
            }

            const jitter = Math.floor(Math.random() * 250);
            await this.delay(Math.max(0, delayMs) + jitter);
            continue;
          }

          throw error;
        }

        // Handle empty responses (like DELETE operations)
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          return {} as T;
        }

        const data: unknown = await response.json();
        // The caller's `T` is the declared contract for this endpoint's payload.
        return this.transformDates(data) as T;
      } catch (error) {
        clearTimeout(timeoutId);
        if (abortListener && externalSignal) {
          externalSignal.removeEventListener("abort", abortListener);
          abortListener = null;
        }
        lastError = error;

        // Don't retry authentication errors
        const statusCode = this.errorStatus(error);
        if (statusCode === 401 || statusCode === 403) {
          if (statusCode === 401) {
            this.onAuthError?.(401);
          }
          if (isPasskeyStepUpRequiredError(error)) {
            this.onPasskeyStepUpRequired?.();
          }
          throw error;
        }

        if (attempt < retries && this.isRetryableError(error)) {
          const delayMs = this.retryDelay * Math.pow(2, attempt);
          const jitter = Math.floor(Math.random() * 250);
          await this.delay(delayMs + jitter);
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }

  private transformDates(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.transformDates(item));
    }

    if (typeof value === "object") {
      const transformed: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (key === "blindIndexTokens" && typeof item === "string") {
          try {
            const parsed = JSON.parse(item);
            transformed[key] = Array.isArray(parsed) ? parsed : [];
          } catch {
            transformed[key] = [];
          }
          continue;
        }

        if (
          (key === "start" ||
            key === "end" ||
            key === "createdAt" ||
            key === "updatedAt" ||
            key === "syncedAt" ||
            key === "lastSeenAt") &&
          typeof item === "string"
        ) {
          const dateValue = new Date(item);
          transformed[key] = dateValue;
        } else {
          transformed[key] = this.transformDates(item);
        }
      }
      return transformed;
    }

    return value;
  }

  async get<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.makeRequest<T>(url, { ...options, method: "GET" });
  }

  async post<T>(url: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.makeRequest<T>(url, {
      ...options,
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(url: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.makeRequest<T>(url, {
      ...options,
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.makeRequest<T>(url, { ...options, method: "DELETE" });
  }
}
