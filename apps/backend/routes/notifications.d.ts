import { Elysia } from "elysia";
export declare const notificationsRoutes: Elysia<"/notifications", {
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
    notifications: {
        event: {
            ":eventId": {
                get: {
                    body: unknown;
                    params: {
                        eventId: string;
                    };
                    query: unknown;
                    headers: unknown;
                    response: {
                        200: {
                            success: boolean;
                            data: {
                                eventId: any;
                                notifications: any;
                                count: any;
                            };
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
    notifications: {
        event: {
            ":eventId": {
                put: {
                    body: {
                        notifications: {
                            notificationType: "email" | "browser";
                            minutesBefore: number;
                            isEnabled: boolean;
                        }[];
                    };
                    params: {
                        eventId: string;
                    };
                    query: unknown;
                    headers: unknown;
                    response: {
                        200: {
                            success: boolean;
                            message: string;
                            data?: undefined;
                        } | {
                            success: boolean;
                            message: string;
                            data: {
                                eventId: any;
                                created: number;
                                skipped: number;
                                details: {
                                    createdNotifications: {
                                        id: any;
                                        type: any;
                                        minutesBefore: any;
                                        notificationTime: any;
                                        isEnabled: any;
                                    }[];
                                    skippedConfigurations: never[];
                                };
                            };
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
    notifications: {
        event: {
            ":eventId": {
                delete: {
                    body: unknown;
                    params: {
                        eventId: string;
                    };
                    query: unknown;
                    headers: unknown;
                    response: {
                        200: {
                            success: boolean;
                            message: string;
                            deletedCount: number;
                            data?: undefined;
                        } | {
                            success: boolean;
                            message: string;
                            data: {
                                eventId: any;
                                deletedCount: any;
                            };
                            deletedCount?: undefined;
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
//# sourceMappingURL=notifications.d.ts.map