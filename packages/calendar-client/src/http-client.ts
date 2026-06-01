import type { ApiError } from "@workspace/calendar-core";
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
  /**
   * Optional callback that returns extra headers to merge into every request.
   * Useful for platform-specific auth headers (e.g. Bearer tokens on native).
   */
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
  /** Optional callback invoked when the API returns 401. */
  onAuthError?: (statusCode: 401) => void;
}

export interface RequestOptions extends RequestInit {
  timeout?: number;
  retries?: number;
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

  constructor(config: HttpClientConfig) {
    this.baseURL = config.baseURL;
    this.timeout = config.timeout ?? 10_000;
    this.retries = config.retries ?? 3;
    this.retryDelay = config.retryDelay ?? 1_000;
    this.credentials = config.credentials ?? "include";
    this.getHeaders = config.getHeaders;
    this.onAuthError = config.onAuthError;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isRetryableError(error: any): boolean {
    // Retry on network errors and timeouts
    if (error.name === "TypeError" || error.name === "AbortError") {
      return true;
    }

    // Resolve the status from either `status` (Response-like) or `statusCode` (ApiError)
    const status: number | undefined = error.status ?? error.statusCode;

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

      let errorData: any;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = {
          error: "HTTP Error",
          message:
            errorText || response.statusText || `HTTP ${response.status}`,
        };
      }

      const apiError: ApiError = {
        error: errorData.error || "HTTP Error",
        message:
          errorData.message || response.statusText || `HTTP ${response.status}`,
        statusCode: response.status,
        details: errorData.details || [],
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

    let lastError: any;

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

      const requestOptions: RequestInit = {
        ...fetchOptions,
        signal: controller.signal,
        credentials: this.credentials,
        headers: {
          "Content-Type": "application/json",
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

        const data = await response.json();
        return this.transformDates(data);
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (abortListener && externalSignal) {
          externalSignal.removeEventListener("abort", abortListener);
          abortListener = null;
        }
        lastError = error;

        // Don't retry authentication errors
        if (error?.statusCode === 401 || error?.statusCode === 403) {
          if (error.statusCode === 401) {
            this.onAuthError?.(401);
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

  private transformDates(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.transformDates(item));
    }

    if (typeof obj === "object") {
      const transformed: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (key === "blindIndexTokens" && typeof value === "string") {
          try {
            const parsed = JSON.parse(value);
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
          typeof value === "string"
        ) {
          const dateValue = new Date(value);
          transformed[key] = dateValue;
        } else {
          transformed[key] = this.transformDates(value);
        }
      }
      return transformed;
    }

    return obj;
  }

  async get<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.makeRequest<T>(url, { ...options, method: "GET" });
  }

  async post<T>(url: string, data?: any, options?: RequestOptions): Promise<T> {
    return this.makeRequest<T>(url, {
      ...options,
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(url: string, data?: any, options?: RequestOptions): Promise<T> {
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
