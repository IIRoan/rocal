# Errex — Solace error tracking

Self-hosted [errex](https://github.com/TheHoltz/errex) (Sentry-compatible ingest, SQLite,
~10 MB RAM). On Railway it runs from **`ghcr.io/theholtz/errex:latest`** (see
`.railway/railway.ts`), with a volume at `/data`. This folder holds operator docs and an
optional Dockerfile if you ever want to build from the monorepo instead of GHCR.

Railway env must include `ERREX_HOST=0.0.0.0` (upstream defaults to loopback — see
[errex#14](https://github.com/TheHoltz/errex/issues/14)). SQLite lives at `/data/store`
so the volume mount root does not break WAL files.

## Railway variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `PORT` | auto | Public listen port (errex reads `PORT` when set) |
| `ERREX_HOST` | yes (`0.0.0.0`) | Bind address — baked into the image |
| `ERREX_DATA_DIR` | yes (`/data/store`) | SQLite directory on the volume |
| `ERREX_PUBLIC_URL` | yes | Public base URL embedded in DSNs (use `https://$RAILWAY_PUBLIC_DOMAIN` or your custom domain) |
| `ERREX_ADMIN_TOKEN` | first boot | One-shot setup-wizard token — set before opening `/setup` |
| `ERREX_REQUIRE_AUTH` | recommended | Validate `sentry_key` on ingest when publicly reachable |
| `ERREX_RETENTION_DAYS` | optional | Purge events older than N days (default `30`) |

## First-run bootstrap

1. Apply IaC (`railway config apply`) so the service + volume exist.
2. Set the setup token (do not commit it):

```bash
railway variable set ERREX_ADMIN_TOKEN="$(openssl rand -hex 16)" --service errex
```

3. Open the public URL → `/setup`, paste the token, create the admin user.
4. Create a project and copy the DSN:

```bash
railway ssh --service errex -- errexd project add solace
```

5. Point Sentry SDKs at that DSN (`@sentry/nextjs` on web, `@sentry/bun` on the API).

## Solace app wiring

| Surface | SDK | Env var |
|---------|-----|---------|
| Web (Vercel) | `@sentry/nextjs` | `NEXT_PUBLIC_SENTRY_DSN` |
| API (Vercel) | `@sentry/bun` | `SENTRY_DSN` |

Init is a no-op when the DSN is unset. Production DSN for project `solace`:

`https://65f1ae513c4a4865bc3b3384ce746653@errors.solace.onl/solace`

Official Sentry SDKs require a **numeric** DSN project id. Errex uses the string
name `solace`, so clients init with a numeric stand-in and `tunnel` envelopes to
`/api/solace/envelope/?sentry_key=…`. Keep `sendDefaultPii: false`.


## Custom domain

Point DNS at the Railway service, then set:

```bash
railway variable set ERREX_PUBLIC_URL=https://errors.solace.onl --service errex
```

Add `domains: [{ domain: "errors.solace.onl" }]` in `.railway/railway.ts` when ready.

## Local test

```bash
cd apps/errex
docker build -t solace-errex .
docker run --rm -p 9090:9090 \
  -e PORT=9090 \
  -e ERREX_HOST=0.0.0.0 \
  -e ERREX_PUBLIC_URL=http://localhost:9090 \
  -e ERREX_ADMIN_TOKEN="$(openssl rand -hex 16)" \
  -v errex-data:/data \
  solace-errex
```

Open `http://localhost:9090/setup` with the printed token.

## Hosting

Public dashboard: https://errors.solace.onl
