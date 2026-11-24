# Solace on Zeabur

This Kustomize root declares the active Solace project on Zeabur OSS. `solace-mail` contains the API, its PostgreSQL database, and the mail stack. The shared Zeabur installation and the Kubernetes platform have their own lifecycle.

| Path | What it manages |
| --- | --- |
| [solace-mail/](solace-mail/) | API, its PostgreSQL database and notifications, Stalwart and its gateways, public Traefik, issuers and certificates, mail PostgreSQL, Redis Sentinel, and mail object storage |
| [bootstrap/](bootstrap/) | Namespaces with restricted Pod Security, encrypted StorageClasses, Flux setup, scoped deploy permissions, networking, and ingress RBAC |

These manifests declare workload placement, probes, storage and fallback image digests. Zeabur displays the resulting Kubernetes workloads and Builder runs.

## Dependencies and recovery

The cluster provides K3s, Traefik, cert-manager, CloudNativePG, Longhorn, Zeabur Builder and the private Zot registry. Keep the two Webdock worker names used by placement rules. Restore access to the pinned images, Cloudflare DNS, and the [host SMTP listeners and relays](../apps/stalwart/vps/README.md).

| Namespace | Secrets supplied through the deployment or recovery process |
| --- | --- |
| `solace-mail` | `api-runtime`, `notifications-runtime`, `app-postgres-url`, `app-database-auth`, `solace-acme-dns`, `mail-database-app`, `mail-live-auth`, `mail-object-auth`, `mail-pg-auth`, `mail-pg-crypto`, `mail-redis-sentinel-auth`, `mail-s3-crypto`, `mail-standby-relay-tls`, `app-pg-auth`, `app-pg-crypto`, `app-pg-tls` |

The CA ConfigMaps contain public trust certificates. CloudNativePG manages its instance Services, accounts and volumes. Kubernetes provisions the StatefulSet claims from their templates. The long-lived mail object claim is declared explicitly. Restore the database and object data, with their encryption keys, before routing production traffic to a replacement installation.

The admin networking manifests reserve the five Service IPs advertised by this Redis and Sentinel installation. Create those Services before other workloads allocate addresses on a replacement cluster. The production manifests expect the K3s Service CIDR to contain those addresses. A different CIDR requires updating the Service and Sentinel addresses together and migrating the saved Sentinel state to the verified leader. The `mail-pg` alias follows the CloudNativePG primary.

Load the `solace-rehearsal-postgres` AppArmor profile on both Webdock workers before creating `app-database`. The [admission policy](bootstrap/networking/app-database-apparmor.yaml) applies it to the PostgreSQL instances and their bootstrap jobs. `app-database-auth` is a `kubernetes.io/basic-auth` Secret with the `solace_app` username and its password.

The API and notifications each run one replica per Webdock worker. Both use `app-postgres-url` to reach `app-database-rw.solace-mail.svc.cluster.local` with `sslmode=verify-full` and `sslrootcert=/etc/app-database-ca/ca.crt`. The two database instances run on separate encrypted volumes, with synchronous replication when both instances are available. CloudNativePG moves the write endpoint to the promoted instance. The notifications database leases allow either worker to claim pending jobs.

Before cutting over from standalone `app-postgres`, verify the latest encrypted offsite backup and restore a rehearsal copy. Quiesce writes, take a final logical dump, restore it as `solace_app`, and compare row counts before switching the connection Secret. Restart both Deployments to reload it. Keep the old cluster fenced once the new database accepts writes. Have the encrypted archive job resolve `app-database` through its current primary and check a fresh offsite snapshot after the switch.

Preserve the original volume bindings on the live cluster. Use apply without pruning so dormant recovery resources and controller-managed objects remain available.

### Worker failure detection

The K3s server checks node health every two seconds and marks a worker unreachable after 25 seconds without a heartbeat. Each node uses `nodeLeaseDurationSeconds: 20` in its kubelet configuration, which renews heartbeats every five seconds. The K3s services use HTTP/2 read-idle and ping timeouts of 10 and five seconds so a broken connection can be detected within the node grace period.

Both Solace databases start failover when Kubernetes reports the primary unavailable. The old primary stops if it cannot renew its lease within seven seconds, and a standby observes the unchanged lease for ten seconds before promoting. Keep synchronous replication, failover quorum, and the primary isolation check enabled. Apply lease changes through a rolling restart and check the live lease before testing a worker outage. Measure both the database-backed API and the public JMAP hostname, because DNS caching can extend JMAP recovery.

## Deploy from Git

Flux reads `.zeabur/` on the protected `master` branch and applies it with the `solace-reconciler` service account. It polls Git every minute and checks for drift every five minutes. An administrator owns [project prerequisites](bootstrap/project.yaml) and [networking manifests](bootstrap/networking/), including namespace admission policy. Use Git as the writer for managed fields. Stalwart A reconciles after the shared workloads, and Stalwart B waits for A's healthy deployment on the same Git revision. Gateway configuration is mounted from immutable ConfigMaps whose content hashes change the pod templates. Flux leaves existing objects in place when a manifest is removed.

Each Stalwart Deployment keeps a single replica and a stable pod address for the host SMTP routes. The [admission policy](bootstrap/stalwart-rollout.yaml) requires its peer to be available before a pod template can change. A's gateway must serve JMAP discovery and see SMTP advertise STARTTLS on its own listener. A rejoins the Service once Ready and must stay Ready for 60 seconds before Flux updates B. If A fails the readiness gate, B keeps serving on its current release.

On shutdown, the gateway closes the health listener checked by both MXs and pauses for 18 seconds while they switch to the healthy peer. Kubernetes removes the terminating pod from the JMAP Service while the application and SMTP listener are still running. Sessions that exceed the shutdown grace period reconnect through the remaining replica.

### Automatic image releases

A push to protected `master` runs [Solace production images](../.github/workflows/solace-production.yml). The [release planner](../scripts/solace-release-request.py) compares the last requested revision with the new commit and records affected components on the generated `solace-release-requests` branch.

| Change | Images requested |
| --- | --- |
| API entry point or Dockerfile | API |
| Shared backend Rust code, API types or workspace dependency inputs | API and notifications |
| Notifications worker or Dockerfile | Notifications |
| Stalwart runtime Dockerfile, install scripts or packaged configuration | Stalwart |
| Kubernetes config, docs, web or native code only | None |

Solace builds run on the MacBook's build node with limits of eight CPUs and 16 GiB of RAM per build. Zeabur reads those limits from the project namespace when a build starts.

The workflow tags each requested source commit. The release CronJob verifies the Flux artifact before passing that exact Git ref to Zeabur Builder. It records successful image digests from Zot through the image admission policy. Flux applies the selected digest. Stalwart A must be available on the new digest for its full readiness window before B is updated. Third-party containers use the image pins in their Git manifests and change when their pod templates change.

Solace uses Builder’s default Zot repository naming. Zeabur associates a Build with the running service once Builder publishes its first image. This keeps the status of an existing service accurate while its first Build is paused.

Check the workflow for the selected services and Zeabur for their Build runs. A failed build leaves the current image in place. A healthy B lets the next Stalwart fix replace a failed rollout on A. If B fails after promotion, keep A serving and follow the [recovery procedure](bootstrap/README.md#recover-an-image-rollout).

Review a server-side diff from the selected revision with the production image inputs resolved by Flux. Do this from a cluster context with read access to the live substitution ConfigMap and write permission for the dry run.

```sh
kubectl config current-context
flux build kustomization solace --namespace=solace-gitops --path .zeabur \
  | kubectl diff --server-side --field-manager=kustomize-controller -f -
flux build kustomization solace-stalwart-a --namespace=solace-gitops --path .zeabur/solace-mail/stalwart-a \
  | kubectl diff --server-side --field-manager=kustomize-controller -f -
flux build kustomization solace-stalwart-b --namespace=solace-gitops --path .zeabur/solace-mail/stalwart-b \
  | kubectl diff --server-side --field-manager=kustomize-controller -f -
```

After a merge, check the applied revision and workload health.

```sh
kubectl -n solace-gitops get gitrepository,kustomizations
kubectl -n solace-mail get deployments stalwart-a stalwart-b
kubectl -n solace-mail get endpointslices -l kubernetes.io/service-name=mail-live
```

To investigate a Zeabur dashboard warning, run `zeaburctl doctor --output json` and read the service through the Zeabur OSS API using a loopback session started by `zeaburctl ui --no-browser`. Review the service response at `/api/v1/projects/solace-mail/services/deployment/<name>` and its `/trace` endpoint for networking. The service response includes recent probe failure events even after a pod becomes Ready.

The [bootstrap procedure](bootstrap/README.md) covers first adoption and recovery. Review storage and routing changes against the [production runbook](../apps/stalwart/README.md). Verify both mail endpoints, the public API and JMAP, and STARTTLS on both MXs after a rollout.

## Workload hardening

Containers use read-only root filesystems. PostgreSQL and the Stalwart gateways have writable socket directories, and PostgreSQL, Redis, Stalwart, and SeaweedFS have writable scratch space. Existing data volumes retain their service UID and GID. Changing the identity of a stateful process requires a tested data ownership migration.

The image references use digest pins and the registries approved in [the Trivy Kubernetes configuration](../.github/trivy-data/registries.yaml). A runtime image change requires compatibility checks for the entrypoint, its data and its probes.

The application mail gateways still use a compatibility host alias for the private JMAP route. The ingress controller reads TLS Secrets in its namespace. The Flux account can update workload and ConfigMap objects within the Solace namespaces. These capabilities are visible in the scanner report. The sensitive-ConfigMap check also matches the microphone permissions header, the public security contact header, and the Lua lookup of a gate key from the environment. The gateway configuration stores Secret references and public settings in Git.

## Public ingress

See [Cloudflare tunnels](tunnels/) for the shared Zeabur Gateway and Solace tunnel configuration.

Solace HTTPS, including public JMAP, enters through the dedicated Solace tunnel.

The public Traefik deployment has one replica per worker and serves the public Let’s Encrypt certificate. HTTPS on `mx.solace.onl` passes encrypted traffic through to the existing Stalwart listener with PROXY v2. The API and Stalwart gateways accept Traefik’s client IP on a dedicated port that is restricted to the public controller by NetworkPolicy.

Traefik copies the public Service’s load balancer addresses to the Ingress status. Proxied DNS returns Cloudflare addresses. Use external HTTPS checks to verify the tunnel routes. The Git manifests define the Kubernetes routes and cert-manager owns renewal of their origin certificates.

Provision `solace-acme-dns` in `solace-mail` with the `api-token` key and DNS write and zone read access restricted to `solace.onl`. Flux reconciles the issuer and certificate. cert-manager renews the public certificate in `solace-public-tls`, which both Traefik replicas read. The DNS challenge works before changing the public HTTPS records. Alert on both the Certificate's readiness and the expiry served from each worker.

A cluster administrator applies the networking manifests. On each Webdock worker set K3s `node-external-ip` to the public IPv4 already assigned directly to `eth0`. Keep the existing private `node-ip` for cluster communication. Restart one worker agent at a time and verify its advertised external address. Do not set an external address on the MacBook for this deployment.

ServiceLB publishes the public address for each ready worker in the Service's pool. Keep both pools empty during setup. `externalTrafficPolicy: Local` makes kube-proxy forward the public connection to the local ready Traefik replica with its source address intact. This depends on the provider delivering packets directly to the public IPv4 on the worker. Test a source-restricted API route on each worker before DNS cutover.

Before enrolling a worker, allow the forwarded paths in its existing firewall. Match the original public IPv4 destination and TCP port 443 or 25 and the corresponding post-DNAT target port 9443 or 2525. Keep the allocated NodePorts closed to external traffic. Validate the change with a source-restricted temporary rule before persisting it.

```sh
kubectl label node webdock-1 lbpool.svccontroller.k3s.cattle.io/solace-https=true
kubectl label node webdock-mail lbpool.svccontroller.k3s.cattle.io/solace-https=true
kubectl label node webdock-1 lbpool.svccontroller.k3s.cattle.io/solace-smtp=true
kubectl label node webdock-mail lbpool.svccontroller.k3s.cattle.io/solace-smtp=true
```

Verify Solace HTTPS through the [tunnel runbook](tunnels/) and test both replicas independently. Exercise client-IP rate limits, operator authorization, attachment transfer, and JMAP event reconnection. Verify the enforced MTA-STS policy through normal DNS.

Move the direct SMTP listener one worker at a time. Verify which process owns it and preserve any private relay listeners in the same service. The TCP route carries the original client IP in PROXY v2 and Stalwart handles STARTTLS. Confirm the Kubernetes Service prefers a ready local gateway and uses its peer during drain.

If SMTP fails, remove the SMTP pool label from the affected worker and restore its public HAProxy listener. Repeat tunnel HTTPS and direct STARTTLS checks after the change.

### Public routes for other Zeabur projects

The shared Zeabur tunnel delivers these hostnames to the private `apps` listener on Webdock Traefik. Cloudflare flattens the proxied `roan.dev` CNAME at the zone apex. Service placement determines whether a backend remains available during a node outage.

| Hostnames | Service |
| --- | --- |
| `rift.solace.onl` | `riftbound/expo-web:8080` |
| `riftapi.solace.onl` | `riftbound/rust-api:7000` |
| `roan.dev`, `www.roan.dev` | `portfolio/goport:8080` |
| `demo.roan.dev`, `test2.roan.dev` | `demo/web:8080` |
| `objects.roan.dev` | `demo/files-s3:8333` |
| `errors.roan.dev` | `errors/errex:8080` |
| `builds.roan.dev` | `builder-system/zeabur-builder-webhooks:http` on `/hooks/` |
| `ente.roan.dev`, `enteweb.roan.dev` | `ente/museum:8080`, `ente/ente-web:3000` |

cert-manager issues and renews the Let's Encrypt certificates using DNS-01. Provision `rift-public-acme-dns` in `riftbound` for `solace.onl` and `zeabur-roan-acme-dns` in `cert-manager` for `roan.dev`. Each Secret has one `api-token` key. Use separate Cloudflare tokens with DNS write and zone read on the corresponding zone. The issuers select the exact hostnames listed above.

Set `TRUSTED_PROXY_CIDRS` in Riftbound's `rust-api-runtime` Secret to the Calico pod blocks assigned to the two Webdock workers. Riftbound's NetworkPolicies restrict the API port to its ingress and web proxies. Restart the API after updating the setting and verify both public routes.

Apply the bootstrap manifests after the projects and their Services exist. These Ingresses use the `solace-public` class annotation and the private `apps` entry point. Apply each route's certificate and network policy before switching its public DNS record.

```sh
kubectl apply --server-side --field-manager=rocal-solace-bootstrap -f .zeabur/bootstrap/riftbound-public.yaml
kubectl apply --server-side --field-manager=rocal-solace-bootstrap -f .zeabur/bootstrap/zeabur-project-public.yaml
kubectl apply --server-side --field-manager=rocal-solace-bootstrap -f .zeabur/bootstrap/ente-public.yaml
kubectl -n solace-gitops patch kustomization solace --field-manager=rocal-solace-bootstrap \
  --type=merge --patch-file .zeabur/bootstrap/riftbound-traefik-patch.json
```

Verify each hostname through Cloudflare with TLS hostname validation. Test the Riftbound API response and web CORS, anonymous S3 access denial, and GitHub webhook routing. Requests for these hostnames sent directly to either Webdock IP should reach no application route.

The platform Traefik Helm release advertises `zeabur.roan.dev` for its Ingress objects. The login and dashboard routes share the tunnel address. In the Builder Helm release, keep `webhooks.enabled=true` and set `webhooks.ingress.enabled=false`. The bootstrap manifests provide the Builder's public Ingress.

### Add an application domain from Zeabur

In **Networking → Add domain**, enter a first-level hostname under `roan.dev` and select **traefik/webdock-apps → https** for the route. Zeabur creates an HTTPRoute in the service's project. The project must have the standard `zeabur.com/project=true` label. New Zeabur projects receive it on creation.

The proxied wildcard CNAME points to the shared Zeabur tunnel. Its wildcard rule sends traffic to the Gateway's private listener on platform Traefik. cert-manager renews the Gateway's `*.roan.dev` origin certificate through DNS-01. Add a Git-managed project hostname as an explicit route before the tunnel's wildcard rule and publish a proxied CNAME to the same tunnel.

Apply the administrator-owned [Traefik Helm values](bootstrap/zeabur-traefik-helm.yaml) and [Gateway resources](bootstrap/zeabur-application-gateway.yaml) after the public-project issuer is available. Wait for the Certificate to be Ready and the Gateway to be Programmed. Verify a disposable HTTPRoute externally through the wildcard tunnel.
