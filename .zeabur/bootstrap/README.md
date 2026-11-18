# Bootstrap Solace configuration sync

A cluster administrator manages these bootstrap objects. Flux reconciles the parent `.zeabur/` tree with permissions limited to the two Solace namespaces and the named Solace namespaces, ingress class, and storage classes. Bootstrap owns the ingress controller's Role and RoleBinding and the reconciler's permissions.

Use the approved Flux v2.10.0 CLI and Python with PyYAML. Verify that the Solace namespaces and the other [project prerequisites](../README.md#dependencies-and-recovery) exist. The controller export installs the source and Kustomize controllers in `solace-gitops` with namespaced controller permissions and scoped impersonation.

```sh
.zeabur/bootstrap/controllers.sh | kubectl apply --server-side -f -
kubectl -n solace-gitops rollout status deployment/source-controller
kubectl -n solace-gitops rollout status deployment/kustomize-controller
kubectl apply --server-side -f .zeabur/bootstrap/ingress-rbac.yaml
kubectl apply --server-side -f .zeabur/bootstrap/reconciler.yaml
kubectl apply --server-side -f .zeabur/bootstrap/sync.yaml
```

The sync starts suspended. After the baseline reaches `master`, check out the exact commit and verify that the server-side diff is empty. Review any drift before activating sync. Resume the Kustomization once the baseline matches production.

```sh
kubectl diff --server-side --field-manager=kustomize-controller -k .zeabur
flux resume kustomization solace --namespace=solace-gitops
kubectl -n solace-gitops wait --for=condition=Ready kustomization/solace --timeout=3m
```

Use `flux suspend kustomization solace --namespace=solace-gitops` to pause reconciliation. Revert a config change in Git to roll it back. Storage or database recovery follows the production runbook.
