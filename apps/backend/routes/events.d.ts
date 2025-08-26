import { Elysia } from "elysia";
export declare const eventsRoutes: Elysia<"/events", {
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
}, {
    events: {
        get: {
            body: unknown;
            params: {};
            query: {
                end: string;
                start: string;
            };
            headers: unknown;
            response: {
                200: {
                    events: any[];
                    categories: any;
                    calendars: any;
                };
                422: {
                    type: "validation";
                    on: string;
                    summary?: string;
                    message?: string;
                    found?: unknown;
                    property?: string;
                    expected?: string;
                };
            };
        };
    };
} & {
    events: {
        post: {
            body: {
                description?: string | undefined;
                color?: string | undefined;
                location?: string | undefined;
                allDay?: boolean | undefined;
                reminder?: number | null | undefined;
                recurrence?: string | undefined;
                categoryId?: string | undefined;
                title: string;
                end: string;
                start: string;
                calendarId: string;
            };
            params: {};
            query: unknown;
            headers: unknown;
            response: {
                [x: string]: any;
                200: any;
                422: {
                    type: "validation";
                    on: string;
                    summary?: string;
                    message?: string;
                    found?: unknown;
                    property?: string;
                    expected?: string;
                };
            };
        };
    };
} & {
    events: {
        ":id": {
            put: {
                body: {
                    description?: string | undefined;
                    title?: string | undefined;
                    color?: string | undefined;
                    end?: string | undefined;
                    start?: string | undefined;
                    location?: string | undefined;
                    allDay?: boolean | undefined;
                    reminder?: number | null | undefined;
                    recurrence?: string | undefined;
                    calendarId?: string | undefined;
                    categoryId?: string | undefined;
                };
                params: {
                    id: string;
                };
                query: unknown;
                headers: unknown;
                response: {
                    [x: string]: any;
                    200: any;
                    422: {
                        type: "validation";
                        on: string;
                        summary?: string;
                        message?: string;
                        found?: unknown;
                        property?: string;
                        expected?: string;
                    };
                };
            };
        };
    };
} & {
    events: {
        ":id": {
            delete: {
                body: unknown;
                params: {
                    id: string;
                };
                query: unknown;
                headers: unknown;
                response: {
                    200: {
                        success: boolean;
                        message: string;
                        deletedEventId: any;
                    };
                    422: {
                        type: "validation";
                        on: string;
                        summary?: string;
                        message?: string;
                        found?: unknown;
                        property?: string;
                        expected?: string;
                    };
                };
            };
        };
    };
} & {
    events: {
        bulk: {
            post: {
                body: {
                    targetCalendarId?: string | undefined;
                    action: "delete" | "move" | "duplicate";
                    eventIds: string[];
                };
                params: {};
                query: unknown;
                headers: unknown;
                response: {
                    200: {
                        success: boolean;
                        message: string;
                        eventsProcessed: any;
                        action: string;
                        createdEvents?: undefined;
                    } | {
                        success: boolean;
                        message: string;
                        eventsProcessed: number;
                        action: string;
                        createdEvents: any[];
                    };
                    422: {
                        type: "validation";
                        on: string;
                        summary?: string;
                        message?: string;
                        found?: unknown;
                        property?: string;
                        expected?: string;
                    };
                };
            };
        };
    };
}, {
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
//# sourceMappingURL=events.d.ts.map