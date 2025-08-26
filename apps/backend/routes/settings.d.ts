import { Elysia } from "elysia";
export declare const settingsRoutes: Elysia<"/settings", {
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
    settings: {
        get: {
            body: unknown;
            params: {};
            query: unknown;
            headers: unknown;
            response: {
                [x: string]: any;
                200: any;
            };
        };
    };
} & {
    settings: {
        put: {
            body: {
                timezone?: string | undefined;
                theme?: "light" | "dark" | "system" | undefined;
                defaultView?: "month" | "day" | "week" | "agenda" | undefined;
                weekStartDay?: number | undefined;
                timeFormat?: "12h" | "24h" | undefined;
                workingHoursStart?: number | undefined;
                workingHoursEnd?: number | undefined;
                workingDays?: string | undefined;
                emailNotifications?: boolean | undefined;
                browserNotifications?: boolean | undefined;
                reminderSound?: boolean | undefined;
                defaultReminder?: number | null | undefined;
                defaultEventDuration?: number | undefined;
                defaultCalendarId?: string | null | undefined;
                compactView?: boolean | undefined;
                showWeekNumbers?: boolean | undefined;
                showDeclinedEvents?: boolean | undefined;
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
    settings: {
        delete: {
            body: unknown;
            params: {};
            query: unknown;
            headers: unknown;
            response: {
                200: {
                    success: boolean;
                    message: string;
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
//# sourceMappingURL=settings.d.ts.map