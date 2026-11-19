"""Record the source revisions that should produce new Solace production images."""

import json
import subprocess
import sys
from pathlib import Path

RUST_SHARED = {
    "crates/solace-api-tests/Cargo.toml",
    ".dockerignore", "Cargo.toml", "Cargo.lock", "xtask/Cargo.toml",
    "packages/calendar-ics/src/windows-zones.json",
}
STALWART_FILES = {
    ".dockerignore", "Dockerfile", "frpc-security.patch", "scripts/install-stalwart.sh",
    "scripts/upgrade-1.1.0.py", "railway-entrypoint.sh", "backend-gate.cfg",
    "admin-gate.lua", "stalwart/cli-schema.json", "stalwart/cli-schema.latest",
}


def affected(paths):
    result = set()
    for path in paths:
        if path in RUST_SHARED or path.startswith("crates/solace-api-types/"):
            result.update(("api", "notifications"))
        elif path == "apps/backend/src/main.rs" or path == "apps/backend/Dockerfile":
            result.add("api")
        elif path in ("apps/backend/Cargo.toml", "apps/backend/build.rs") or path.startswith("apps/backend/src/"):
            result.update(("api", "notifications"))
        elif path.startswith("apps/notifications/") and (
            path.removeprefix("apps/notifications/") in {"Dockerfile", "Cargo.toml", "build.rs"}
            or path.startswith("apps/notifications/src/")
        ):
            result.add("notifications")
        elif path.startswith("apps/stalwart/"):
            relative = path.removeprefix("apps/stalwart/")
            if relative in STALWART_FILES or relative.startswith("stalwart/plan/"):
                result.add("stalwart")
    return result


def ancestor(before, after):
    return subprocess.run(["git", "merge-base", "--is-ancestor", before, after]).returncode == 0


def main(before, head, path):
    state = json.loads(path.read_text()) if path.exists() else {
        "apiVersion": "v1", "kind": "ConfigMap",
        "metadata": {"name": "solace-release-requests", "namespace": "solace-gitops"},
        "data": {"sourceRevision": before},
    }
    baseline = state["data"]["sourceRevision"]
    if ancestor(head, baseline) and path.exists():
        print("The release planner has already processed this revision.")
        return
    if not ancestor(baseline, head):
        raise SystemExit("The release baseline is outside the protected branch history.")
    raw = subprocess.check_output(["git", "diff", "--name-only", "--no-renames", "-z", baseline, head])
    components = affected(raw.decode().strip("\0").split("\0"))
    if not components and path.exists():
        print("No production image inputs changed.")
        return
    state["data"]["sourceRevision"] = head
    for component in sorted(components):
        state["data"][component] = head
    path.write_text(json.dumps(state, indent=2) + "\n")
    print("Requested images:", ", ".join(sorted(components)) or "none")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], Path(sys.argv[3]))
