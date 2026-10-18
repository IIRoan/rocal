/** Vercel Elysia entry (detected as `app.ts`): Bun runtime via `bunVersion`, handler is the bundle from `main.ts`. */
import { createRequire } from "node:module";
import "elysia";

// Force Vercel file tracing to include Prisma engines beside the Bun bundle.
const require = createRequire(import.meta.url);
// require.resolve is synchronous; the bare calls only register the paths with Vercel's tracer.
require.resolve("./dist/vercel/libquery_engine-rhel-openssl-3.0.x.so.node");
require.resolve("./dist/vercel/libquery_engine-debian-openssl-3.0.x.so.node");

// @ts-expect-error — Bun bundle from build:vercel; no .d.ts on the emitted JS entry
export { default } from "./dist/vercel/app.js";
