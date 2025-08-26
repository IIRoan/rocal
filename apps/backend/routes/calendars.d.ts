import { Elysia } from "elysia";
export declare const calendarsRoutes: Elysia<"/calendars", {
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
    calendars: {
        get: {
            body: unknown;
            params: {};
            query: unknown;
            headers: unknown;
            response: {
                200: {
                    calendars: any;
                };
            };
        };
    };
} & {
    calendars: {
        post: {
            body: {
                isDefault?: boolean | undefined;
                name: string;
                color: string;
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
    calendars: {
        ":id": {
            put: {
                body: {
                    name?: string | undefined;
                    color?: string | undefined;
                    isVisible?: boolean | undefined;
                    isDefault?: boolean | undefined;
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
    calendars: {
        ":id": {
            delete: {
                body: unknown;
                params: {
                    id: string;
                };
                query: {
                    action?: "move_events" | "delete_events" | undefined;
                    targetCalendarId?: string | undefined;
                };
                headers: unknown;
                response: {
                    200: {
                        success: boolean;
                        message: string;
                        deletedCalendarId: any;
                        eventsAffected: any;
                        action: any;
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
//# sourceMappingURL=calendars.d.ts.map