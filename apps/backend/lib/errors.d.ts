import { Elysia } from "elysia";
export declare class ValidationError extends Error {
    field?: string | undefined;
    constructor(message: string, field?: string | undefined);
}
export declare class NotFoundError extends Error {
    constructor(message?: string);
}
export declare class UnauthorizedError extends Error {
    constructor(message?: string);
}
export declare class ForbiddenError extends Error {
    constructor(message?: string);
}
export declare class DatabaseError extends Error {
    originalError?: any | undefined;
    constructor(message: string, originalError?: any | undefined);
}
export declare class NotificationError extends Error {
    originalError?: any | undefined;
    constructor(message: string, originalError?: any | undefined);
}
export interface ApiErrorResponse {
    error: string;
    message: string;
    statusCode: number;
    details?: any;
    timestamp: string;
}
export declare const errorHandler: Elysia<"", {
    decorator: {};
    store: {};
    derive: {};
    resolve: {};
}, {
    typebox: {};
    error: {};
}, {
    schema: {};
    standaloneSchema: {};
    macro: {};
    macroFn: {};
    parser: {};
}, {}, {
    derive: {};
    resolve: {};
    schema: {};
    standaloneSchema: {};
}, {
    derive: {};
    resolve: {};
    schema: {};
    standaloneSchema: {};
}>;
//# sourceMappingURL=errors.d.ts.map