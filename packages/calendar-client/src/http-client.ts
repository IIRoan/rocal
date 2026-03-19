import type { ApiError } from "./types";
import { createLogger } from "@workspace/logger";

export interface HttpClientOptions {
  baseURL?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

type AuthCookieProvider = () => string | null | undefined;

let authCookieProvider: AuthCookieProvider | null = null;
let overriddenBaseURL: string | null = null;
const logger = createLogger("calendar-client:http");

export function setHttpClientAuthCookieProvider(
  provider: AuthCookieProvider | null,
): void {
  authCookieProvider = provider;
  logger.info("Updated auth cookie provider", {
    enabled: Boolean(provider),
  });
}

export function setHttpClientBaseURL(baseURL: string | null): void {
  overriddenBaseURL = baseURL ? baseURL.replace(/\/$/, "") : null;
  logger.info("Updated HTTP client base URL override", {
    baseURL: overriddenBaseURL,
  });
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
    const envUrl =
      process.env.NEXT_PUBLIC_API_URL || process.env.EXPO_PUBLIC_API_URL;
    const fallbackUrl = "http://localhost:3001";

    this.baseURL = envUrl || fallbackUrl;
    this.timeout = options.timeout || 10000;
    this.retries = options.retries || 3;
    this.retryDelay = options.retryDelay || 1000;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isRetryableError(error: any): boolean {
    if (error.name === "TypeError" || error.name === "AbortError") {
      return true;
    }

    if (error.status >= 500 && error.status < 600) {
      return true;
    }

    if (error.status === 408 || error.status === 429) {
      return true;
    }

    return false;
  }

  private async parseErrorResponse(response: Response): Promise<ApiError> {
    try {
      const errorText = await response.text();

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

      return {
        error: errorData.error || "HTTP Error",
        message:
          errorData.message || response.statusText || `HTTP ${response.status}`,
        statusCode: response.status,
        details: errorData.details || [],
      };
    } catch {
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

    const resolvedBaseURL = overriddenBaseURL || this.baseURL;
    const fullUrl = url.startsWith("http") ? url : `${resolvedBaseURL}${url}`;

    let lastError: any;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const startedAt = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

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

      const authCookie = authCookieProvider?.() || undefined;
      const headers = new Headers(fetchOptions.headers);

      if (authCookie) {
        headers.set("Cookie", authCookie);
      }

      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      const requestOptions: RequestInit = {
        ...fetchOptions,
        signal: controller.signal,
        credentials: authCookie ? "omit" : "include",
        headers,
      };

      logger.step("HTTP request attempt started", {
        method: requestOptions.method || "GET",
        url: fullUrl,
        attempt: attempt + 1,
        totalAttempts: retries + 1,
        timeout,
        hasAuthCookie: Boolean(authCookie),
      });

      try {
        const response = await fetch(fullUrl, requestOptions);
        const durationMs = Date.now() - startedAt;
        clearTimeout(timeoutId);
        if (abortListener && externalSignal) {
          externalSignal.removeEventListener("abort", abortListener);
          abortListener = null;
        }

        if (!response.ok) {
          const retryAfterHeader = response.headers.get("retry-after");
          const error = await this.parseErrorResponse(response);
          const retryable = this.isRetryableError(error);

          logger.warn("HTTP request returned non-OK response", {
            method: requestOptions.method || "GET",
            url: fullUrl,
            status: response.status,
            attempt: attempt + 1,
            totalAttempts: retries + 1,
            retryable,
            durationMs,
            error,
          });

          if (response.status === 401 || response.status === 403) {
            throw error;
          }

          if (attempt < retries && retryable) {
            let delayMs = this.retryDelay * Math.pow(2, attempt);

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
            logger.step("Retrying HTTP request after non-OK response", {
              method: requestOptions.method || "GET",
              url: fullUrl,
              nextAttempt: attempt + 2,
              delayMs: Math.max(0, delayMs) + jitter,
            });
            await this.delay(Math.max(0, delayMs) + jitter);
            continue;
          }

          throw error;
        }

        logger.ok("HTTP request completed successfully", {
          method: requestOptions.method || "GET",
          url: fullUrl,
          status: response.status,
          attempt: attempt + 1,
          durationMs,
        });

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          logger.debug("HTTP response did not include JSON content", {
            method: requestOptions.method || "GET",
            url: fullUrl,
            contentType,
          });
          return {} as T;
        }

        const data = await response.json();
        return this.transformDates(data);
      } catch (error: any) {
        const durationMs = Date.now() - startedAt;
        clearTimeout(timeoutId);
        if (abortListener && externalSignal) {
          externalSignal.removeEventListener("abort", abortListener);
          abortListener = null;
        }
        lastError = error;

        logger.error("HTTP request attempt failed", {
          method: requestOptions.method || "GET",
          url: fullUrl,
          attempt: attempt + 1,
          totalAttempts: retries + 1,
          durationMs,
          error,
        });

        if (error?.statusCode === 401 || error?.statusCode === 403) {
          throw error;
        }

        if (attempt < retries && this.isRetryableError(error)) {
          const delayMs = this.retryDelay * Math.pow(2, attempt);
          const jitter = Math.floor(Math.random() * 250);
          logger.step("Retrying HTTP request after transport failure", {
            method: requestOptions.method || "GET",
            url: fullUrl,
            nextAttempt: attempt + 2,
            delayMs: delayMs + jitter,
          });
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
        if (
          (key === "start" ||
            key === "end" ||
            key === "createdAt" ||
            key === "updatedAt" ||
            key === "syncedAt") &&
          typeof value === "string"
        ) {
          transformed[key] = new Date(value);
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

export const httpClient = new HttpClient();
