# Solace on Zeabur

This Kustomize root declares the active Solace project on Zeabur OSS. `solace-mail` is the labeled Zeabur project. `solace-api` holds its application PostgreSQL primary and standby. The shared Zeabur installation and the Kubernetes platform have their own lifecycle. The [Railway Monitoring configuration](../.railway/README.md) covers Gatus.

| Path | What it manages |
| --- | --- |
| [project.yaml](project.yaml) | The namespaces and three encrypted Longhorn storage classes |
| [solace-mail/](solace-mail/) | API and notifications, Stalwart and its gateways, Cloudflare tunnel workloads, issuer and certificate, mail PostgreSQL, Redis Sentinel, and mail object storage |
| [solace-api/](solace-api/) | Application PostgreSQL primary and standby, their trust and initialization config |
| [bootstrap/](bootstrap/) | Initial Flux setup, scoped deploy permissions, networking, and the ingress controller's RBAC |

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

Flux reads `.zeabur/` on the protected `master` branch and applies it with the `solace-reconciler` service account. It polls Git every minute and checks for drift every five minutes. An administrator applies the [networking manifests](bootstrap/networking/) separately, so the reconciler cannot change Services, Ingresses, or NetworkPolicies. Use Git as the writer for managed fields. Changes to a Deployment's pod template trigger its rollout. Flux leaves existing objects in place when a manifest is removed.

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

## Workload hardening

Containers use read-only root filesystems. PostgreSQL and the Stalwart gateways have writable socket directories, and PostgreSQL, Redis, Stalwart, and SeaweedFS have writable scratch space. Existing data volumes retain their service UID and GID. Changing the identity of a stateful process requires a tested data ownership migration.

The image references use digest pins and the registries approved in [the Trivy Kubernetes configuration](../.github/trivy-data/registries.yaml). A runtime image change requires compatibility checks for the entrypoint, its data and its probes.

The application mail gateways still use a compatibility host alias for the private JMAP route. The ingress controller reads TLS Secrets in its namespace. The Flux account can update workload and ConfigMap objects within the Solace namespaces. These capabilities are visible in the scanner report. The sensitive-ConfigMap check also matches the microphone permissions header, the public security contact header, and the Lua lookup of a gate key from the environment. The gateway configuration stores Secret references and public settings in Git.
