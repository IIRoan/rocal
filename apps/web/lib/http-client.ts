import { ApiError } from "./types/calendar";

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
    this.baseURL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
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
      const errorData = await response.json();
      return {
        error: errorData.error || "Unknown error",
        message: errorData.message || response.statusText,
        statusCode: response.status,
        details: errorData.details,
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
    options: RequestOptions = {}
  ): Promise<T> {
    const {
      timeout = this.timeout,
      retries = this.retries,
      ...fetchOptions
    } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const fullUrl = url.startsWith("http") ? url : `${this.baseURL}${url}`;

    const requestOptions: RequestInit = {
      ...fetchOptions,
      signal: controller.signal,
      credentials: "include", // Include cookies for session authentication
      headers: {
        "Content-Type": "application/json",
        ...fetchOptions.headers,
      },
    };

    let lastError: any;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(fullUrl, requestOptions);
        clearTimeout(timeoutId);

        if (!response.ok) {
          const error = await this.parseErrorResponse(response);

          // Don't retry authentication errors or client errors (except specific ones)
          if (response.status === 401 || response.status === 403) {
            throw error;
          }

          if (attempt < retries && this.isRetryableError(error)) {
            await this.delay(this.retryDelay * Math.pow(2, attempt)); // Exponential backoff
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
        lastError = error;

        // Don't retry authentication errors
        if (error.statusCode === 401 || error.statusCode === 403) {
          throw error;
        }

        if (attempt < retries && this.isRetryableError(error)) {
          await this.delay(this.retryDelay * Math.pow(2, attempt));
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
            key === "updatedAt") &&
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

// Default instance
export const httpClient = new HttpClient();
