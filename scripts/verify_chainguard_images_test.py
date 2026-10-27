from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from verify_chainguard_images import IDENTITY, ISSUER, amd64_image, runtime_image, verify


IMAGE = "cgr.dev/chainguard/glibc-dynamic"
DIGEST = "sha256:" + "a" * 64
CHILD = "sha256:" + "b" * 64


class RuntimePolicyTests(unittest.TestCase):
    def runtime(self, text):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "Dockerfile"
            path.write_text(text)
            return runtime_image(path)

    def test_verifies_the_final_runtime_and_normalizes_tags(self):
        text = f"FROM debian:bookworm AS build\nFROM --platform=linux/amd64 {IMAGE}:latest@{DIGEST} # runtime\n"
        self.assertEqual(self.runtime(text), f"{IMAGE}@{DIGEST}")

    def test_rejects_unpinned_or_untrusted_final_stages(self):
        for image in [
            f"{IMAGE}:latest",
            f"{IMAGE}@sha256:1234",
            f"cgr.dev.attacker.example/chainguard/glibc-dynamic@{DIGEST}",
            f"cgr.dev/other-organization/glibc-dynamic@{DIGEST}",
            f"docker.io/library/debian@{DIGEST}",
            "${RUNTIME_IMAGE}",
            "build",
        ]:
            with self.subTest(image=image), self.assertRaises(ValueError):
                self.runtime(f"FROM {IMAGE}@{DIGEST} AS build\nFROM {image}\n")

    def test_rejects_missing_runtime(self):
        with self.assertRaises(ValueError):
            self.runtime("# FROM cgr.dev/chainguard/glibc-dynamic:latest\n")

    def test_rejects_platforms_the_verifier_would_not_cover(self):
        for platform in ["linux/arm64", "$TARGETPLATFORM"]:
            with self.subTest(platform=platform), self.assertRaises(ValueError):
                self.runtime(f"FROM --platform={platform} {IMAGE}@{DIGEST}\n")

    def test_selects_amd64_without_using_the_arm64_digest(self):
        manifest = {"manifests": [
            {"digest": DIGEST, "platform": {"os": "linux", "architecture": "arm64"}},
            {"digest": CHILD, "platform": {"os": "linux", "architecture": "amd64"}},
        ]}
        self.assertEqual(amd64_image(f"{IMAGE}@{DIGEST}", manifest), f"{IMAGE}@{CHILD}")

    def test_rejects_missing_ambiguous_or_invalid_amd64_manifests(self):
        valid = {"digest": CHILD, "platform": {"os": "linux", "architecture": "amd64"}}
        for entries in [[], [valid, valid], [{**valid, "digest": "latest"}]]:
            with self.subTest(entries=entries), self.assertRaises(ValueError):
                amd64_image(f"{IMAGE}@{DIGEST}", {"manifests": entries})

    def test_verification_failure_stops_without_attempting_later_checks(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch("verify_chainguard_images.subprocess.run") as run:
                run.side_effect = subprocess.CalledProcessError(1, "cosign")
                with self.assertRaises(subprocess.CalledProcessError):
                    verify(f"{IMAGE}@{DIGEST}", Path(directory), "cosign")
                run.assert_called_once()
                command = run.call_args.args[0]
                self.assertIn(f"--certificate-oidc-issuer={ISSUER}", command)
                self.assertIn(f"--certificate-identity={IDENTITY}", command)
                self.assertTrue(run.call_args.kwargs["check"])

    def test_rejects_empty_verification_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch("verify_chainguard_images.subprocess.run"):
                with self.assertRaisesRegex(ValueError, "verification returned no"):
                    verify(f"{IMAGE}@{DIGEST}", Path(directory), "cosign")


if __name__ == "__main__":
    unittest.main()
