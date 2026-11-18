# Railway configuration

The `status` partial in `.railway/railway.ts` manages Railway Monitoring and its SQLite history volume. Monitoring builds `apps/gatus` from `IIRoan/rocal` on `master` when a push changes `apps/gatus/**`.

Solace API, Stalwart and notifications run on [Zeabur](../apps/stalwart/README.md). Railway holds the former production resources for recovery. Keep the Railway configuration scoped to the `status` partial so a normal apply leaves those resources alone.

## Commands

```bash
railway config plan     # preview changes (safe)
railway config apply    # apply after confirmation
```

`plan` does not change Railway. `apply` always runs a fresh plan first. Destructive changes in non-interactive or agent sessions also need `--confirm-destructive`.

Secrets stay as `preserve()` so Railway keeps the existing value without writing it to git.

Keep the authored `status` partial when inspecting the live project. `railway config pull` imports the whole project and can replace the partial file.
