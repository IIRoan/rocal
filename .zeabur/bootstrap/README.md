# Bootstrap Solace configuration sync

A cluster administrator owns the namespace admission labels, StorageClasses, Services, Ingresses, NetworkPolicies and RBAC. Flux runs as a namespaced workload reconciler. Use the Flux v2.10.0 CLI and Python with PyYAML. Restore the [platform and data prerequisites](../README.md#dependencies-and-recovery) before activating sync.

Review server-side diffs from the selected commit before applying these bootstrap resources. On a cluster where the earlier bootstrap was installed, remove the obsolete named grant while sync is suspended.

```sh
kubectl diff --server-side -f .zeabur/bootstrap/project.yaml
kubectl apply --server-side -f .zeabur/bootstrap/project.yaml
.zeabur/bootstrap/controllers.sh | kubectl apply --server-side -f -
kubectl -n solace-gitops rollout status deployment/source-controller
kubectl -n solace-gitops rollout status deployment/kustomize-controller
kubectl diff --server-side -k .zeabur/bootstrap/networking
kubectl apply --server-side -k .zeabur/bootstrap/networking
kubectl apply --server-side -f .zeabur/bootstrap/ingress-rbac.yaml
kubectl apply --server-side -f .zeabur/bootstrap/reconciler.yaml
kubectl apply --server-side -f .zeabur/bootstrap/stalwart-rollout.yaml
kubectl delete clusterrolebinding,clusterrole solace-project-bootstrap-resources --ignore-not-found
kubectl apply --server-side -f .zeabur/bootstrap/production-releases.yaml
kubectl apply --server-side -f .zeabur/bootstrap/sync.yaml
```

All three workload stages start suspended. The release inputs are initialized from the current workload pins. On a clean cluster, the Git fallback pins allow Flux to create the workloads before the release controller records their digests. The separate release request stage reads the branch published by GitHub Actions. After the desired commit reaches `master`, review the [server-side diffs](../README.md#deploy-from-git), confirm field ownership and verify the reconciler lacks write access to namespaces and networking. Review the shared stage's API, Redis and PostgreSQL rollouts together. Schedule that first apply with the existing volumes and health checks in place.

Resume the shared stage and Stalwart A separately. Verify the applied revision, Stalwart A readiness, both MX STARTTLS endpoints and private and public JMAP before resuming Stalwart B.

```sh
flux resume kustomization solace --namespace=solace-gitops
flux reconcile kustomization solace --namespace=solace-gitops --with-source
flux resume kustomization solace-stalwart-a --namespace=solace-gitops
flux reconcile kustomization solace-stalwart-a --namespace=solace-gitops
```

After the checks pass, resume Stalwart B and verify both replicas again.

```sh
flux resume kustomization solace-stalwart-b --namespace=solace-gitops
flux reconcile kustomization solace-stalwart-b --namespace=solace-gitops
kubectl -n solace-gitops get gitrepository,kustomization
```

On later revisions, Flux waits for the dependency to be healthy on the same source revision before advancing. The admission policy checks for an available peer on changes to an existing Stalwart pod template. It allows the first creation of each Deployment during recovery.

If A fails, confirm B still serves and revert the rollout in Git. If B fails, keep the available A running. If a revert would also change A's template, restore B's last working template first, then let the Git revert reconcile normally. Suspend the stage that manages any Deployment you need to repair directly, keep the current volumes, and retain the generated ConfigMaps referenced by the running and recovery templates.


## Recover an image rollout

To pause image updates, suspend the release CronJob from Git and wait for its in-flight Job to finish. Check the failed Build or Deployment before changing a pin. For an API or notifications rollback, restore the prior digest in `solace-release-images`. For Stalwart, adjust the failing replica's key first and wait for it to be Available before changing its peer. Flux still applies the rollout. Confirm HTTPS, JMAP and both MX STARTTLS listeners.

To resume, cancel any outstanding request for the failed revision by merging the source fix or revert into `master` and checking that the new request is visible before resuming the CronJob. A Git manifest can also temporarily use a literal digest instead of the release variable to pin a service throughout recovery.
