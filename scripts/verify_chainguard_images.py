import argparse
import json
from pathlib import Path
import re
import shlex
import subprocess


ISSUER = "https://token.actions.githubusercontent.com"
IDENTITY = "https://github.com/chainguard-images/images/.github/workflows/release.yaml@refs/heads/main"
DIGEST = r"sha256:[a-f0-9]{64}"
IMAGE = rf"cgr\.dev/chainguard/[a-z0-9][a-z0-9._-]*(?::[a-zA-Z0-9._-]+)?@{DIGEST}"
DOCKERFILES = ("apps/backend/Dockerfile", "apps/notifications/Dockerfile")


def runtime_image(dockerfile):
    stages = [
        shlex.split(line, comments=True)
        for line in dockerfile.read_text().splitlines()
        if re.match(r"^\s*FROM\s", line, re.IGNORECASE)
    ]
    if not stages:
        raise ValueError(f"{dockerfile}: no runtime stage found")
    args = stages[-1][1:]
    if args and args[0].startswith("--platform="):
        if args[0] != "--platform=linux/amd64":
            raise ValueError(f"{dockerfile}: runtime platform must be linux/amd64")
        args = args[1:]
    if not args or not re.fullmatch(IMAGE, args[0]):
        raise ValueError(f"{dockerfile}: runtime must be a digest-pinned public Chainguard image")
    repository, digest = args[0].split("@")
    return f"{repository.split(':')[0]}@{digest}"


def amd64_image(image, manifest):
    matches = [
        entry
        for entry in manifest.get("manifests", [])
        if entry.get("platform", {}).get("os") == "linux"
        and entry.get("platform", {}).get("architecture") == "amd64"
    ]
    if len(matches) != 1 or not re.fullmatch(DIGEST, matches[0].get("digest", "")):
        raise ValueError(f"{image}: expected exactly one digest-pinned linux/amd64 manifest")
    return f"{image.split('@')[0]}@{matches[0]['digest']}"


def verify(image, output, cosign):
    output.mkdir(parents=True, exist_ok=True)
    trust = [f"--certificate-oidc-issuer={ISSUER}", f"--certificate-identity={IDENTITY}"]
    checks = (
        ("signature.json", ["verify"]),
        ("sbom.jsonl", ["verify-attestation", "--type=https://spdx.dev/Document"]),
        ("provenance.jsonl", ["verify-attestation", "--type=https://slsa.dev/provenance/v1"]),
    )
    for filename, command in checks:
        with (output / filename).open("wb") as evidence:
            subprocess.run([cosign, "--timeout=90s", *command, *trust, image], check=True, stdout=evidence)
        if not (output / filename).stat().st_size:
            raise ValueError(f"{image}: verification returned no {filename}")


def main():
    parser = argparse.ArgumentParser(description="Verify both Rust services' Chainguard runtime images.")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--cosign", default="cosign")
    parser.add_argument("--container-cli", choices=("docker", "podman"), default="docker")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    images = {path: runtime_image(root / path) for path in DOCKERFILES}
    report = {"issuer": ISSUER, "identity": IDENTITY, "dockerfiles": images, "verified": []}
    for image in sorted(set(images.values())):
        output = args.output / image.split("@")[-1].replace(":", "-")
        verify(image, output / "index", args.cosign)
        manifest = subprocess.check_output([args.container_cli, "manifest", "inspect", image])
        runtime = amd64_image(image, json.loads(manifest))
        (output / "manifest.json").write_bytes(manifest)
        # The index SBOM lists architectures; the amd64 SBOM lists the packages Railway actually runs.
        verify(runtime, output / "linux-amd64", args.cosign)
        report["verified"].append({"index": image, "linux/amd64": runtime})
        print(f"Verified image signatures, SPDX SBOMs and SLSA provenance: {image} (linux/amd64)")
    (args.output / "verification.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
