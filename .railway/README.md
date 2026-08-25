# Railway configuration

The Rocal project is defined in `.railway/railway.ts`. That file is the source of truth for services, databases, volumes, buckets, domains, and variables.

Do not add per-service `railway.toml` or `railway.json`. Config as Code is deprecated.

## Commands

```bash
railway config plan     # preview changes (safe)
railway config apply    # apply after confirmation
railway config pull     # re-import live Railway state
```

`plan` does not change Railway. `apply` always runs a fresh plan first. Destructive changes in non-interactive or agent sessions also need `--confirm-destructive`.

Secrets stay as `preserve()` so Railway keeps the existing value without writing it to git.
