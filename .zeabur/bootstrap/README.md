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
kubectl delete clusterrolebinding,clusterrole solace-project-bootstrap-resources --ignore-not-found
kubectl apply --server-side -f .zeabur/bootstrap/sync.yaml
```

All three stages start suspended. After the desired commit reaches `master`, review the [server-side diffs](../README.md#deploy-from-git), confirm field ownership and verify the reconciler lacks write access to namespaces and networking. Review the shared stage's API, Redis and PostgreSQL rollouts together. Schedule that first apply with the existing volumes and health checks in place.

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

On later revisions, Flux waits for the dependency to be healthy on the same source revision before advancing. Suspend all three stages to pause reconciliation. Revert a configuration change in Git to roll it back. Retain prior generated ConfigMaps while any live or rollback deployment references them.
