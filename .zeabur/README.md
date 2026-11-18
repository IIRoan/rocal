# Solace on Zeabur

This Kustomize root declares the active Solace project on Zeabur OSS. `solace-mail` is the labeled Zeabur project. `solace-api` holds its application PostgreSQL primary and standby. The shared Zeabur installation and the Kubernetes platform have their own lifecycle. The [Railway Monitoring configuration](../.railway/README.md) covers Gatus.

| Path | What it manages |
| --- | --- |
| [project.yaml](project.yaml) | The namespaces, Solace's ingress class, and its three encrypted Longhorn storage classes |
| [solace-mail/](solace-mail/) | API and notifications, Stalwart and its gateways, Cloudflare tunnel workloads, private and public Service ports, routes, network policies, issuer and certificate, mail PostgreSQL, Redis Sentinel, and mail object storage |
| [solace-api/](solace-api/) | Application PostgreSQL primary and standby, their trust and initialization config, Services, and network policies |
| [bootstrap/](bootstrap/) | Initial Flux setup, scoped deploy permissions, and the ingress controller's RBAC |

The live workloads drive the image digests, selectors, placement, probes, and storage settings in these manifests. Keep image changes here for the workloads this directory manages. Zeabur reads these objects and displays their live state.

## Dependencies and recovery

The cluster provides K3s, Traefik, cert-manager, CloudNativePG and Longhorn. Keep the two Webdock worker names used by placement rules. Restore access to the pinned images, the Cloudflare tunnel and DNS, and the [host SMTP listeners and relays](../apps/stalwart/vps/README.md). The Kubernetes manifests reference the tunnel credentials supplied through the project Secret.

| Namespace | Secrets supplied through the deployment or recovery process |
| --- | --- |
| `solace-mail` | `api-runtime`, `notifications-runtime`, `app-postgres-url`, `mail-cf-tunnel`, `mail-database-app`, `mail-live-auth`, `mail-object-auth`, `mail-pg-auth`, `mail-pg-crypto`, `mail-redis-sentinel-auth`, `mail-s3-crypto`, `mail-standby-relay-tls`, `solace-origin-ca` |
| `solace-api` | `app-pg-auth`, `app-pg-crypto`, `app-pg-tls` |

The CA ConfigMaps contain public trust certificates. cert-manager issues `solace-origin-tls` from the externally provisioned CA key. CloudNativePG manages its instance Services, accounts and volumes. Kubernetes provisions the StatefulSet claims from their templates. The long-lived mail object claim is declared explicitly. Restore the database and object data, with their encryption keys, before routing production traffic to a replacement installation.

Preserve the original volume bindings on the live cluster. Use apply without pruning so dormant recovery resources and controller-managed objects remain available.

## Deploy from Git

Flux reads `.zeabur/` on the protected `master` branch and applies it with the `solace-reconciler` service account. It polls Git every minute and checks for drift every five minutes. Use Git as the writer for managed fields. Changes to a Deployment's pod template trigger its rollout. Flux leaves existing objects in place when a manifest is removed.

Review the server-side diff against the production context before merging a config change.

```sh
kubectl config current-context
kubectl kustomize .zeabur
kubectl diff --server-side --field-manager=kustomize-controller -k .zeabur
```

After a merge, check the applied revision and workload health.

```sh
kubectl -n solace-gitops get gitrepository,kustomization solace
kubectl -n solace-mail get deployments
```

The [bootstrap procedure](bootstrap/README.md) covers first adoption and recovery. Review storage and routing changes against the [production runbook](../apps/stalwart/README.md). Verify both mail endpoints, the public API and JMAP, and STARTTLS on both MXs after a rollout.
