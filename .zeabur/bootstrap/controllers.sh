#!/bin/sh
set -eu

python3 - <<'PY'
import subprocess
import sys
import yaml

installation = subprocess.check_output([
    "flux", "install", "--version=v2.10.0", "--namespace=solace-gitops",
    "--components=source-controller,kustomize-controller", "--watch-all-namespaces=false", "--export",
])
objects = list(yaml.safe_load_all(installation))
bindings = [item for item in objects if item["kind"] == "ClusterRoleBinding"]
reconciler_binding = next(item for item in bindings if item["roleRef"]["name"] == "cluster-admin")
controller_binding = next(item for item in bindings if item["roleRef"]["name"] == "crd-controller-solace-gitops")
objects.remove(reconciler_binding)
controller_binding["kind"] = "RoleBinding"
controller_binding["metadata"]["namespace"] = "solace-gitops"
controller_binding["subjects"] = [
    item for item in controller_binding["subjects"]
    if item["name"] in {"source-controller", "kustomize-controller"}
]

controller = next(
    item for item in objects
    if item["kind"] == "Deployment" and item["metadata"]["name"] == "kustomize-controller"
)
controller["spec"]["template"]["spec"]["containers"][0]["args"].extend([
    "--default-service-account=solace-reconciler",
    "--no-cross-namespace-refs=true",
    "--no-remote-bases=true",
])
yaml.safe_dump_all(objects, sys.stdout, sort_keys=False)
PY
