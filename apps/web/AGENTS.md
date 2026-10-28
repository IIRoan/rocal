Auth uses rolling 14-day app and passkey sessions; Better Auth checks hourly and on focus/reconnect, with renewal cookies forwarded by the API.

Mail uses the API's JMAP proxy; the API and notifications reach Stalwart through its key-gated Railway private endpoint, independently of the VPS mail tunnel.
Public JMAP at `mail.solace.onl` uses Railway HTTPS through the restricted `:8082` gateway; SMTP uses the VPS at `mx.solace.onl`. Users sign in only through Solace. The operator-only `/admin` entry requires an explicit `STALWART_ADMIN_URL`; an unconfigured environment returns 404 instead of redirecting to production. Stalwart keeps its own origin and operator IP restriction. Optional `SOLACE_ADMIN_AUTH_URL` session checks additionally require a live, explicitly allowlisted Solace session with existing passkey checks. The authorizer is key-gated and rate-limited, and login redirects use `SOLACE_ADMIN_LOGIN_URL`. Public JMAP stays independent. This operator tooling has no native screen.

Every backend change ships with a case in the API suite (`crates/solace-api-tests`, root AGENTS §5). The API is Rust (`apps/backend`, plan 001; root AGENTS §3 "Rust backend"): wire types come from `@workspace/api-contracts`, and the known privacy gaps of root AGENTS §2 stay until plan 001 step 7.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
