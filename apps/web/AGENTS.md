Auth uses rolling 14-day app and passkey sessions; Better Auth checks hourly and on focus/reconnect, with renewal cookies forwarded by the API.

Calendar’s Riftbound palette settings also ship in native Calendar’s account drawer. Preferences stay sealed; `/api/riftbound` returns public store/events and registered-identity hashes, never accepts a Riot ID or login. Matching and encryption run on-device for the past 30 days and upcoming events while Calendar is open; the existing ICS import skips duplicates for Riftbound and a sealed ledger of imported IDs keeps deleted copies gone; existing imports are not automatically edited or deleted. Registered-only matching is opt-in because imported times can reveal the Riot ID to the server.

Public `/privacy` and `/support` pages share their routes/contact configuration with native help settings and store metadata through `packages/calendar-core/src/product-info.json`.

The public `/.well-known/apple-app-site-association` route authorizes native passkeys for the two release bundle IDs from `packages/native-core/expo-apps.json`, under the environment’s `SOLACE_APPLE_TEAM_ID`. It returns 404 when the team is unset or invalid; configure it on the website used by each native build’s associated domain.

Mail uses the API's JMAP proxy; the API and notifications reach Stalwart through its key-gated Railway private endpoint, independently of the VPS mail tunnel.
Public JMAP at `mail.solace.onl` uses Railway HTTPS through the restricted `:8082` gateway; SMTP uses the VPS at `mx.solace.onl`. Users sign in only through Solace. The operator-only `/admin` entry requires an explicit `STALWART_ADMIN_URL`; an unconfigured environment returns 404 instead of redirecting to production. Stalwart keeps its own origin; its UI and sign-in open only to a live Solace session whose user ID is explicitly allowlisted (`SOLACE_ADMIN_AUTH_URL`, existing passkey checks), with no operator IP allowlist, and stay closed while that URL is unset. The authorizer is key-gated and rate-limited, and login redirects use `SOLACE_ADMIN_LOGIN_URL`. Public JMAP stays independent. This operator tooling has no native screen.

Every backend change ships with a case in the API suite (`crates/solace-api-tests`, root AGENTS §5). The API is Rust (`apps/backend`, plan 001; root AGENTS §3 "Rust backend"): wire types come from `@workspace/api-contracts`, and the known privacy gaps of root AGENTS §2 stay until plan 001 step 7.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
