# Solace status page

Gatus and the status frontend run as `solace-mail/solace-status` on Zeabur OSS. A push to `master` that changes this directory or the shared status entrypoint requests a new image through the [Solace release workflow](../../.github/workflows/solace-production.yml). Successful builds are promoted by immutable digest through Flux.

The [status workload](../../.zeabur/solace-mail/status/) preserves the existing `solace-status-history` claim on `roan-server`. Its SQLite history stays at `/data/gatus.db`. Configuration, SSH keys and host pins are prepared under `/run/gatus` on a memory-backed volume; credentials come from the `solace-status-runtime` Kubernetes Secret. The image and ConfigMap share one entrypoint through the `entrypoint.sh` symlink.

The public routes are `status.solace.onl` and `monitoring-solace.roan.dev`. Bootstrap owns their existing Services, Ingresses and NetworkPolicies. Native releases use their own workflows.

## Configuration

Set runtime values through `solace-status-runtime`, using [.env.example](.env.example) for the variable names. Never commit credentials or a generated configuration. `GATUS_CONFIG_YAML` can override the default endpoint configuration. Prometheus credentials authorize Stalwart metrics, `DISCORD_WEBHOOK_URL` receives downtime alerts, and the VPS monitor requires a dedicated forced-command account and pinned SSH host keys.

The deployment uses `Recreate` so only one process opens the history database. Keep its single replica, claim name and node placement when changing the image. Back up the SQLite database consistently before a storage migration; ordinary image releases retain the claim.

## History and monitoring

The image retains hourly uptime for 90 days and the latest 2,880 checks per endpoint. Endpoint names are storage keys. Rename display labels in `status.html`; preserve retired keys through `storage.preserve-endpoint-keys`. Both public and private JMAP history keys remain protected by the retained-history patch.

The private JMAP monitor records the API's `Server-Timing` value separately from the full HTTP round trip. The public page hides internal mail-policy and key-expiry checks. Gatus continues to evaluate their configured alerts.

## Verification

Build from the repository root because the entrypoint is shared with the Kubernetes manifests:

```sh
podman build -f apps/gatus/Dockerfile -t solace-gatus .
python3 -B -m unittest discover -s apps/gatus/tests -v
```

The Dockerfile runs the Go regression tests for the packaged Gatus patches. The Python suite covers status routes, redirects, history aggregation, metrics and credential preparation. The [deployment runbook](../../.zeabur/bootstrap/README.md#recover-an-image-rollout) covers recovery through the prior image pin.
