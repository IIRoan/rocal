import importlib.util
import io
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import directory

specification = importlib.util.spec_from_file_location("picker_probe", Path(__file__).with_name("picker_probe.py"))
probe = importlib.util.module_from_spec(specification)
specification.loader.exec_module(probe)


def isolated(temporary):
    return patch.dict(os.environ, {"SOLACE_E2E": "1", "SOLACE_E2E_DIR": str(Path(temporary) / "solace-e2e")}, clear=True)


class FakeMaestro:
    """Stands in for one `maestro test` run: writes its trace bundle, then exits or hangs."""

    def __init__(self, entries, hierarchy=None, hang=False):
        self.entries, self.hierarchy, self.hang = entries, hierarchy, hang
        self.pid = 4242

    def __call__(self, command, **options):
        bundle = Path(command[command.index("--test-output-dir") + 1]) / "2026-11-12_000000" / "picker"
        bundle.mkdir(parents=True)
        (bundle / "commands.json").write_text(json.dumps(self.entries))
        if self.hierarchy is not None:
            (bundle / "screen-hierarchy").mkdir()
            (bundle / "screen-hierarchy" / "step-005-assertCondition-private-selector-sentinel.json").write_text(json.dumps(self.hierarchy))
        options["stdout"].write(b"private-log-sentinel Assertion is false")
        return self

    def wait(self, timeout=None):
        if self.hang:
            raise subprocess.TimeoutExpired("maestro", timeout)
        return 1 if self.entries else 0


GRID_FAILURE = [
    {"command": {"tapOnElement": {}}, "metadata": {"status": "COMPLETED", "timestamp": 100000, "duration": 500, "sequenceNumber": 3}},
    {"command": {"assertConditionCommand": {"timeout": "180000"}},
     "metadata": {"status": "FAILED", "timestamp": 101000, "duration": 181000, "sequenceNumber": 4,
                  "evaluatedCommand": {"assertConditionCommand": {"timeout": "180000", "condition": "private-evaluated-sentinel"}}}},
]


class PickerProbeTests(unittest.TestCase):
    def test_a_grid_failure_exports_only_fixed_fields_its_original_tree_and_the_native_capture_request(self):
        with tempfile.TemporaryDirectory() as temporary, isolated(temporary):
            root = directory()
            tree = {"attributes": {"accessibilityText": "Open automatic", "private": "never-export"}, "children": []}
            results = []
            with patch.object(probe.subprocess, "Popen", FakeMaestro(GRID_FAILURE, tree)), \
                    patch.object(probe.journeys, "capture_failure_screenshot") as capture, redirect_stdout(io.StringIO()):
                probe.run_case("maestro", "OWNED-UDID", 1, "automatic", "open-automatic", results)
            self.assertEqual(results[0]["phase"], "grid")
            self.assertFalse(results[0]["passed"])
            capture.assert_called_once_with("ios", {"id": "OWNED-UDID"}, "picker-probe-01-automatic")
            details = json.loads((root / "artifacts/failures/picker-probe-01-automatic.json").read_text())
            self.assertEqual((details["step"], details["commandTimeoutMs"], details["msSincePreviousTap"]), (5, 180000, 500))
            self.assertEqual((details["hierarchySource"], details["phase"]), ("failed-step", "grid"))
            exported = json.loads((root / "artifacts/hierarchy/picker-probe-01-automatic.json").read_text())
            self.assertEqual(exported["attributes"], {"accessibilityText": "Open automatic"})
            for path in (root / "artifacts").rglob("*"):
                self.assertNotIn("private-selector-sentinel", path.name)
                if path.is_file():
                    for sentinel in ("private-log-sentinel", "private-evaluated-sentinel", "never-export"):
                        self.assertNotIn(sentinel, path.read_text(errors="replace"))

    def test_a_hung_case_stops_only_its_own_process_group_and_records_a_timeout(self):
        with tempfile.TemporaryDirectory() as temporary, isolated(temporary):
            results = []
            fake = FakeMaestro([], hang=True)
            with patch.object(probe.subprocess, "Popen", fake), patch.object(probe, "stop_group") as stop, \
                    patch.object(probe.journeys, "capture_failure_screenshot"), redirect_stdout(io.StringIO()):
                probe.run_case("maestro", "OWNED-UDID", 2, "full-screen", "open-full-screen", results)
            stop.assert_called_once_with(fake)
            self.assertEqual((results[0]["reason"], results[0]["phase"]), ("journey-timeout", None))

    def test_timeout_kills_remaining_children_even_when_the_group_leader_exits_on_term(self):
        process = Mock(pid=4242)
        process.wait.return_value = 0
        with patch.object(probe.os, "killpg") as kill:
            probe.stop_group(process)
        self.assertEqual([call.args for call in kill.call_args_list], [(4242, signal.SIGTERM), (4242, signal.SIGKILL)])

    def test_setup_failure_immediately_deletes_the_recorded_simulator(self):
        with tempfile.TemporaryDirectory() as temporary, isolated(temporary):
            commands = []

            def execute(command, **options):
                commands.append(command)
                if command[2] == "create":
                    return "OWNED-UDID"
                if command[2] == "boot":
                    raise subprocess.TimeoutExpired("simctl", 300)

            with patch.object(probe, "select_device_type", return_value=("model", "runtime")), \
                    patch.object(probe, "quiet", side_effect=execute):
                with self.assertRaises(subprocess.TimeoutExpired):
                    probe.create_device(1, Path("PickerProbe.app"))
            self.assertEqual([command[2:] for command in commands[2:]], [["shutdown", "OWNED-UDID"], ["delete", "OWNED-UDID"]])

    def test_only_simulators_this_probe_created_are_shut_down_and_deleted(self):
        with tempfile.TemporaryDirectory() as temporary, isolated(temporary):
            probe.remember_device("OWNED-UDID")
            with patch.object(probe, "quiet") as quiet:
                probe.delete_device("SOMEONE-ELSES-UDID")
                self.assertEqual(quiet.call_count, 0)
                probe.cleanup()
            self.assertEqual([call.args[0][2:] for call in quiet.call_args_list], [["shutdown", "OWNED-UDID"], ["delete", "OWNED-UDID"]])

    def test_a_crashed_case_still_deletes_its_simulator(self):
        with tempfile.TemporaryDirectory() as temporary, isolated(temporary):
            app = directory() / "private/picker-probe/PickerProbe.app"
            app.mkdir(parents=True)
            (app / "PickerProbe").write_text("binary")
            with patch.object(probe, "unpack", return_value="maestro"), \
                    patch.object(probe, "create_device", side_effect=lambda trial, _: f"UDID-{trial}"), \
                    patch.object(probe, "run_case", side_effect=RuntimeError("case crashed")), \
                    patch.object(probe, "delete_device") as delete:
                with self.assertRaises(RuntimeError):
                    probe.probe()
            delete.assert_called_once_with("UDID-1")

    def test_no_new_trial_or_case_starts_after_the_deadline_and_styles_alternate_order(self):
        with tempfile.TemporaryDirectory() as temporary, isolated(temporary):
            root = directory()
            app = root / "private/picker-probe/PickerProbe.app"
            app.mkdir(parents=True)
            (app / "PickerProbe").write_text("binary")
            os.environ.update(PROBE_TRIALS="4", PROBE_SECONDS="600")
            # Deadline set at 0; trial 1 and both its cases start at 0; trial 2 and a case start at 100; then time passes the deadline.
            clock = iter([0, 0, 0, 0, 100, 100, 10_000, 10_000, 10_000])
            cases = []

            def record(tool, identifier, trial, style, open_id, results):
                cases.append((identifier, style))
                results.append({"app": "picker-probe", "name": f"{trial:02d}-{style}", "style": style, "passed": True, "phase": None, "seconds": 1})

            with patch.object(probe, "unpack", return_value="maestro"), \
                    patch.object(probe, "create_device", side_effect=lambda trial, _: f"UDID-{trial}"), \
                    patch.object(probe, "run_case", side_effect=record), \
                    patch.object(probe, "delete_device") as delete, \
                    patch.object(probe.time, "monotonic", side_effect=lambda: next(clock)):
                self.assertTrue(probe.probe())
            self.assertEqual(cases, [("UDID-1", "automatic"), ("UDID-1", "full-screen"), ("UDID-2", "full-screen")])
            self.assertEqual([call.args[0] for call in delete.call_args_list], ["UDID-1", "UDID-2"])
            summary = json.loads((root / "artifacts/picker-probe-summary.json").read_text())
            self.assertEqual(summary["styles"]["full-screen"]["runs"], 2)

    def test_summary_counts_grid_failures_separately_per_style(self):
        results = [
            {"style": "automatic", "passed": False, "phase": "grid"},
            {"style": "automatic", "passed": True, "phase": None},
            {"style": "full-screen", "passed": False, "phase": "cancel"},
        ]
        self.assertEqual(probe.summarize(results), {
            "automatic": {"runs": 2, "passed": 1, "gridNotShown": 1, "otherFailures": 0},
            "full-screen": {"runs": 1, "passed": 0, "gridNotShown": 0, "otherFailures": 1},
        })

    def test_probe_limits_are_clamped_and_non_numeric_values_fall_back(self):
        with patch.dict(os.environ, {"PROBE_TRIALS": "99"}, clear=True):
            self.assertEqual(probe.bounded_int("PROBE_TRIALS", 3, 1, 6), 6)
        with patch.dict(os.environ, {"PROBE_TRIALS": "-1"}, clear=True):
            self.assertEqual(probe.bounded_int("PROBE_TRIALS", 3, 1, 6), 3)


if __name__ == "__main__":
    unittest.main()
