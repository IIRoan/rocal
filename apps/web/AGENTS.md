Auth uses rolling 14-day app and passkey sessions; Better Auth checks hourly and on focus/reconnect, with renewal cookies forwarded by the API.

Production uses `web-container.yml` to build the root `Dockerfile.vercel` and deploy its immutable image on Vercel. A Node preload checks the runtime before the standalone Next.js server starts. Keep the Vercel project root at the repository root, framework at Other, and Git deployments disabled; deployment submits the root `vercel.json`.

Every backend change ships with a case in the API suite (`crates/solace-api-tests`, root AGENTS §5). The API is Rust (`apps/backend`, plan 001; root AGENTS §3 "Rust backend"): wire types come from `@workspace/api-contracts`, and the known privacy gaps of root AGENTS §2 stay until plan 001 step 7.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
