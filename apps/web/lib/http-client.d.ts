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
export declare class HttpClient {
    private baseURL;
    private timeout;
    private retries;
    private retryDelay;
    constructor(options?: HttpClientOptions);
    private delay;
    private isRetryableError;
    private parseErrorResponse;
    private makeRequest;
    private transformDates;
    get<T>(url: string, options?: RequestOptions): Promise<T>;
    post<T>(url: string, data?: any, options?: RequestOptions): Promise<T>;
    put<T>(url: string, data?: any, options?: RequestOptions): Promise<T>;
    delete<T>(url: string, options?: RequestOptions): Promise<T>;
}
export declare const httpClient: HttpClient;
//# sourceMappingURL=http-client.d.ts.map