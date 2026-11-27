"""Regression checks for selective builds and staged mail rollout."""

import hashlib
import importlib.util
from io import BytesIO
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


def load(path):
    spec = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


planner = load(ROOT / "scripts/solace-release-request.py")
controller = load(ROOT / ".zeabur/solace-mail/releases/promote.py")
REVISION = "a" * 40
API = "SOLACE_API_IMAGE"
NOTIFICATIONS = "SOLACE_NOTIFICATIONS_IMAGE"
FRONTEND = "SOLACE_FRONTEND_IMAGE"
GATUS = "SOLACE_GATUS_IMAGE"
A = "SOLACE_STALWART_A_IMAGE"
B = "SOLACE_STALWART_B_IMAGE"
PINS = {API: "api-old", NOTIFICATIONS: "worker-old", FRONTEND: "web-old", GATUS: "status-old",
        A: "mail-old", B: "mail-old"}


def image(component, char="1"):
    return f"zot.zot.svc:5000/solace-mail/{component}@sha256:" + char * 64


def build(component, revision=REVISION, observed_generation=2):
    return {
        "metadata": {"resourceVersion": "7", "generation": 2},
        "spec": {"source": {"git": {"ref": "refs/tags/solace-build-" + REVISION}}},
        "status": {
            "observedGeneration": observed_generation,
            "latestRevision": revision,
            "latestImage": image(component),
            "conditions": [{"type": "Ready", "status": "True"}],
        },
    }


def replica(pin, healthy=True):
    return {
        "metadata": {"generation": 1},
        "spec": {"replicas": 1, "template": {"spec": {"containers": [{"name": "stalwart", "image": pin}]}}},
        "status": {"observedGeneration": 1, "availableReplicas": int(healthy), "updatedReplicas": 1,
                   "conditions": [{"type": "Available", "status": "True" if healthy else "False"}]},
    }


class SelectiveReleaseTests(unittest.TestCase):
    def test_requests_require_the_flux_artifact_digest(self):
        archive = BytesIO()
        body = json.dumps({"data": {"notifications": REVISION}}).encode()
        with tarfile.open(fileobj=archive, mode="w:gz") as tar:
            member = tarfile.TarInfo("requests.json")
            member.size = len(body)
            tar.addfile(member, BytesIO(body))
        data = archive.getvalue()
        artifact = {
            "path": controller.ARTIFACT_ROOT + REVISION + ".tar.gz",
            "size": len(data),
            "digest": "sha256:" + hashlib.sha256(data).hexdigest(),
        }

        def kube(path):
            self.assertEqual(path, controller.SOURCE)
            return {"status": {"artifact": artifact}}

        def download(url, timeout):
            self.assertEqual(url, "http://source-controller.solace-gitops.svc.cluster.local./" + artifact["path"])
            return BytesIO(data)

        self.assertEqual(controller.read_requests(kube, download), {"notifications": REVISION})
        artifact["digest"] = "sha256:" + "0" * 64
        with self.assertRaisesRegex(ValueError, "integrity check"):
            controller.read_requests(kube, download)

    def test_build_inputs(self):
        for paths, expected in (
            (["apps/backend/src/main.rs"], {"api"}),
            (["apps/backend/Dockerfile"], {"api"}),
            (["apps/notifications/src/event_reminder.html"], {"notifications"}),
            (["apps/backend/src/integrations/stalwart/mailer.rs"], {"api", "notifications"}),
            (["Cargo.lock"], {"api", "notifications"}),
            (["apps/stalwart/stalwart/plan/00-stores.ndjson"], {"stalwart"}),
            ([".zeabur/solace-mail/data.yaml", "apps/stalwart/README.md", "apps/native-mail/app/mail/index.tsx"], set()),
            (["apps/web/app/page.tsx"], {"frontend"}),
            (["packages/mail-editor/src/extensions.ts"], {"frontend"}),
            (["packages/calendar-client/src/index.ts"], {"frontend"}),
            (["bun.lock", "package.json", "patches/next.patch"], {"frontend"}),
            (["packages/native-core/src/index.ts"], set()),
            (["apps/gatus/config.default.yaml"], {"gatus"}),
            ([".zeabur/solace-mail/status/entrypoint.sh"], {"gatus"}),
            ([".dockerignore"], {"api", "notifications", "frontend", "gatus"}),
            (["apps/backend/Dockerfile", "apps/stalwart/railway-entrypoint.sh"], {"api", "stalwart"}),
        ):
            with self.subTest(paths=paths):
                self.assertEqual(planner.affected(paths), expected)

    def test_web_only_push_creates_an_idempotent_release_request(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)

            def git(*args):
                return subprocess.check_output([
                    "git", "-c", "commit.gpgsign=false", "-c", "user.name=Release test",
                    "-c", "user.email=release@example.invalid", *args,
                ], cwd=root, text=True).strip()

            git("init", "-q", "-b", "master")
            git("commit", "-q", "--allow-empty", "-m", "Initial revision")
            before = git("rev-parse", "HEAD")
            page = root / "apps/web/app/page.tsx"
            page.parent.mkdir(parents=True)
            page.write_text("export default function Page() { return null; }\n")
            git("add", ".")
            git("commit", "-q", "-m", "Change only the website")
            head = git("rev-parse", "HEAD")
            request = root / "requests.json"
            command = [sys.executable, "-B", str(ROOT / "scripts/solace-release-request.py"),
                       before, head, str(request)]
            subprocess.check_output(command, cwd=root)
            recorded = request.read_text()
            self.assertEqual(json.loads(recorded)["data"], {"sourceRevision": head, "frontend": head})
            subprocess.check_output(command, cwd=root)
            self.assertEqual(request.read_text(), recorded)

    def reconcile(self, requests, pins=None, builds=None, a_healthy=True, b_healthy=True):
        pins = pins or PINS
        resources = {
            controller.GITOPS + "solace-release-images": {"metadata": {"resourceVersion": "4"}, "data": pins},
            controller.DEPLOYMENTS + "stalwart-a": replica(pins[A], a_healthy),
            controller.DEPLOYMENTS + "stalwart-b": replica(pins[B], b_healthy),
            **{controller.BUILDS + key: value for key, value in (builds or {}).items()},
        }
        writes = []

        def kubernetes(path, patch=None):
            if patch is None:
                return resources[path]
            writes.append((path, patch))

        controller.promote(kubernetes, requests_from=lambda _: requests)
        return writes

    def promoted(self, *args, **kwargs):
        return [patch["data"] for path, patch in self.reconcile(*args, **kwargs)
                if path == controller.GITOPS + "solace-release-images"]

    def test_only_requested_image_is_promoted(self):
        self.assertEqual(self.promoted({"api": REVISION}, builds={"api": build("api")}),
                         [{API: image("api")}])
        self.assertEqual(self.reconcile({}), [])

    def test_frontend_and_status_images_are_promoted(self):
        self.assertEqual(self.promoted({"frontend": REVISION, "gatus": REVISION}, builds={
            "frontend": build("frontend"), "gatus": build("gatus"),
        }), [{FRONTEND: image("frontend"), GATUS: image("gatus")}])

    def test_existing_environment_seeds_only_missing_pins(self):
        pins = {key: value for key, value in PINS.items() if key not in (FRONTEND, GATUS)}
        writes = []
        resources = {
            controller.GITOPS + "solace-release-images": {"metadata": {"resourceVersion": "4"}, "data": pins},
            controller.STATEFULSETS + "solace-web": {
                "spec": {"template": {"spec": {"containers": [{"name": "frontend", "image": image("frontend")} ]}}},
            },
            controller.DEPLOYMENTS + "solace-status": {
                "spec": {"template": {"spec": {"containers": [{"name": "gatus", "image": image("gatus")} ]}}},
            },
        }

        def kubernetes(path, patch=None):
            if patch is None:
                return resources[path]
            writes.append((path, patch))

        controller.promote(kubernetes, requests_from=lambda _: {})
        self.assertEqual(writes, [(controller.GITOPS + "solace-release-images", {
            "metadata": {"resourceVersion": "4"}, "data": {FRONTEND: image("frontend"), GATUS: image("gatus")},
        })])

    def test_failed_and_foreign_frontend_builds_are_not_promoted(self):
        current = build("frontend")
        current["status"]["conditions"] = [{"type": "Ready", "status": "False"}]
        self.assertEqual(self.reconcile({"frontend": REVISION}, builds={"frontend": current}), [])
        current = build("frontend")
        current["status"]["latestImage"] = image("api")
        with self.assertRaisesRegex(ValueError, "unexpected image reference"):
            self.reconcile({"frontend": REVISION}, builds={"frontend": current})

    def test_old_build_status_cannot_be_promoted(self):
        for result in (build("api", revision="b" * 40), build("api", observed_generation=1)):
            self.assertEqual(self.reconcile({"api": REVISION}, builds={"api": result}), [])

    def test_reconciler_requests_the_exact_tag(self):
        current = build("api")
        current["spec"]["suspend"] = True
        self.assertEqual(self.reconcile({"api": REVISION}, builds={"api": current}), [
            (controller.BUILDS + "api", {
                "metadata": {"resourceVersion": "7"},
                "spec": {"suspend": False, "source": {"git": {"ref": "refs/tags/solace-build-" + REVISION}}},
            }),
        ])

    def test_stalwart_waits_for_a_before_promoting_b(self):
        requests = {"stalwart": REVISION}
        builds = {"stalwart": build("stalwart")}
        self.assertEqual(self.promoted(requests, builds=builds), [{A: image("stalwart")}])
        pins = {**PINS, A: image("stalwart")}
        self.assertEqual(self.promoted(requests, pins=pins, builds=builds, a_healthy=False), [])
        self.assertEqual(self.promoted(requests, pins=pins, builds=builds), [{B: image("stalwart")}])
        self.assertEqual(self.promoted(requests, builds=builds, b_healthy=False), [])
        self.assertEqual(self.promoted(requests, pins={**PINS, A: image("stalwart", "2")}, builds=builds,
                                      a_healthy=False), [{A: image("stalwart")}])


if __name__ == "__main__":
    unittest.main()
