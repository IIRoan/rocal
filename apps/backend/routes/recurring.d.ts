import { Elysia } from "elysia";
export declare const recurringRoutes: Elysia<"/recurring", {
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
    recurring: {
        validate: {
            post: {
                body: {
                    rule: string | {
                        count?: number | undefined;
                        until?: string | undefined;
                        byWeekDay?: number[] | undefined;
                        byMonthDay?: number[] | undefined;
                        byMonth?: number[] | undefined;
                        frequency: "yearly" | "monthly" | "weekly" | "daily";
                        interval: number;
                    };
                };
                params: {};
                query: unknown;
                headers: unknown;
                response: {
                    200: {
                        valid: boolean;
                        errors: string[];
                        description: null;
                        rule?: undefined;
                    } | {
                        valid: boolean;
                        errors: any;
                        description: any;
                        rule: any;
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
    recurring: {
        preview: {
            post: {
                body: {
                    previewDays?: number | undefined;
                    eventStart: string;
                    eventEnd: string;
                    recurrenceRule: string | {
                        count?: number | undefined;
                        until?: string | undefined;
                        byWeekDay?: number[] | undefined;
                        byMonthDay?: number[] | undefined;
                        byMonth?: number[] | undefined;
                        frequency: "yearly" | "monthly" | "weekly" | "daily";
                        interval: number;
                    };
                };
                params: {};
                query: unknown;
                headers: unknown;
                response: {
                    200: {
                        instances: any;
                        description: any;
                        totalInstances: any;
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
    recurring: {
        event: {
            ":id": {
                put: {
                    body: {
                        occurrenceDate?: string | undefined;
                        editScope: "all" | "this_only" | "this_and_future";
                        updates: {
                            description?: string | undefined;
                            title?: string | undefined;
                            color?: string | undefined;
                            end?: string | undefined;
                            start?: string | undefined;
                            location?: string | undefined;
                            allDay?: boolean | undefined;
                            reminder?: number | undefined;
                            recurrence?: string | undefined;
                            calendarId?: string | undefined;
                            categoryId?: string | undefined;
                        };
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
    };
} & {
    recurring: {
        event: {
            ":id": {
                delete: {
                    body: unknown;
                    params: {
                        id: string;
                    };
                    query: {
                        occurrenceDate?: string | undefined;
                        deleteScope: "all" | "this_only" | "this_and_future";
                    };
                    headers: unknown;
                    response: {
                        200: {
                            success: boolean;
                            message: string;
                            deletedEventId: any;
                            action: string;
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
    };
} & {
    recurring: {
        patterns: {
            get: {
                body: unknown;
                params: {};
                query: unknown;
                headers: unknown;
                response: {
                    200: {
                        patterns: {
                            daily: {
                                rule: any;
                                description: string;
                            };
                            weekly: {
                                rule: any;
                                description: string;
                            };
                            biweekly: {
                                rule: any;
                                description: string;
                            };
                            monthly: {
                                rule: any;
                                description: string;
                            };
                            yearly: {
                                rule: any;
                                description: string;
                            };
                            weekdays: {
                                rule: any;
                                description: string;
                            };
                        };
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
//# sourceMappingURL=recurring.d.ts.map