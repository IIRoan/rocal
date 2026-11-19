# Solace on Zeabur

This Kustomize root declares the active Solace project on Zeabur OSS. `solace-mail` is the labeled Zeabur project. `solace-api` holds its application PostgreSQL primary and standby. The shared Zeabur installation and the Kubernetes platform have their own lifecycle. The [Railway Monitoring configuration](../.railway/README.md) covers Gatus.

| Path | What it manages |
| --- | --- |
| [solace-mail/](solace-mail/) | API and notifications, Stalwart and its gateways, Cloudflare tunnel workloads, issuer and certificate, mail PostgreSQL, Redis Sentinel, and mail object storage |
| [solace-api/](solace-api/) | Application PostgreSQL primary and standby, their trust and initialization config |
| [bootstrap/](bootstrap/) | Namespaces with restricted Pod Security, encrypted StorageClasses, Flux setup, scoped deploy permissions, networking, and ingress RBAC |

The live workloads drive the image digests, selectors, placement, probes, and storage settings in these manifests. Keep image changes here for the workloads this directory manages. Zeabur reads these objects and displays their live state.

## Dependencies and recovery

The cluster provides K3s, Traefik, cert-manager, CloudNativePG and Longhorn. Keep the two Webdock worker names used by placement rules. Restore access to the pinned images, the Cloudflare tunnel and DNS, and the [host SMTP listeners and relays](../apps/stalwart/vps/README.md). The Kubernetes manifests reference the tunnel credentials supplied through the project Secret.

| Namespace | Secrets supplied through the deployment or recovery process |
| --- | --- |
| `solace-mail` | `api-runtime`, `notifications-runtime`, `app-postgres-url`, `mail-cf-tunnel`, `mail-database-app`, `mail-live-auth`, `mail-object-auth`, `mail-pg-auth`, `mail-pg-crypto`, `mail-redis-sentinel-auth`, `mail-s3-crypto`, `mail-standby-relay-tls`, `solace-origin-ca` |
| `solace-api` | `app-pg-auth`, `app-pg-crypto`, `app-pg-tls` |

The CA ConfigMaps contain public trust certificates. cert-manager issues `solace-origin-tls` from the externally provisioned CA key. CloudNativePG manages its instance Services, accounts and volumes. Kubernetes provisions the StatefulSet claims from their templates. The long-lived mail object claim is declared explicitly. Restore the database and object data, with their encryption keys, before routing production traffic to a replacement installation.

The admin networking manifests reserve the five Service IPs advertised by this Redis and Sentinel installation. Create those Services before other workloads allocate addresses on a replacement cluster. The production manifests expect the K3s Service CIDR to contain those addresses. A different CIDR requires updating the Service and Sentinel addresses together and migrating the saved Sentinel state to the verified leader. The `mail-pg` alias follows the CloudNativePG primary.

On each application PostgreSQL worker, load the `solace-rehearsal-postgres` AppArmor profile from platform provisioning and verify it permits the mounted data directory, scratch directory and socket directory. The standby's replication network must match the restricted TLS replication rule in [app-pg-init](solace-api/config.yaml). When rebuilding on another subnet, set the rule to the new standby subnet before initialization. When restoring an existing PGDATA, update its stored rule before starting the standby.

Preserve the original volume bindings on the live cluster. Use apply without pruning so dormant recovery resources and controller-managed objects remain available.

## Deploy from Git

Flux reads `.zeabur/` on the protected `master` branch and applies it with the `solace-reconciler` service account. It polls Git every minute and checks for drift every five minutes. An administrator owns [project prerequisites](bootstrap/project.yaml) and [networking manifests](bootstrap/networking/), including namespace admission policy. Use Git as the writer for managed fields. Stalwart A reconciles after the shared workloads, and Stalwart B waits for A's healthy deployment on the same Git revision. Gateway configuration is mounted from immutable ConfigMaps whose content hashes change the pod templates. Flux leaves existing objects in place when a manifest is removed.

Each Stalwart Deployment keeps a single replica and a stable pod address for the host SMTP routes. The [admission policy](bootstrap/stalwart-rollout.yaml) requires its peer to be available before a pod template can change. A's gateway must serve JMAP discovery and see SMTP advertise STARTTLS on its own listener. A rejoins the Service once Ready and must stay Ready for 60 seconds before Flux updates B. If A fails the readiness gate, B keeps serving on its current release.

On shutdown, the gateway closes the health listener checked by both MXs and pauses for 18 seconds while they switch to the healthy peer. Kubernetes removes the terminating pod from the JMAP Service while the application and SMTP listener are still running. Sessions that exceed the shutdown grace period reconnect through the remaining replica.

Review the server-side diff against the production context before merging a config change.

```sh
kubectl config current-context
kubectl kustomize .zeabur
kubectl diff --server-side --field-manager=kustomize-controller -k .zeabur
kubectl diff --server-side --field-manager=kustomize-controller -k .zeabur/solace-mail/stalwart-a
kubectl diff --server-side --field-manager=kustomize-controller -k .zeabur/solace-mail/stalwart-b
```

After a merge, check the applied revision and workload health.

```sh
kubectl -n solace-gitops get gitrepository,kustomizations
kubectl -n solace-mail get deployments stalwart-a stalwart-b
kubectl -n solace-mail get endpointslices -l kubernetes.io/service-name=mail-live
```

The [bootstrap procedure](bootstrap/README.md) covers first adoption and recovery. Review storage and routing changes against the [production runbook](../apps/stalwart/README.md). Verify both mail endpoints, the public API and JMAP, and STARTTLS on both MXs after a rollout.

## Workload hardening

Containers use read-only root filesystems. PostgreSQL and the Stalwart gateways have writable socket directories, and PostgreSQL, Redis, Stalwart, and SeaweedFS have writable scratch space. Existing data volumes retain their service UID and GID. Changing the identity of a stateful process requires a tested data ownership migration.

The image references use digest pins and the registries approved in [the Trivy Kubernetes configuration](../.github/trivy-data/registries.yaml). A runtime image change requires compatibility checks for the entrypoint, its data and its probes.

The application mail gateways still use a compatibility host alias for the private JMAP route. The ingress controller reads TLS Secrets in its namespace. The Flux account can update workload and ConfigMap objects within the Solace namespaces. These capabilities are visible in the scanner report. The sensitive-ConfigMap check also matches the microphone permissions header, the public security contact header, and the Lua lookup of a gate key from the environment. The gateway configuration stores Secret references and public settings in Git.

## Direct public ingress

The public Traefik deployment has one replica per worker and serves the public Let’s Encrypt certificate. HTTPS on `mx.solace.onl` passes encrypted traffic through to the existing Stalwart listener with PROXY v2. Cloudflared keeps using the original Traefik deployment and origin CA. The API and Stalwart gateways accept Traefik’s client IP on a dedicated port that is restricted to the public controller by NetworkPolicy.

Provision `solace-acme-dns` in `solace-mail` with the `api-token` key and DNS write and zone read access restricted to `solace.onl`. Flux reconciles the issuer and certificate. cert-manager renews the public certificate in `solace-public-tls`, which both Traefik replicas read. The DNS challenge works before changing the public HTTPS records. Alert on both the Certificate's readiness and the expiry served from each worker.

A cluster administrator applies the networking manifests. The public Services use a dedicated LoadBalancer class so K3s does not create its source-NATing ServiceLB pods. Keep the Services' public addresses unset during setup. The bootstrap helper binds the selected MX host addresses as Kubernetes load balancer VIPs. kube-proxy routes the original connection directly to a local ready Traefik pod, preserving the client IP. This requires the public IP to be assigned directly to the worker's interface.

Allow the new forwarded paths in each worker's existing firewall before binding its VIP. Match the original public IPv4 destination and TCP port 443 or 25 and the corresponding post-DNAT target port 9443 or 2525. Validate the change with a source-restricted temporary rule before persisting it. Keep the shared Zeabur Traefik on its existing nodes.

```sh
python3 -B .zeabur/bootstrap/public-edge.py https mx mx2
python3 -B .zeabur/bootstrap/public-edge.py smtp mx2
python3 -B .zeabur/bootstrap/public-edge.py smtp mx mx2
```

1. Bring up HTTPS on both workers. Keep the existing tunnel and DNS records until the direct HTTPS probe passes on each worker. Review the active Cloudflare security rules and confirm the new path preserves client-IP rate limits, operator authorization and compatible request size and streaming timeouts.
2. Verify authenticated web and native sign-in, read and send with a synthetic attachment, incoming mail, and JMAP event reconnect while one public ingress path is unavailable. Reissue a staging certificate and check that both replicas serve it without a restart.
3. Set up health-checked DNS for the direct endpoints and save the previous records. Switch the HTTPS names to the direct path without changing the MX records. Verify the exact enforced MTA-STS policy through both origins and normal DNS.
4. Move SMTP separately, one worker at a time. Migrate only the public HAProxy listener after verifying the owning process and preserving any private relay listeners in the same service. The TCP route carries the original client IP in PROXY v2 and Stalwart handles STARTTLS. Confirm the Kubernetes Service prefers a ready local gateway and uses its peer during drain. Send and receive through both MXs using a controlled external mailbox. Verify queued canary mail delivers after recovery.
5. Update the host health check to match the migrated service. After the observation window, scale the old connectors to zero in Git. Retain the previous DNS, listener configuration and connector references for recovery.

Run the protocol probes from outside the cluster. For a test listener, set `--https-port` and `--smtp-port` to the temporary public ports. `--skip-smtp` runs only the HTTPS checks before moving SMTP.

```sh
python3 -B scripts/probe-solace-edge.py --public-dns --mx-https
```

If HTTPS fails after the DNS switch, restore the previous DNS records while both connectors still serve. Use the bind helper with no MX argument to clear a Service's VIPs if it must stop intercepting traffic. If SMTP fails, omit the affected worker from the SMTP Service's VIPs with the bootstrap helper and restore its public HAProxy listener. Repeat HTTPS and STARTTLS checks after either rollback.
