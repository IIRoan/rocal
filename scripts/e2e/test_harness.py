import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import directory

specification = importlib.util.spec_from_file_location("native_journeys", Path(__file__).with_name("run.py"))
journeys = importlib.util.module_from_spec(specification)
specification.loader.exec_module(journeys)


class HarnessTests(unittest.TestCase):
    def test_missing_explicit_test_environment_cannot_create_a_runtime(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "isolated"):
                directory()

    def test_evidence_excludes_raw_traces_credentials_and_symlink_targets(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "solace-e2e"
            environment = {"SOLACE_E2E": "1", "SOLACE_E2E_DIR": str(root)}
            with patch.dict(os.environ, environment, clear=True):
                private = directory() / "private"
                (private / "maestro/case").mkdir(parents=True)
                (private / "maestro/case/failure.png").write_bytes(b"synthetic screenshot")
                (private / "maestro/case/commands.json").write_text('inputText: production-secret-sentinel')
                (private / "credentials.png").write_bytes(b"production-secret-sentinel")
                (private / "maestro/case/linked.png").symlink_to(private / "credentials.png")
                journeys.publish([{"app": "calendar", "name": "calendar-crud", "passed": False, "seconds": 1}])
                published = list((root / "artifacts").rglob("*"))
                self.assertTrue(any(path.name == "failure.png" for path in published))
                self.assertFalse(any(path.name in ("commands.json", "linked.png") for path in published))
                for path in published:
                    if path.is_file():
                        self.assertNotIn(b"production-secret-sentinel", path.read_bytes())
                self.assertIn(b'failures="1"', (root / "artifacts/junit.xml").read_bytes())

    def test_a_symlinked_trace_directory_cannot_publish_external_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "solace-e2e"
            with patch.dict(os.environ, {"SOLACE_E2E": "1", "SOLACE_E2E_DIR": str(root)}, clear=True):
                private = directory() / "private"
                unrelated = Path(temporary) / "credentials"
                unrelated.mkdir()
                (unrelated / "secret.png").write_bytes(b"production-secret-sentinel")
                (private / "maestro").symlink_to(unrelated, target_is_directory=True)
                journeys.publish([])
                self.assertFalse((root / "artifacts/screenshots").exists())

if __name__ == "__main__":
    unittest.main()
