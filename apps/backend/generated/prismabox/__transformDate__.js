import { t } from "elysia";
export const __transformDate__ = (options) => t
    .Transform(t.String({ format: "date-time", ...options }))
    .Decode((value) => new Date(value))
    .Encode((value) => value.toISOString());
