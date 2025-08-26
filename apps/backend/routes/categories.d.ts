import { Elysia } from "elysia";
export declare const categoriesRoutes: Elysia<"/categories", {
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
    categories: {
        get: {
            body: unknown;
            params: {};
            query: unknown;
            headers: unknown;
            response: {
                200: {
                    categories: any;
                };
            };
        };
    };
} & {
    categories: {
        post: {
            body: {
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
    categories: {
        ":id": {
            put: {
                body: {
                    name?: string | undefined;
                    color?: string | undefined;
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
    categories: {
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
//# sourceMappingURL=categories.d.ts.map