import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from datetime import datetime, timezone
from contextlib import redirect_stdout
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import directory
from build import restore_binaries

specification = importlib.util.spec_from_file_location("native_journeys", Path(__file__).with_name("run.py"))
journeys = importlib.util.module_from_spec(specification)
specification.loader.exec_module(journeys)


class HarnessTests(unittest.TestCase):
    def test_agenda_anchor_stays_bound_to_fixture_time_across_day_and_year_rollovers(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = Path(temporary) / "fixture.json"
            fixture.write_text("{}")
            for instant, expected, key in [(datetime(2026, 11, 5, 23, 59, tzinfo=timezone.utc), "October 29, 2026", "2026-10-29"),
                                           (datetime(2027, 1, 3, 0, 1, tzinfo=timezone.utc), "December 27, 2026", "2026-12-27")]:
                with self.subTest(instant=instant):
                    os.utime(fixture, (instant.timestamp(), instant.timestamp()))
                    self.assertEqual(journeys.agenda_anchor_label(fixture), expected)
                    self.assertEqual(journeys.agenda_anchor_date(fixture).isoformat(), key)

    def test_failure_reasons_do_not_publish_raw_driver_errors(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "solace-e2e"
            with patch.dict(os.environ, {"SOLACE_E2E": "1", "SOLACE_E2E_DIR": str(root)}, clear=True):
                private = directory() / "private"
                (private / "device.json").write_text(json.dumps({"id": "synthetic-device"}))
                (private / "fixture.json").write_text(json.dumps({"email": "journey@solace.test", "password": "secret-output-sentinel"}))
                (private / "maestro-path").write_text("synthetic-maestro")
                def command_failure(*_args, **options):
                    options["stdout"].write(b"java.net.SocketTimeoutException: secret-output-sentinel cookie-token-sentinel")
                    return journeys.subprocess.CompletedProcess([], 1)
                console = io.StringIO()
                results = []
                with patch.object(journeys.subprocess, "run", side_effect=command_failure), \
                        patch.object(journeys, "capture_failure_screenshot") as screenshot, \
                        patch.object(journeys, "capture_failure_hierarchy"), redirect_stdout(console):
                    self.assertFalse(journeys.run_journey("ios", "mail", Path("synthetic.yaml"), results))
                screenshot.assert_called_once()
                self.assertEqual(results[0]["reason"], "driver-timeout")
                exported = console.getvalue() + "".join(path.read_text() for path in (root / "artifacts").rglob("*") if path.is_file())
                self.assertNotIn("secret-output-sentinel", exported)
                self.assertNotIn("cookie-token-sentinel", exported)

    def test_failure_hierarchies_preserve_selectors_and_states_without_credentials(self):
        fixture = {"email": "journey@solace.test", "password": "private-password-sentinel"}
        tree = {"attributes": {"text": "Maestro folder", "value": fixture["email"], "sessionCookie": "private-cookie-sentinel"},
                "selected": True, "checked": False,
                "children": [{"attributes": {"resource-id": "sign-in-password", "value": fixture["password"], "text": "another-private-value"},
                              "children": [{"attributes": {"text": "nested-private-value"}}]},
                             {"attributes": {"className": "SecureTextField", "value": "private-secure-field-value"}}]}
        exported = journeys.sanitized_hierarchy(tree, fixture)
        encoded = json.dumps(exported)
        for value in (*fixture.values(), "private-cookie-sentinel", "another-private-value", "nested-private-value", "private-secure-field-value"):
            self.assertNotIn(value, encoded)
        self.assertTrue(exported["selected"])
        self.assertFalse(exported["checked"])
        self.assertEqual(exported["attributes"]["text"], "Maestro folder")
        self.assertEqual(exported["children"][0]["attributes"]["resource-id"], "sign-in-password")

    def test_native_command_output_stays_private(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "solace-e2e"
            with patch.dict(os.environ, {"SOLACE_E2E": "1", "SOLACE_E2E_DIR": str(root)}, clear=True):
                private = directory() / "private"
                (private / "device.json").write_text(json.dumps({"id": "synthetic-device"}))
                (private / "fixture.json").write_text(json.dumps({"email": "journey@solace.test", "password": "secret-output-sentinel"}))
                (private / "maestro-path").write_text("synthetic-maestro")
                def command_output(*_args, **options):
                    if "stdout" in options:
                        options["stdout"].write(b"secret-output-sentinel")
                    else:
                        print("secret-output-sentinel")
                    return journeys.subprocess.CompletedProcess([], 0)
                console = io.StringIO()
                with patch.object(journeys.subprocess, "run", side_effect=command_output), redirect_stdout(console):
                    self.assertTrue(journeys.run_journey("ios", "mail", Path("synthetic.yaml"), []))
                self.assertNotIn("secret-output-sentinel", console.getvalue())
                self.assertEqual((private / "mail-synthetic.log").read_text(), "secret-output-sentinel")
                for path in (root / "artifacts").rglob("*"):
                    if path.is_file():
                        self.assertNotIn(b"secret-output-sentinel", path.read_bytes())

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

    def test_app_transfer_preserves_executable_bits_and_internal_framework_links(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "solace-e2e"
            source = Path(temporary) / "source"
            framework = source / "calendar.app/Frameworks/Fixture.framework/Versions"
            (framework / "A").mkdir(parents=True)
            (framework / "A/Fixture").write_bytes(b"synthetic framework")
            (framework / "Current").symlink_to("A", target_is_directory=True)
            binary = source / "calendar.app/calendar"
            binary.write_bytes(b"synthetic executable")
            binary.chmod(0o755)
            (source / "mail.app").mkdir()
            with patch.dict(os.environ, {"SOLACE_E2E": "1", "SOLACE_E2E_DIR": str(root)}, clear=True):
                archives = directory() / "private/binary-archives"
                archives.mkdir()
                with tarfile.open(archives / "apps.tar.gz", "w:gz") as package:
                    package.add(source, arcname=".")
                restore_binaries("ios")
                restored = root / "binaries/calendar.app"
                self.assertTrue((restored / "calendar").stat().st_mode & 0o100)
                link = restored / "Frameworks/Fixture.framework/Versions/Current"
                self.assertTrue(link.is_symlink())
                self.assertEqual((link / "Fixture").read_bytes(), b"synthetic framework")

if __name__ == "__main__":
    unittest.main()
