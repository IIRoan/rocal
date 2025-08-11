import { createAPI } from "../../../../backend/api";

const app = createAPI("/api");

export const GET = app.handle;
export const POST = app.handle;
export const PUT = app.handle;
export const DELETE = app.handle;
export const PATCH = app.handle;
