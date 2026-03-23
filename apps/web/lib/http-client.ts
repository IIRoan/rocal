import { ApiError } from "./types/calendar";
import { getApiBaseUrl } from "./api-url";

export interface HttpClientOptions {
  baseURL?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
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

  constructor(options: HttpClientOptions = {}) {
    this.baseURL = getApiBaseUrl();
    this.timeout = options.timeout || 10000; // 10 seconds
    this.retries = options.retries || 3;
    this.retryDelay = options.retryDelay || 1000; // 1 second
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isRetryableError(error: any): boolean {
    // Retry on network errors, timeouts, and 5xx server errors
    if (error.name === "TypeError" || error.name === "AbortError") {
      return true;
    }

    if (error.status >= 500 && error.status < 600) {
      return true;
    }

    // Retry on specific 4xx errors that might be transient
    if (error.status === 408 || error.status === 429) {
      return true;
    }

    return false;
  }

  private async parseErrorResponse(response: Response): Promise<ApiError> {
    try {
      const errorText = await response.text();
      console.error(`HTTP ${response.status} Error Response:`, errorText);

      // Try to parse as JSON
      let errorData: any;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        // If not JSON, create a structured error
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

      console.error(`API Error [${response.url}]:`, apiError);
      return apiError;
    } catch (parseError) {
      console.error("Failed to parse error response:", parseError);
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

    let lastError: any;

    for (let attempt = 0; attempt <= retries; attempt++) {
      // Create a fresh controller and timeout for each attempt
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
        // Use our controller's signal so we still manage retries/timeouts
        signal: controller.signal,
        credentials: "include", // Include cookies for session authentication
        headers: {
          "Content-Type": "application/json",
          ...(fetchOptions as RequestInit).headers,
        },
      };

      try {
        const response = await fetch(fullUrl, requestOptions);
        clearTimeout(timeoutId);
        // Clean up external abort listener to avoid leaks
        if (abortListener && externalSignal) {
          externalSignal.removeEventListener("abort", abortListener);
          abortListener = null;
        }

        if (!response.ok) {
          // Capture Retry-After header (if any) before consuming body
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

            // Add small jitter to avoid thundering herd
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

        // Transform date strings to Date objects
        return this.transformDates(data);
      } catch (error: any) {
        clearTimeout(timeoutId);
        // Clean up external abort listener to avoid leaks
        if (abortListener && externalSignal) {
          externalSignal.removeEventListener("abort", abortListener);
          abortListener = null;
        }
        lastError = error;

        // Don't retry authentication errors
        if (error?.statusCode === 401 || error?.statusCode === 403) {
          throw error;
        }

        if (attempt < retries && this.isRetryableError(error)) {
          let delayMs = this.retryDelay * Math.pow(2, attempt);
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
        // Transform common date field names
        if (
          (key === "start" ||
            key === "end" ||
            key === "createdAt" ||
            key === "updatedAt" ||
            key === "syncedAt") &&
          typeof value === "string"
        ) {
          const dateValue = new Date(value);
          // Debug date transformation for synced events
          if (key === "start" || key === "end") {
            console.log(`HTTP Client - Transforming ${key}:`, {
              original: value,
              transformed: dateValue.toString(),
              iso: dateValue.toISOString(),
            });
          }
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

// Default instance
export const httpClient = new HttpClient();
