import { Elysia } from "elysia";
export declare const createAPI: (prefix?: string) => Elysia<string, any, any, any, {
    [x: string]: {};
} & {
    [x: string]: any;
} & {
    [x: string]: {
        get: {
            body: any;
            params: any;
            query: any;
            headers: any;
            response: any;
        };
    };
} & {
    [x: string]: {
        health: {
            get: {
                body: any;
                params: any;
                query: any;
                headers: any;
                response: any;
            };
        };
    };
} & {
    [x: string]: {
        me: {
            get: {
                body: any;
                params: any;
                query: any;
                headers: any;
                response: any;
            };
        };
    };
} & {
    [x: string]: {
        user: {
            get: {
                body: any;
                params: any;
                query: any;
                headers: any;
                response: any;
            };
        };
    };
} & {
    [x: string]: {
        test: {
            get: {
                body: any;
                params: any;
                query: any;
                headers: any;
                response: any;
            };
        };
    };
}, {
    derive: {};
    resolve: {};
    schema: {};
    standaloneSchema: {};
}, any>;
//# sourceMappingURL=index.d.ts.map