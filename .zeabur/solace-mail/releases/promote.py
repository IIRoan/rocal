"""Start requested builds and promote immutable images to the Flux release inputs."""

import hashlib
from io import BytesIO
import json
import os
import re
import ssl
import tarfile
from pathlib import Path
from urllib.request import Request, urlopen

GITOPS = "/api/v1/namespaces/solace-gitops/configmaps/"
BUILDS = "/apis/builder.zeabur.com/v1alpha1/namespaces/solace-mail/builds/"
DEPLOYMENTS = "/apis/apps/v1/namespaces/solace-mail/deployments/"
SOURCE = "/apis/source.toolkit.fluxcd.io/v1/namespaces/solace-gitops/gitrepositories/solace-release-requests"
ARTIFACT_ROOT = "gitrepository/solace-gitops/solace-release-requests/"
ARTIFACT_PATH = re.compile(ARTIFACT_ROOT + r"[a-f0-9]{40}\.tar\.gz")
MAX_ARTIFACT_SIZE = 64 * 1024
IMAGES = {
    "api": ("SOLACE_API_IMAGE", "solace-api", "api"),
    "notifications": ("SOLACE_NOTIFICATIONS_IMAGE", "notifications", "worker"),
}
REVISION = re.compile(r"[0-9a-f]{40}")
DIGEST = re.compile(r"sha256:[a-f0-9]{64}")


def kube(path, patch=None):
    credentials = Path("/var/run/secrets/kubernetes.io/serviceaccount")
    context = ssl.create_default_context(cafile=str(credentials / "ca.crt"))
    token = (credentials / "token").read_text().strip()
    host = os.environ["KUBERNETES_SERVICE_HOST"]
    request = Request(
        f"https://{host}:{os.environ['KUBERNETES_SERVICE_PORT_HTTPS']}{path}",
        data=json.dumps(patch).encode() if patch is not None else None,
        method="PATCH" if patch is not None else "GET",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/merge-patch+json"},
    )
    with urlopen(request, context=context, timeout=15) as response:
        return json.load(response)


def read_requests(api, open_artifact=urlopen):
    artifact = api(SOURCE).get("status", {}).get("artifact")
    if not artifact:
        return {}
    if not ARTIFACT_PATH.fullmatch(artifact["path"]) or artifact["size"] > MAX_ARTIFACT_SIZE:
        raise ValueError("Flux returned an unexpected release artifact")
    url = "http://source-controller.solace-gitops.svc.cluster.local./" + artifact["path"]
    with open_artifact(url, timeout=10) as response:
        archive = response.read(MAX_ARTIFACT_SIZE + 1)
    digest = "sha256:" + hashlib.sha256(archive).hexdigest()
    if len(archive) > MAX_ARTIFACT_SIZE or digest != artifact["digest"]:
        raise ValueError("Flux release artifact failed its integrity check")
    with tarfile.open(fileobj=BytesIO(archive), mode="r:gz") as release:
        record = release.getmember("requests.json")
        if not record.isfile() or record.size > 4096:
            raise ValueError("Flux release request is not a small JSON file")
        with release.extractfile(record) as requested:
            return json.load(requested)["data"]


def deployed_image(deployment, container):
    spec = deployment["spec"]
    return next(c["image"] for c in spec["template"]["spec"]["containers"] if c["name"] == container)


def ready(deployment, container, image):
    status = deployment.get("status", {})
    spec = deployment["spec"]
    return (
        deployed_image(deployment, container) == image
        and status.get("observedGeneration") == deployment["metadata"]["generation"]
        and spec["replicas"] > 0
        and status.get("availableReplicas", 0) == spec["replicas"]
        and status.get("updatedReplicas", 0) == spec["replicas"]
        and any(c["type"] == "Available" and c["status"] == "True" for c in status.get("conditions", []))
    )


def candidate(api, component, revision):
    if not revision:
        return None
    if not REVISION.fullmatch(revision):
        raise ValueError("Release request has an invalid Git revision")
    path = BUILDS + component
    build = api(path)
    spec = build["spec"]
    source_ref = "refs/tags/solace-build-" + revision
    if spec.get("suspend") or spec["source"]["git"]["ref"] != source_ref:
        api(path, {
            "metadata": {"resourceVersion": build["metadata"]["resourceVersion"]},
            "spec": {"suspend": False, "source": {"git": {"ref": source_ref}}},
        })
        print(f"Requested {component} at {revision[:12]}", flush=True)
        return None
    status = build.get("status", {})
    if (status.get("observedGeneration") != build["metadata"]["generation"]
            or status.get("latestRevision") != revision
            or not any(c["type"] == "Ready" and c["status"] == "True" for c in status.get("conditions", []))):
        return None
    reference, separator, digest = status.get("latestImage", "").rpartition("@")
    repo_prefix, repo_name = reference.rsplit("/", 1) if "/" in reference else ("", "")
    repository = repo_prefix + "/" + repo_name.split(":")[0]
    if not separator or not DIGEST.fullmatch(digest) or repository != f"zot.zot.svc:5000/solace-mail/{component}":
        raise ValueError("Builder returned an unexpected image reference")
    return repository + "@" + digest


def promote(api=kube, requests_from=read_requests):
    requests = requests_from(api)
    current = api(GITOPS + "solace-release-images")
    pins = current.get("data", {})
    if not pins:
        sources = [*IMAGES.values(), ("SOLACE_STALWART_A_IMAGE", "stalwart-a", "stalwart"),
                   ("SOLACE_STALWART_B_IMAGE", "stalwart-b", "stalwart")]
        images = {
            key: deployed_image(api(DEPLOYMENTS + deployment), container)
            for key, deployment, container in sources
        }
        if not all(DIGEST.fullmatch(image.rpartition("@")[2]) for image in images.values()):
            raise ValueError("Cannot seed releases from an unpinned workload")
        api(GITOPS + "solace-release-images", {
            "metadata": {"resourceVersion": current["metadata"]["resourceVersion"]},
            "data": images,
        })
        print("Recorded the currently deployed immutable images.", flush=True)
        return
    changes = {}
    for component, (key, _, _) in IMAGES.items():
        image = candidate(api, component, requests.get(component))
        if image and image != pins[key]:
            changes[key] = image

    a, b = pins["SOLACE_STALWART_A_IMAGE"], pins["SOLACE_STALWART_B_IMAGE"]
    image = candidate(api, "stalwart", requests.get("stalwart"))
    if a != b or (image and image != a):
        a_ready = ready(api(DEPLOYMENTS + "stalwart-a"), "stalwart", a)
        b_ready = ready(api(DEPLOYMENTS + "stalwart-b"), "stalwart", b)
        if b_ready:
            if a != b and a_ready:
                changes["SOLACE_STALWART_B_IMAGE"] = a
            elif image and image != a and (a_ready or a != b):
                changes["SOLACE_STALWART_A_IMAGE"] = image
    if changes:
        api(GITOPS + "solace-release-images", {
            "metadata": {"resourceVersion": current["metadata"]["resourceVersion"]},
            "data": changes,
        })
        print("Updated release inputs: " + ", ".join(sorted(changes)), flush=True)


if __name__ == "__main__":
    promote()
