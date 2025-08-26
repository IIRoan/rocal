import { t } from "elysia";
export const __nullable__ = (schema) => t.Union([t.Null(), schema]);
