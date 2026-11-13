import importlib.util
import io
import json
import os
from pathlib import Path
import re
import signal
import sys
import tarfile
import tempfile
import time
import unittest
from datetime import datetime, timezone
from contextlib import redirect_stdout
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import directory
from build import restore_binaries
import connectivity

specification = importlib.util.spec_from_file_location("native_journeys", Path(__file__).with_name("run.py"))
journeys = importlib.util.module_from_spec(specification)
specification.loader.exec_module(journeys)
ANDROID_READY = {"backendAlive": True, "hostHealthy": True, "deviceState": "device", "reverse": {"4001": True, "59000": True}}
RUN_MAESTRO = journeys.run_maestro
# A Maestro stand-in: its host child signals readiness, then acts only once the test opens the gate after the parent's deadline.
GATED_PARENT = """
import pathlib, subprocess, sys, time
work = pathlib.Path(sys.argv[1])
child = '''
import os, pathlib, sys, time
work = pathlib.Path(sys.argv[1])
(work / "child-ready").write_text(str(os.getpid()))
deadline = time.monotonic() + 60
while not (work / "gate").exists() and time.monotonic() < deadline:
    time.sleep(0.02)
(work / "acted").write_text("child acted")
'''
subprocess.Popen([sys.executable, "-c", child, str(work)])
while not (work / "child-ready").exists():
    time.sleep(0.02)
print("leader-ready", flush=True)
if sys.argv[2] == "sleep":
    time.sleep(600)
"""


class HarnessTests(unittest.TestCase):
    def setUp(self):
        # Journey tests answer Maestro through their subprocess.run fakes; the owned process group is tested with real processes below.
        routed = patch.object(journeys, "run_maestro", side_effect=lambda command, environment, log, timeout: journeys.subprocess.run(
            command, cwd=journeys.REPO, env=environment, check=False, timeout=timeout, stdout=log, stderr=journeys.subprocess.STDOUT).returncode)
        routed.start()
        self.addCleanup(routed.stop)

    def gated_maestro(self, mode, timeout):
        work = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: (work / "gate").touch())
        log_path = work / "maestro.log"
        reserved, real_killpg = [], os.killpg
        def killpg(group, number):
            # Signal 0 reaches an unreaped leader; once reaped, its id is free for reuse and must never be signaled as a group.
            try:
                os.kill(group, 0)
                reserved.append(True)
            except ProcessLookupError:
                reserved.append(False)
            real_killpg(group, number)
        with log_path.open("wb") as log, patch.object(journeys.os, "killpg", side_effect=killpg):
            try:
                code = RUN_MAESTRO([sys.executable, "-c", GATED_PARENT, str(work), mode], dict(os.environ), log, timeout)
            except BaseException as error:
                code = error
        self.assertTrue(all(reserved))
        self.assertEqual(len(reserved), 0 if mode == "exit" else 1)
        # The child was alive and ready before the parent's deadline, so a missing action below is never a startup race.
        self.assertTrue((work / "child-ready").exists())
        self.assertIn(b"leader-ready", log_path.read_bytes())
        (work / "gate").touch()
        time.sleep(0.5)
        return code, (work / "acted").exists()

    def test_maestro_keeps_normal_exit_codes_output_and_never_kills_a_reaped_group(self):
        with tempfile.TemporaryDirectory() as temporary, patch.object(journeys.os, "killpg", wraps=os.killpg) as killpg:
            for expected in (0, 3):
                log_path = Path(temporary) / f"exit-{expected}.log"
                with log_path.open("wb") as log:
                    script = f"import sys; print('normal-output', flush=True); print('normal-error', file=sys.stderr, flush=True); sys.exit({expected})"
                    self.assertEqual(RUN_MAESTRO([sys.executable, "-c", script], dict(os.environ), log, 30), expected)
                self.assertEqual(sorted(log_path.read_text().split()), ["normal-error", "normal-output"])
            # The leader was reaped by a normal wait, so its group id may already name an unrelated process group.
            code, acted = self.gated_maestro("exit", 30)
            self.assertEqual(code, 0)
            self.assertTrue(acted)
            killpg.assert_not_called()

    def test_maestro_timeout_stops_its_host_children_before_reaping_the_leader(self):
        code, acted = self.gated_maestro("sleep", 3)
        self.assertIsInstance(code, journeys.subprocess.TimeoutExpired)
        self.assertFalse(acted)

    def test_an_interrupted_maestro_run_does_not_orphan_its_new_session(self):
        def interrupt(*_):
            raise KeyboardInterrupt
        previous = signal.signal(signal.SIGALRM, interrupt)
        signal.setitimer(signal.ITIMER_REAL, 2)
        try:
            code, acted = self.gated_maestro("sleep", 60)
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
            signal.signal(signal.SIGALRM, previous)
        self.assertIsInstance(code, KeyboardInterrupt)
        self.assertFalse(acted)

    def test_macos_and_container_mail_fixtures_use_the_same_stalwart_release(self):
        repository = Path(__file__).resolve().parents[2]
        dockerfile = (repository / "apps/stalwart/test-env/Dockerfile").read_text()
        target = re.search(r"FROM stalwartlabs/stalwart:v([^@\s]+)@sha256:", dockerfile)
        self.assertIsNotNone(target)
        tools = json.loads((repository / "scripts/e2e/tools.json").read_text())
        for architecture in ("arm64", "x86_64"):
            with self.subTest(architecture=architecture):
                tool = tools["stalwart-" + architecture]
                self.assertIn(f"/releases/download/v{target.group(1)}/", tool["url"])
                self.assertRegex(tool["sha256"], r"^[0-9a-f]{64}$")

    def test_focused_ios_diagnostic_runs_calendar_and_photo_in_order_and_stops_on_failure(self):
        with patch.object(journeys, "run_journey", return_value=True) as execute, patch.object(journeys, "publish") as publish:
            journeys.main("ios", diagnostic=True)
            self.assertEqual([(call.args[0], call.args[1], call.args[2].stem) for call in execute.call_args_list],
                             [("ios", "calendar", "01-authentication"), ("ios", "calendar", "02-calendar-management"),
                              ("ios", "calendar", "07-profile-picture")])
            publish.assert_called_once()
            execute.reset_mock(return_value=True)
            publish.reset_mock()
            execute.return_value = False
            with self.assertRaisesRegex(SystemExit, "failed"):
                journeys.main("ios", diagnostic=True)
            execute.assert_called_once()
            publish.assert_not_called()
            execute.reset_mock()
            with self.assertRaisesRegex(SystemExit, "iOS only"):
                journeys.main("android", diagnostic=True)
            execute.assert_not_called()

    def test_staged_calendar_failures_stay_visible_and_continue_the_remaining_suite(self):
        with tempfile.TemporaryDirectory() as temporary:
            repository = Path(temporary) / "repository"
            calendar = ("01-authentication", "02-calendar-management", "03-content", "04-dependent")
            for app, names in (("calendar", calendar),
                               ("mail", ("01-unlock", "offline", "sign-out"))):
                parent = repository / "e2e/native" / app
                parent.mkdir(parents=True)
                for name in names:
                    (parent / f"{name}.yaml").touch()
            expected = [("calendar", name) for name in calendar]
            expected += [("mail", name) for name in ("01-unlock", "offline", "online-recovery", "sign-out")]
            for index, failed in enumerate((None, *expected[:3])):
                with self.subTest(failed=failed):
                    calls = []
                    output = Path(temporary) / f"output-{index}"
                    root = Path(temporary) / str(index) / "solace-e2e"
                    def execute(_platform, app, flow, results, **_options):
                        calls.append((app, flow.stem))
                        passed = calls[-1] != failed
                        results.append({"app": app, "name": flow.stem, "passed": passed, "seconds": 1})
                        journeys.publish(results)
                        return passed
                    with patch.dict(os.environ, {"SOLACE_E2E": "1", "SOLACE_E2E_DIR": str(root), "GITHUB_OUTPUT": str(output)}, clear=True), \
                            patch.object(journeys, "REPO", repository), patch.object(journeys, "run_journey", side_effect=execute), \
                            patch.object(journeys.os, "kill") as backend_signal, \
                            patch.object(journeys.subprocess, "run", return_value=journeys.subprocess.CompletedProcess([], 0, stdout="xtask e2e serve")):
                        (directory() / "private/backend.pid").write_text("4242")
                        if failed in (None, expected[2]):
                            journeys.run_calendar_start("ios")
                        else:
                            with self.assertRaises(SystemExit):
                                journeys.run_calendar_start("ios")
                        self.assertEqual(calls, expected[:1 if failed == expected[0] else 2])
                        if failed == expected[0]:
                            self.assertFalse(output.exists())
                            with self.assertRaises(SystemExit):
                                journeys.main("ios", resume=True)
                            backend_signal.assert_not_called()
                        else:
                            self.assertEqual(output.read_text(), "ready=true\n")
                            if failed is None:
                                journeys.main("ios", resume=True)
                            else:
                                with self.assertRaises(SystemExit):
                                    journeys.main("ios", resume=True)
                            self.assertEqual(calls, expected[:3] if failed == expected[2] else expected)
                            self.assertEqual(backend_signal.called, failed != expected[2])
                            rows = json.loads((directory() / "artifacts/results.json").read_text())["results"]
                            self.assertEqual(len(rows), len(calls))
                            self.assertEqual([row["name"] for row in rows if not row["passed"]], [] if failed is None else [failed[1]])

    def test_split_ios_jobs_run_only_their_app_and_mail_signs_in_through_calendar_first(self):
        with tempfile.TemporaryDirectory() as temporary:
            repository = Path(temporary) / "repository"
            for app, names in (("calendar", ("01-authentication", "02-calendar-management", "03-content")),
                               ("mail", ("01-unlock", "offline", "sign-out"))):
                parent = repository / "e2e/native" / app
                parent.mkdir(parents=True)
                for name in names:
                    (parent / f"{name}.yaml").touch()
            mail_run = [("calendar", "01-authentication"), ("mail", "01-unlock"), ("mail", "offline"),
                        ("mail", "online-recovery"), ("mail", "sign-out")]
            for index, (app, failed, staged, expected) in enumerate((
                    ("calendar", None, True, [("calendar", "01-authentication"), ("calendar", "02-calendar-management"), ("calendar", "03-content")]),
                    ("mail", None, False, mail_run),
                    ("mail", mail_run[0], False, mail_run[:1]),
                    ("contacts", None, False, []))):
                with self.subTest(app=app, failed=failed):
                    calls = []
                    root = Path(temporary) / str(index) / "solace-e2e"
                    def execute(_platform, journey_app, flow, results, **_options):
                        calls.append((journey_app, flow.stem))
                        results.append({"app": journey_app, "name": flow.stem, "passed": calls[-1] != failed, "seconds": 1})
                        journeys.publish(results)
                        return calls[-1] != failed
                    with patch.dict(os.environ, {"SOLACE_E2E": "1", "SOLACE_E2E_DIR": str(root), "E2E_APP": app}, clear=True), \
                            patch.object(journeys, "REPO", repository), patch.object(journeys, "run_journey", side_effect=execute), \
                            patch.object(journeys.os, "kill") as backend_signal, \
                            patch.object(journeys.subprocess, "run", return_value=journeys.subprocess.CompletedProcess([], 0, stdout="xtask e2e serve")):
                        (directory() / "private/backend.pid").write_text("4242")
                        if staged:
                            journeys.run_calendar_start("ios")
                        if failed is None and app != "contacts":
                            journeys.main("ios", resume=staged)
                        else:
                            with self.assertRaises(SystemExit):
                                journeys.main("ios", resume=staged)
                        self.assertEqual(calls, expected)
                        self.assertEqual(backend_signal.called, app == "mail" and failed is None)

    def test_calendar_continuation_rejects_missing_reordered_duplicate_and_invalid_results(self):
        with tempfile.TemporaryDirectory() as temporary, \
                patch.dict(os.environ, {"SOLACE_E2E": "1", "SOLACE_E2E_DIR": str(Path(temporary) / "solace-e2e")}, clear=True):
            target = directory() / "artifacts/results.json"
            prefix = [{"app": "calendar", "name": name, "passed": True, "seconds": 1}
                      for name in journeys.CALENDAR_START]
            invalid = [None, {}, [], prefix[:1], list(reversed(prefix)), [prefix[0], prefix[0]],
                       [{**prefix[0], "passed": False}, prefix[1]],
                       [prefix[0], {**prefix[1], "passed": "true"}]]
            with patch.object(journeys, "run_journey") as execute:
                for results in invalid:
                    target.write_text(json.dumps({"results": results}))
                    with self.assertRaises(SystemExit):
                        journeys.main("ios", resume=True)
                target.unlink()
                with self.assertRaises(SystemExit):
                    journeys.main("ios", resume=True)
                execute.assert_not_called()

    def test_failure_assertion_target_exports_only_known_labels_without_credentials(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            log = root / "log.txt"
            log.write_text("Flow failed")
            traces = root / "traces"
            traces.mkdir()
            for selector, expected in (("(q|Q)", "software-keyboard"), ("sign-in-email", "sign-in-email"), ("Welcome back", "sign-in-screen"), ("private-unknown", None)):
                assertion = {"selector": selector, "text": "password-secret-sentinel"}
                (traces / "commands.json").write_text(json.dumps([{"command": {"assertConditionCommand": assertion}, "metadata": {"status": "FAILED"}}]))
                details = journeys.failure_details(log, None, traces, "maestro-failure")
                self.assertEqual(details["assertionTarget"], expected)
                self.assertEqual(details["step"], 1)
                self.assertNotIn("secret-sentinel", json.dumps(details))
                self.assertNotIn("private-unknown", json.dumps(details))
            (traces / "commands.json").write_text(json.dumps([
                {"command": {"assertConditionCommand": {"selector": "(q|Q)"}}, "metadata": {"status": "FAILED"}},
                {"command": {"assertConditionCommand": {"selector": "private-unknown"}}, "metadata": {"status": "FAILED"}},
            ]))
            details = journeys.failure_details(log, None, traces, "maestro-failure")
            self.assertIsNone(details["assertionTarget"])
            self.assertEqual(details["step"], 2)
            (traces / "commands.json").write_text(json.dumps([
                {"command": {"assertConditionCommand": {"selector": "(q|Q)"}}, "metadata": {"status": "FAILED"}},
                {"command": {"inputTextCommand": {"text": "password-secret-sentinel"}}, "metadata": {"status": "FAILED"}},
            ]))
            details = journeys.failure_details(log, None, traces, "maestro-failure")
            self.assertEqual(details["command"], "inputText")
            self.assertEqual(details["step"], 2)
            self.assertIsNone(details["assertionTarget"])
            self.assertNotIn("secret-sentinel", json.dumps(details))

    def test_failed_journey_uses_its_original_hierarchy_and_exports_only_bounded_timings(self):
        with tempfile.TemporaryDirectory() as temporary, \
                patch.dict(os.environ, {"SOLACE_E2E": "1", "SOLACE_E2E_DIR": str(Path(temporary) / "solace-e2e")}, clear=True):
            root = directory()
            fixture = {"email": "email-secret-sentinel", "password": "password-secret-sentinel"}
            private = root / "private"
            (private / "device.json").write_text(json.dumps({"id": "synthetic-device"}))
            (private / "fixture.json").write_text(json.dumps(fixture))
            (private / "maestro-path").write_text("synthetic-maestro")
            original = {"attributes": {"text": "Original failed screen email-secret-sentinel", "private": "never-export"},
                        "children": [{"attributes": {"resource-id": "sign-in-password", "text": "password-secret-sentinel"}}]}
            original_available = True
            def execute(command, **options):
                if "test" in command:
                    traces = private / "maestro/calendar-synthetic/flow"
                    hierarchy = traces / "screen-hierarchy"
                    hierarchy.mkdir(parents=True, exist_ok=True)
                    if original_available:
                        (hierarchy / "step-007-private-selector-sentinel.json").write_text(json.dumps(original))
                    entries = [
                        {"command": {"tapOnElement": {}}, "metadata": {"status": "COMPLETED", "timestamp": 99000, "duration": 100}},
                        {"command": {"assertConditionCommand": {"text": "private-selector-sentinel"}},
                         "metadata": {"status": "FAILED", "timestamp": 100000, "duration": 45000, "sequenceNumber": 6,
                                      "evaluatedCommand": {"assertConditionCommand": {"timeout": "30000", "text": "private-selector-sentinel"}}}},
                    ]
                    (traces / "commands.json").write_text(json.dumps(entries))
                    options["stdout"].write(b"Assertion is false")
                    return journeys.subprocess.CompletedProcess(command, 1)
                options["stdout"].write(json.dumps({"attributes": {"text": "Later restarted driver screen"}}).encode())
                return journeys.subprocess.CompletedProcess(command, 0)
            with patch.object(journeys.subprocess, "run", side_effect=execute) as commands, \
                    patch.object(journeys, "capture_failure_screenshot"), redirect_stdout(io.StringIO()):
                self.assertFalse(journeys.run_journey("ios", "calendar", Path("synthetic.yaml"), []))
            target = root / "artifacts/hierarchy/calendar-synthetic.json"
            self.assertEqual(json.loads(target.read_text()), journeys.sanitized_hierarchy(original, fixture))
            self.assertEqual(commands.call_count, 1)
            details = json.loads((root / "artifacts/failures/calendar-synthetic.json").read_text())
            self.assertEqual(details["commandDurationMs"], 45000)
            self.assertEqual(details["msSincePreviousTap"], 900)
            self.assertEqual(details["commandTimeoutMs"], 30000)
            self.assertEqual(details["step"], 7)
            self.assertEqual(details["hierarchySource"], "failed-step")
            for path in (root / "artifacts").rglob("*"):
                self.assertNotIn("private-selector-sentinel", path.name)
                if path.is_file():
                    self.assertNotIn("secret-sentinel", path.read_text())
                    self.assertNotIn("never-export", path.read_text())
            original_available = False
            (private / "maestro/calendar-synthetic/flow/screen-hierarchy/step-007-private-selector-sentinel.json").unlink()
            with patch.object(journeys.subprocess, "run", side_effect=execute) as commands, \
                    patch.object(journeys, "capture_failure_screenshot"), redirect_stdout(io.StringIO()):
                self.assertFalse(journeys.run_journey("ios", "calendar", Path("synthetic.yaml"), []))
            self.assertEqual(commands.call_count, 2)
            details = json.loads((root / "artifacts/failures/calendar-synthetic.json").read_text())
            self.assertEqual(details["hierarchySource"], "post-failure")
            self.assertEqual(json.loads(target.read_text())["attributes"]["text"], "Later restarted driver screen")

    def test_recovered_assertion_does_not_replace_a_later_unknown_failure(self):
        with tempfile.TemporaryDirectory() as temporary, \
                patch.dict(os.environ, {"SOLACE_E2E": "1", "SOLACE_E2E_DIR": str(Path(temporary) / "solace-e2e")}, clear=True):
            root = directory()
            traces = root / "private/traces"
            hierarchy = traces / "screen-hierarchy"
            hierarchy.mkdir(parents=True)
            entries = [
                {"command": {"runFlowCommand": {}}, "metadata": {"status": "FAILED", "sequenceNumber": 0}},
                {"command": {"assertConditionCommand": {}}, "metadata": {"status": "FAILED", "sequenceNumber": 2}},
                {"command": {"assertConditionCommand": {}}, "metadata": {"status": "COMPLETED", "sequenceNumber": 3}},
                {"command": {"backCommand": {}}, "metadata": {"status": "FAILED", "sequenceNumber": 8}},
            ]
            (traces / "commands.json").write_text(json.dumps(entries))
            (hierarchy / "step-003-stale.json").write_text(json.dumps({"attributes": {"text": "Recovered failure"}}))
            expected = {"children": [{"attributes": {"text": "Current failure"}, "children": []}]}
            (hierarchy / "step-009.json").write_text(json.dumps(expected))
            log = root / "private/journey.log"
            log.write_text("Failure")
            details = journeys.failure_details(log, None, traces, "maestro-failure")
            self.assertEqual(details["command"], "other")
            self.assertEqual(details["step"], 9)
            self.assertTrue(journeys.export_failed_step_hierarchy(traces, {}, "calendar-synthetic", details))
            exported = json.loads((root / "artifacts/hierarchy/calendar-synthetic.json").read_text())
            self.assertEqual(exported, journeys.sanitized_hierarchy(expected, {}))

    def test_failure_timings_reject_unbounded_or_non_numeric_metadata(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            log = root / "log.txt"
            log.write_text("Assertion is false")
            traces = root / "traces"
            traces.mkdir()
            for invalid in (None, True, -1, 1_200_001, "private-timing-sentinel", {}):
                with self.subTest(invalid=invalid):
                    entries = [
                        {"command": {"tapOnElement": {}}, "metadata": {"status": "COMPLETED", "timestamp": 99000, "duration": invalid}},
                        {"command": {"assertConditionCommand": {"timeout": invalid}}, "metadata": {"status": "FAILED", "timestamp": 100000, "duration": invalid}},
                    ]
                    (traces / "commands.json").write_text(json.dumps(entries))
                    details = journeys.failure_details(log, None, traces, "assertion")
                    self.assertIsNone(details["commandDurationMs"])
                    self.assertIsNone(details["msSincePreviousTap"])
                    self.assertIsNone(details["commandTimeoutMs"])
                    self.assertNotIn("private-timing-sentinel", json.dumps(details))
            for timestamp in (None, True, -1, 98000, 1_500_000, "private-timing-sentinel"):
                entries[0]["metadata"]["duration"] = 100
                entries[1]["metadata"].update(timestamp=timestamp, duration=0)
                (traces / "commands.json").write_text(json.dumps(entries))
                details = journeys.failure_details(log, None, traces, "assertion")
                self.assertEqual(details["commandDurationMs"], 0)
                self.assertIsNone(details["msSincePreviousTap"])

    def test_original_hierarchy_rejects_other_steps_invalid_json_and_path_escapes(self):
        for kind in ("other-step", "invalid", "array", "oversized", "file-link", "directory-link", "trace-link", "root-link"):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as temporary, \
                    patch.dict(os.environ, {"SOLACE_E2E": "1", "SOLACE_E2E_DIR": str(Path(temporary) / "solace-e2e")}, clear=True):
                root = directory()
                traces = root / "private/traces"
                flow = traces / "flow"
                hierarchy = flow / "screen-hierarchy"
                hierarchy.mkdir(parents=True)
                metadata = {"status": "FAILED", "sequenceNumber": 6}
                entries = [{"command": {"assertConditionCommand": {}}, "metadata": metadata}]
                (flow / "commands.json").write_text(json.dumps(entries))
                outside = root / "private/outside"
                outside.mkdir()
                external = outside / "step-007-private-filename-sentinel.json"
                external.write_text(json.dumps({"attributes": {"text": "private-outside-sentinel"}}))
                target = hierarchy / external.name
                if kind == "other-step":
                    (hierarchy / "step-008-private-filename-sentinel.json").write_text(external.read_text())
                elif kind in ("invalid", "array"):
                    target.write_text("private-invalid-sentinel" if kind == "invalid" else "[]")
                elif kind == "oversized":
                    with target.open("wb") as output:
                        output.truncate(8 * 1024 * 1024 + 1)
                elif kind == "file-link":
                    target.symlink_to(external)
                elif kind == "directory-link":
                    hierarchy.rmdir()
                    hierarchy.symlink_to(outside, target_is_directory=True)
                elif kind == "trace-link":
                    (flow / "commands.json").unlink()
                    (outside / "commands.json").write_text(json.dumps(entries))
                    (flow / "commands.json").symlink_to(outside / "commands.json")
                else:
                    linked = root / "private/linked"
                    linked.symlink_to(traces, target_is_directory=True)
                    traces = linked
                self.assertFalse(journeys.export_failed_step_hierarchy(traces, {}, "calendar-synthetic", {"step": 7, "command": "assertCondition"}))
                self.assertFalse((root / "artifacts/hierarchy/calendar-synthetic.json").exists())

    def test_hierarchy_failures_report_only_fixed_categories(self):
        cases = (("exit-status=7", None, 7, b""), ("invalid-json", None, 0, b"private-invalid-json"),
                 ("invalid-shape", None, 0, b"[]"), ("timeout", journeys.subprocess.TimeoutExpired("private-command", 60), 0, b""),
                 ("os-error", OSError("private-os-error"), 0, b""))
        for reason, failure, code, content in cases:
            with self.subTest(reason=reason), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary) / "solace-e2e"
                def execute(*_args, **kwargs):
                    if failure is not None:
                        raise failure
                    kwargs["stdout"].write(content)
                    return journeys.subprocess.CompletedProcess([], code)
                console = io.StringIO()
                with patch.dict(os.environ, {"SOLACE_E2E":"1", "SOLACE_E2E_DIR":str(root)}, clear=True), \
                        patch.object(journeys.subprocess, "run", side_effect=execute), redirect_stdout(console):
                    directory()
                    journeys.capture_failure_hierarchy("test-maestro", {"id":"test-device"}, {}, "test-flow", {})
                self.assertIn(f"({reason}): test-flow", console.getvalue())
                self.assertNotIn("private", console.getvalue())

    def test_mail_recovery_order_and_prerequisite_failures(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "solace-e2e"
            repository = Path(temporary) / "repository"
            for app, names in (("calendar", ["01-authentication"]),
                               ("mail", ["01-unlock-and-draft", "04-mailboxes-and-labels", "07-conversation-first-message",
                                         "08-conversation-replies", "09-conversation-reader", "offline", "sign-out"])):
                parent = repository / "e2e/native" / app
                parent.mkdir(parents=True)
                for name in names:
                    (parent / f"{name}.yaml").write_text("synthetic")
            with patch.dict(os.environ, {"SOLACE_E2E": "1", "SOLACE_E2E_DIR": str(root)}, clear=True):
                (directory() / "private/backend.pid").write_text("4242")
                expected = ["01-authentication", "01-unlock-and-draft", "04-mailboxes-and-labels", "suspended",
                            "offline", "resumed", "online-recovery", "07-conversation-first-message",
                            "08-conversation-replies", "09-conversation-reader", "sign-out"]
                for failed_case in (None, "04-mailboxes-and-labels", "offline", "online-recovery",
                                    "07-conversation-first-message", "08-conversation-replies", "09-conversation-reader"):
                    with self.subTest(failed_case=failed_case):
                        steps = []
                        suspended = []
                        def journey(_platform, app, flow, results, backend_expected=True):
                            case = flow.stem
                            if not backend_expected:
                                suspended.append(case)
                            if case == "online-recovery":
                                self.assertEqual(flow, repository / "e2e/native/common/online-recovery.yaml")
                            steps.append(case)
                            passed = case != failed_case
                            results.append({"app": app, "name": case, "passed": passed, "seconds": 1})
                            return passed
                        def backend_signal(_pid, value):
                            steps.append("suspended" if value == journeys.signal.SIGSTOP else "resumed")
                        with patch.object(journeys, "REPO", repository), patch.object(journeys, "run_journey", side_effect=journey), \
                                patch.object(journeys.os, "kill", side_effect=backend_signal), \
                                patch.object(journeys.subprocess, "run", return_value=journeys.subprocess.CompletedProcess([], 0, stdout="xtask e2e serve")):
                            if failed_case is None:
                                journeys.main("android")
                            else:
                                with self.assertRaises(SystemExit):
                                    journeys.main("android")
                        end = len(expected) if failed_case is None else expected.index(failed_case) + 1
                        if failed_case == "offline":
                            end += 1
                        self.assertEqual(steps, expected[:end])
                        # Only the journey that runs against the suspended backend may skip the API health check.
                        self.assertEqual(suspended, ["offline"] if "offline" in steps else [])

    def test_reader_timings_export_only_numeric_observations_from_the_expanded_body(self):
        with tempfile.TemporaryDirectory() as temporary:
            traces = Path(temporary)
            entries = [
                {"metadata": {"status": "COMPLETED", "timestamp": 1000, "duration": 300,
                              "evaluatedCommand": {"tapOnElement": {"selector": "private-sender-sentinel"}}}},
                {"metadata": {"status": "COMPLETED", "timestamp": 1400, "duration": 200,
                              "evaluatedCommand": {"assertConditionCommand": {
                                  "condition": {"visible": {"idRegex": "mail-message-text", "textRegex": "private-body-sentinel"}},
                                  "timeout": "5000"}}}},
                {"metadata": {"status": "COMPLETED", "timestamp": 1700, "duration": 100,
                              "evaluatedCommand": {"assertConditionCommand": {
                                  "condition": {"visible": {"textRegex": "private-password-sentinel"}}, "timeout": "10000"}}}},
            ]
            (traces / "commands.json").write_text(json.dumps(entries))
            readings = journeys.collect_reader_timings(traces)
            self.assertEqual(readings, [{"opening": 1, "tapToBodyMs": 600, "bodyAssertionMs": 200, "bodyWaitBudgetMs": 5000}])
            self.assertNotIn("sentinel", json.dumps(readings))

    def test_reader_timings_reject_failed_unbounded_and_external_trace_records(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            traces = root / "traces"
            traces.mkdir()
            tap = {"metadata": {"status": "COMPLETED", "timestamp": 1000, "duration": 20,
                                "evaluatedCommand": {"tapOnElement": {}}}}
            assertion = {"metadata": {"status": "COMPLETED", "timestamp": 1100, "duration": 20,
                                      "evaluatedCommand": {"assertConditionCommand": {
                                          "condition": {"visible": {"idRegex": "mail-message-text"}}, "timeout": "5000"}}}}
            for update in ({"status": "FAILED"}, {"timestamp": True}, {"duration": -1}, {"duration": "private-sentinel"}):
                with self.subTest(update=update):
                    changed = {"metadata": {**assertion["metadata"], **update}}
                    (traces / "commands.json").write_text(json.dumps([tap, changed]))
                    self.assertEqual(journeys.collect_reader_timings(traces), [])
            (traces / "commands.json").write_text(json.dumps([assertion]))
            self.assertEqual(journeys.collect_reader_timings(traces), [])
            (traces / "commands.json").unlink()
            (root / "outside.json").write_text(json.dumps([tap, assertion]))
            (traces / "commands.json").symlink_to(root / "outside.json")
            self.assertEqual(journeys.collect_reader_timings(traces), [])
            link = root / "linked-traces"
            link.symlink_to(traces, target_is_directory=True)
            self.assertEqual(journeys.collect_reader_timings(link), [])

    def test_a_successful_conversation_cannot_skip_its_reader_timing_evidence(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "solace-e2e"
            with patch.dict(os.environ, {"SOLACE_E2E": "1", "SOLACE_E2E_DIR": str(root)}, clear=True):
                private = directory() / "private"
                (private / "device.json").write_text(json.dumps({"id": "synthetic-device"}))
                (private / "fixture.json").write_text(json.dumps({"email": "journey@solace.test", "password": "private-fixture"}))
                (private / "maestro-path").write_text("synthetic-maestro")
                results = []
                with patch.object(journeys.subprocess, "run", return_value=journeys.subprocess.CompletedProcess([], 0)), \
                        patch.object(journeys, "capture_failure_screenshot"), patch.object(journeys, "capture_failure_hierarchy"), redirect_stdout(io.StringIO()):
                    self.assertFalse(journeys.run_journey("ios", "mail", Path("09-conversation-reader.yaml"), results))
                self.assertEqual(results[0]["reason"], "missing-reader-timings")

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

    def test_ios_driver_failure_categories_preserve_the_specific_cause(self):
        cases = (
            ("Maestro driver timed out during viewHierarchy", "driver-timeout"),
            ("Maestro driver timed out during viewHierarchy: process main thread busy", "app-main-thread-busy"),
            ("Maestro driver timed out during viewHierarchy. Your app is doing heavy work on the main/UI thread.", "app-main-thread-busy"),
            ("Maestro driver timed out during viewHierarchy: Timed out while evaluating UI query", "ax-query-timeout"),
            ("Maestro driver timed out during viewHierarchy. Your app screen might be too complex.", "ax-query-timeout"),
            ("Error getting main window kAXErrorCannotComplete", "driver-ax-error"),
            ("Request for viewHierarchy failed, because of unknown reason", "driver-ax-error"),
            ("Request failed, the app is not running", "app-not-running"),
            ("The app is not running. It may have crashed or been closed.", "app-not-running"),
            ("App not running during viewHierarchy command", "app-not-running"),
            ("Assertion is false: Welcome back is visible", "assertion"),
            ("Unexpected private response", "maestro-failure"),
        )
        with tempfile.TemporaryDirectory() as temporary:
            log = Path(temporary) / "maestro.log"
            for message, expected in cases:
                with self.subTest(expected=expected, message=message):
                    log.write_text(message)
                    self.assertEqual(journeys.failure_kind(log), expected)

    def test_driver_timeouts_export_only_a_fixed_kind_known_call_and_exact_class(self):
        secrets = "UDID-sentinel-1B2C https://url-sentinel.test/api body-sentinel cookie-token-sentinel"
        startup = "xcuitest.installer.LocalXCTestInstaller$IOSDriverTimeoutException"
        call = "maestro.MaestroException$DriverTimeout"
        cases = {
            "startup-class-and-message": (f"{startup}: iOS driver not ready in time, consider increasing timeout by configuring "
                                          f"MAESTRO_DRIVER_STARTUP_TIMEOUT env variable ({secrets})", None, "driver-timeout", startup, "startup", None),
            # Fields only refine an existing driver-timeout; the classification itself is not widened.
            "startup-message-only": (f"Error: iOS driver not ready in time {secrets}", None, "maestro-failure", None, None, None),
            "known-call": (f"{call}: Maestro driver timed out during tap call with: {{\"errorMessage\": \"{secrets}\"}}", None,
                           "driver-timeout", call, "call", "tap"),
            "known-call-in-junit": ("1/1 Flow Failed", f"<testsuite><testcase><failure>Maestro driver timed out during snapshot call with: {secrets}"
                                    "</failure></testcase></testsuite>", "driver-timeout", None, "call", "snapshot"),
            "unknown-call": (f"Maestro driver timed out during launchRocket{secrets.split()[0]} call with: {secrets}", None,
                             "driver-timeout", None, "call", "other"),
            "call-class-without-message": (f"{call} {secrets}", None, "maestro-failure", call, None, None),
            "call-class-with-timeout-marker": (f"{call} TimeoutException {secrets}", None, "driver-timeout", call, "call", "other"),
            # Near matches keep the generic exception behavior and never count as the exact known class or call.
            "startup-class-suffix": (f"{startup}Extra TimeoutException {secrets}", None, "driver-timeout", None, "other", None),
            "startup-class-prefix": (f"not.{startup} TimeoutException {secrets}", None, "driver-timeout", None, "other", None),
            "call-class-suffix": (f"{call}Handler TimeoutException {secrets}", None, "driver-timeout", "maestro.MaestroException", "other", None),
            "call-class-nested": (f"{call}.Inner TimeoutException {secrets}", None, "driver-timeout", "maestro.MaestroException", "other", None),
            "callback-is-not-call": (f"Maestro driver timed out during tap callback with: {secrets}", None, "driver-timeout", None, "other", None),
            "generic-timeout": (f"java.net.SocketTimeoutException: timeout {secrets}", None, "driver-timeout", "java.net.SocketTimeoutException", "other", None),
            "not-a-timeout": (f"Assertion is false: Welcome back is visible {secrets}", None, "assertion", None, None, None),
            "driver-connection": (f"maestro.DeviceUnreachableException: {secrets}", None, "driver-connection", "maestro.DeviceUnreachableException", None, None),
        }
        for case, (console, report, reason, exception, kind, called) in cases.items():
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temporary:
                log, junit = Path(temporary) / "journey.log", Path(temporary) / "journey.xml"
                log.write_text(console)
                if report:
                    junit.write_text(report)
                self.assertEqual(journeys.failure_kind(log, junit), reason)
                details = journeys.failure_details(log, junit, Path(temporary) / "no-traces", reason, 1)
                self.assertEqual((details["exceptionType"], details["driverTimeoutKind"], details["driverTimeoutCall"]), (exception, kind, called))
                self.assertEqual(set(details), {"reason", "exceptionType", "command", "step", "assertionTarget", "exitCode", "commandDurationMs",
                                                "msSincePreviousTap", "commandTimeoutMs", "driverTimeoutKind", "driverTimeoutCall"})
                exported = json.dumps(details)
                for secret in secrets.split():
                    self.assertNotIn(secret, exported)
                self.assertNotIn("launchRocket", exported)

    def test_ios_failures_export_fixed_maestro_progress_from_their_own_private_logs(self):
        email, password, device = "journey@solace.test", "progress-password-sentinel", "UDID-progress-sentinel"
        installer, interactor, console = ("xcuitest.installer.LocalXCTestInstaller", "maestro.cli.runner.TestSuiteInteractor",
                                          "maestro.cli.runner.CliConsoleListener")
        def record(logger, message, method="start"):
            return f"03:35:41.123 [ INFO] {logger}.{method}: {message}"
        install = [record(installer, "start()"), record(installer, f"[Start] Install XCUITest runner on {device}"),
                   record(installer, "Installing driver with xcodebuild"),
                   # Another logger repeating an installer marker proves nothing about the installer.
                   record("maestro.cli.report.TestDebugReporter", f"[Done] Install XCUITest runner on {device}", "logSystemInfo"),
                   record(installer, f"[Start] Running XcUITest with `xcodebuild test-without-building` with 22087 and config: {device}")]
        built = install + [record(installer, "[Done] Running XcUITest with `xcodebuild test-without-building`"),
                           record(installer, f"[Done] Install XCUITest runner on {device}"),
                           record(installer, f"[Failed] Perform XCUITest driver status check on {device}, exception: java.net.ConnectException")]
        ready = built + [record(installer, f"[Done] Perform XCUITest driver status check on {device}"),
                         record(interactor, " Running flow 01-authentication", "runFlow"),
                         # A command description can quote an installer marker; only the installer's own records count.
                         record(console, f'Assert that "[Done] Install XCUITest runner on {device}" is visible COMPLETED', "onCommandFinished")]
        # PENDING is the listener's reset callback: the command is queued to run again, not finished.
        launched = ready + [record(console, 'Launch app "onl.solace.calendar.e2e" RUNNING', "onCommandStart"),
                            record(console, 'Launch app "onl.solace.calendar.e2e" COMPLETED', "onCommandFinished"),
                            record(console, 'Launch app "onl.solace.calendar.e2e" PENDING', "onCommandReset")]
        # A multi-line description keeps its status word on the record's last line.
        typing = launched + [record(console, f"Input text {password}", "onCommandStart"), f"second line {email} RUNNING"]
        failed = launched + [record(console, "Assert that Create new event is visible RUNNING", "onCommandStart"),
                             record(console, "Assert that Create new event is visible FAILED", "onCommandFinished")]
        unknown = dict.fromkeys(("runnerAlreadyRunning", "runnerInstallStarted", "runnerInstallDone", "xcodebuildStarted", "xcodebuildDone",
                                 "driverResponded", "flowStarted", "commandsStarted", "commandsFinished", "lastCommandOpen", "furthestStage"))
        quiet = {"runnerAlreadyRunning": False, "driverResponded": False, "flowStarted": False, "commandsStarted": 0, "commandsFinished": 0,
                 "lastCommandOpen": False, "flowDirectory": "missing", "flowLog": False, "commandsJson": False}
        cases = {
            # name: (session log, flow folder files, timed out, expected progress fields)
            "driver-install": (install, None, True, {**quiet, "sessionLog": "complete", "runnerInstallStarted": True, "runnerInstallDone": False,
                                                     "xcodebuildStarted": True, "xcodebuildDone": False, "furthestStage": "driver-install"}),
            "driver-channel": (built, None, True, {**quiet, "sessionLog": "complete", "runnerInstallDone": True, "xcodebuildDone": True,
                                                   "furthestStage": "driver-channel"}),
            "flow-setup": (ready, ["logs/maestro.log"], True, {"sessionLog": "complete", "driverResponded": True, "flowStarted": True,
                                                                "flowDirectory": "found", "flowLog": True, "commandsJson": False, "commandsStarted": 0,
                                                                "commandsFinished": 1, "lastCommandOpen": False, "furthestStage": "flow-setup"}),
            "between-commands": (launched, ["logs/maestro.log"], True, {"commandsStarted": 1, "commandsFinished": 2, "lastCommandOpen": False,
                                                                        "furthestStage": "between-commands"}),
            "inside-command": (typing, ["logs/maestro.log"], True, {"commandsStarted": 2, "commandsFinished": 2, "lastCommandOpen": True,
                                                                    "furthestStage": "inside-command"}),
            "flow-ended": (failed, ["logs/maestro.log", "commands.json"], False, {"commandsJson": True, "lastCommandOpen": False,
                                                                                 "furthestStage": "flow-ended"}),
            # Maestro never logged, so nothing about the driver is proven either way; the empty output folder still is.
            "missing-log": (None, None, True, {**unknown, "sessionLog": "missing", "flowDirectory": "missing", "flowLog": False, "commandsJson": False}),
            "symlinked-log": ("symlink", None, True, {**unknown, "sessionLog": "unavailable"}),
            "symlinked-log-file": ("symlink-file", None, True, {**unknown, "sessionLog": "unavailable"}),
            "two-sessions": ("two", None, True, {**unknown, "sessionLog": "unavailable"}),
            "unrecognized-format": ([f"[INFO] {line}" for line in install], None, True, {**unknown, "sessionLog": "unavailable"}),
            # A killed writer can stop mid-record: the cut record proves nothing, and nothing after it is proven absent.
            "unterminated-record": (("\n".join(install) + "\n" + record(installer, "[Done] Install XCUITest run")).encode(), None, True,
                                    {"sessionLog": "truncated", "runnerInstallStarted": True, "runnerInstallDone": None, "commandsStarted": None,
                                     "commandsFinished": None, "lastCommandOpen": None, "furthestStage": "driver-install"}),
            "invalid-utf8": (("\n".join(install) + "\n").encode() + b"\xff\xfe" + record(console, "Input text RUNNING").encode() + b"\n", None, True,
                             {**unknown, "sessionLog": "unavailable"}),
            "dangling-log": ("dangling-file", None, True, {**unknown, "sessionLog": "unavailable"}),
            "dangling-session": ("dangling-folder", None, True, {**unknown, "sessionLog": "unavailable"}),
            # A link between the private root and the log can lead to another invocation's real files, even inside private/.
            "linked-state-ancestor": ("linked-ancestor", None, True, {**unknown, "sessionLog": "unavailable"}),
            "linked-flow-ancestor": (ready, "linked-ancestor", True, {"flowDirectory": "unavailable", "flowLog": None, "commandsJson": None}),
            # Linked files inside a real flow folder must not count as this flow's finalized trace or log.
            "linked-flow-files": (ready, "linked-files", True, {"flowDirectory": "found", "flowLog": None, "commandsJson": None,
                                                               "furthestStage": "flow-setup"}),
            "symlinked-flow": (ready, "symlink", True, {"flowDirectory": "unavailable", "flowLog": None, "commandsJson": None,
                                                        "furthestStage": "flow-setup"}),
            # A cap leaves later records unread: what was seen stays true, and nothing unseen becomes false.
            "truncated": (install + [record(console, "Filler RUNNING")] * 200 + built[len(install):], None, True,
                          {"sessionLog": "truncated", "runnerInstallStarted": True, "runnerInstallDone": None, "driverResponded": None,
                           "commandsStarted": None, "lastCommandOpen": None, "furthestStage": "driver-install"}),
            "line-cap": (built, None, True, {"sessionLog": "truncated", "xcodebuildDone": True, "runnerInstallDone": None, "driverResponded": None,
                                             "commandsFinished": None, "furthestStage": "driver-channel"}),
        }
        keys = {"sessionLog", "runnerAlreadyRunning", "runnerInstallStarted", "runnerInstallDone", "xcodebuildStarted", "xcodebuildDone",
                "driverResponded", "flowStarted", "flowDirectory", "flowLog", "commandsJson", "commandsStarted", "commandsFinished",
                "lastCommandOpen", "furthestStage"}
        for case, (log, flow_files, timed_out, expected) in cases.items():
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary) / "solace-e2e"
                outside = Path(temporary) / "outside-progress-path-sentinel"
                outside.mkdir()
                (outside / "maestro.log").write_text("\n".join(typing))
                with patch.dict(os.environ, {"SOLACE_E2E": "1", "SOLACE_E2E_DIR": str(root)}, clear=True), \
                        patch.object(journeys, "PROGRESS_LOG_BYTES", len(("\n".join(install) + "\n").encode()) if case == "truncated"
                                     else journeys.PROGRESS_LOG_BYTES), \
                        patch.object(journeys, "PROGRESS_LOG_LINES", 6 if case == "line-cap" else journeys.PROGRESS_LOG_LINES):
                    private = directory() / "private"
                    (private / "device.json").write_text(json.dumps({"id": device}))
                    (private / "fixture.json").write_text(json.dumps({"email": email, "password": password}))
                    (private / "maestro-path").write_text("synthetic-maestro")
                    environments, observed = [], {}
                    def maestro(command, **options):
                        environments.append(options["env"])
                        tests = Path(options["env"]["XDG_STATE_HOME"]) / "maestro/tests"
                        session = tests / "2026-11-13_033540"
                        if log == "symlink":
                            tests.mkdir(parents=True)
                            session.symlink_to(outside, target_is_directory=True)
                        elif log == "symlink-file":
                            session.mkdir(parents=True)
                            (session / "maestro.log").symlink_to(outside / "maestro.log")
                        elif log == "dangling-file":
                            session.mkdir(parents=True)
                            (session / "maestro.log").symlink_to(outside / "missing.log")
                        elif log == "dangling-folder":
                            tests.mkdir(parents=True)
                            session.symlink_to(outside / "missing", target_is_directory=True)
                        elif log == "linked-ancestor":
                            other = private / "maestro-state/other-invocation/maestro"
                            (other / "tests/2026-11-13_033540").mkdir(parents=True)
                            (other / "tests/2026-11-13_033540/maestro.log").write_text("\n".join(typing) + "\n")
                            (Path(options["env"]["XDG_STATE_HOME"]) / "maestro").symlink_to(other, target_is_directory=True)
                        elif isinstance(log, bytes):
                            session.mkdir(parents=True)
                            (session / "maestro.log").write_bytes(log)
                        elif log == "two":
                            for name in ("2026-11-13_033540", "2026-11-13_033541"):
                                (tests / name).mkdir(parents=True)
                                (tests / name / "maestro.log").write_text("\n".join(typing))
                        elif log is not None:
                            session.mkdir(parents=True)
                            (session / "maestro.log").write_text("\n".join(log) + "\n")
                        run = Path(command[command.index("--test-output-dir") + 1]) / "2026-11-13_033540"
                        if log is not None:
                            run.mkdir()
                        if flow_files == "symlink":
                            (run / "01-authentication").symlink_to(outside, target_is_directory=True)
                        if flow_files == "linked-files":
                            (run / "01-authentication/logs").mkdir(parents=True)
                            (run / "01-authentication/logs/maestro.log").symlink_to(outside / "maestro.log")
                            (run / "01-authentication/commands.json").symlink_to(outside / "maestro.log")
                        if flow_files == "linked-ancestor":
                            (run / "01-authentication/logs").mkdir(parents=True)
                            (run / "01-authentication/logs/maestro.log").write_text("other invocation")
                            # The journey's own output folder now resolves, through private/maestro, to another invocation's folder.
                            (private / "maestro").rename(private / "other-maestro")
                            (private / "maestro").symlink_to(private / "other-maestro", target_is_directory=True)
                        for name in flow_files if isinstance(flow_files, list) else []:
                            (run / "01-authentication" / name).parent.mkdir(parents=True, exist_ok=True)
                            (run / "01-authentication" / name).write_text(f"{password} {email}")
                        options["stdout"].write(f"{password} {device}".encode())
                        if timed_out:
                            raise journeys.subprocess.TimeoutExpired(command, 1200)
                        return journeys.subprocess.CompletedProcess([], 1)
                    def hierarchy(tool, device_info, fixture, name, environment):
                        observed["environment"] = environment
                        observed["progressFirst"] = (root / f"artifacts/progress/{name}.json").is_file()
                    results, console_output = [], io.StringIO()
                    with patch.object(journeys.subprocess, "run", side_effect=maestro), \
                            patch.object(journeys, "capture_failure_screenshot"), \
                            patch.object(journeys, "capture_failure_hierarchy", side_effect=hierarchy), redirect_stdout(console_output):
                        self.assertFalse(journeys.run_journey("ios", "calendar", Path("01-authentication.yaml"), results))
                    self.assertEqual(results[0]["reason"], "journey-timeout" if timed_out else "maestro-failure")
                    state = Path(environments[0]["XDG_STATE_HOME"])
                    self.assertEqual(state.parent, private / "maestro-state")
                    # The later hierarchy CLI reuses the journey's environment, after its progress was already read.
                    self.assertIs(observed["environment"], environments[0])
                    self.assertTrue(observed["progressFirst"])
                    progress = json.loads((root / "artifacts/progress/calendar-01-authentication.json").read_text())
                    self.assertEqual(set(progress), keys)
                    self.assertEqual({key: progress[key] for key in expected}, expected)
                    failure = json.loads((root / "artifacts/failures/calendar-01-authentication.json").read_text())
                    self.assertEqual(set(failure), {"reason", "exceptionType", "command", "step", "assertionTarget", "exitCode", "commandDurationMs",
                                                    "msSincePreviousTap", "commandTimeoutMs", "driverTimeoutKind", "driverTimeoutCall", "hierarchySource"})
                    exported = console_output.getvalue().encode() + b"".join(path.read_bytes() for path in (root / "artifacts").rglob("*") if path.is_file())
                    for sentinel in (password, email, device, "progress-path-sentinel", "22087", "Create new event", "onl.solace"):
                        self.assertNotIn(sentinel.encode(), exported)

    def test_only_ios_journeys_get_a_unique_maestro_state_and_passing_journeys_export_no_progress(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "solace-e2e"
            with patch.dict(os.environ, {"SOLACE_E2E": "1", "SOLACE_E2E_DIR": str(root), "XDG_STATE_HOME": str(Path(temporary) / "inherited"),
                                         "MAESTRO_CLI_LOG_PATTERN_FILE": "%msg%n"}, clear=True):
                private = directory() / "private"
                (private / "device.json").write_text(json.dumps({"id": "synthetic-device"}))
                (private / "fixture.json").write_text(json.dumps({"email": "journey@solace.test", "password": "synthetic"}))
                (private / "maestro-path").write_text("synthetic-maestro")
                environments, timeouts = [], []
                def maestro(command, environment, log, timeout):
                    environments.append(environment)
                    timeouts.append(timeout)
                    return 1 if len(environments) == 3 else 0
                results = []
                with patch.object(journeys, "run_maestro", side_effect=maestro), \
                        patch.object(connectivity, "prepare", return_value=({**ANDROID_READY, "reverseRestored": False}, None)), \
                        patch.object(connectivity, "observe", return_value=ANDROID_READY), \
                        patch.object(journeys, "capture_failure_screenshot"), patch.object(journeys, "capture_failure_hierarchy"), \
                        redirect_stdout(io.StringIO()):
                    for platform in ("ios", "ios", "android"):
                        journeys.run_journey(platform, "mail", Path("synthetic.yaml"), results)
                ios = [Path(environment["XDG_STATE_HOME"]) for environment in environments[:2]]
                self.assertNotEqual(ios[0], ios[1])
                self.assertTrue(all(path.parent == private / "maestro-state" and path.is_dir() for path in ios))
                # An inherited log format cannot change the records an iOS progress export parses.
                self.assertTrue(all("MAESTRO_CLI_LOG_PATTERN_FILE" not in environment for environment in environments[:2]))
                # Android keeps its existing stable Maestro state across journeys for driver reuse.
                self.assertEqual(environments[2]["XDG_STATE_HOME"], str(Path(temporary) / "inherited"))
                self.assertEqual(environments[2]["MAESTRO_CLI_LOG_PATTERN_FILE"], "%msg%n")
                self.assertEqual([result["passed"] for result in results], [True, True, False])
                self.assertEqual(timeouts, [1200, 1200, 600])
                self.assertFalse((root / "artifacts/progress").exists())

    def test_journey_output_and_driver_failures_stay_private_but_classified(self):
        timeout = "java.net.SocketTimeoutException"
        cases = {
            "passing-output": (b"secret-output-sentinel", None, None, 0, None, None),
            "console-driver-error": (f"{timeout}: secret-output-sentinel cookie-token-sentinel".encode(), None, None, 1, "driver-timeout",
                                     {"exceptionType": timeout, "command": None, "exitCode": 1}),
            "junit-failure-text": (b"1/1 Flow Failed", f"<testsuite><testcase><failure>{timeout}: secret-output-sentinel cookie-token-sentinel</failure></testcase></testsuite>",
                                   [{"command": {"inputTextCommand": {"text": "secret-output-sentinel"}}, "metadata": {"status": "FAILED"}}], 1, "driver-timeout",
                                   {"exceptionType": timeout, "command": "inputText", "exitCode": 1}),
            "junit-error-type": (b"Flow failed", f'<testsuite><testcase><error type="{timeout}" message="cookie-token-sentinel" /></testcase></testsuite>', None, 1,
                                 "driver-timeout", {"exceptionType": timeout, "command": None, "exitCode": 1}),
        }
        for index, (marker, reason) in enumerate((
            ("Maestro driver timed out during viewHierarchy", "driver-timeout"),
            ("process main thread busy", "app-main-thread-busy"),
            ("Your app is doing heavy work on the main/UI thread.", "app-main-thread-busy"),
            ("Timed out while evaluating UI query", "ax-query-timeout"),
            ("Your app screen might be too complex.", "ax-query-timeout"),
            ("kAXErrorCannotComplete", "driver-ax-error"),
            ("failed, because of unknown reason", "driver-ax-error"),
            ("the app is not running", "app-not-running"),
            ("The app is not running. It may have crashed or been closed.", "app-not-running"),
            ("App not running during viewHierarchy command", "app-not-running"),
        )):
            cases[f"ios-driver-{index}"] = (
                f"{marker}: secret-output-sentinel cookie-token-sentinel".encode(), None, None, 1,
                reason, {"exceptionType": None, "command": None, "exitCode": 1},
            )
        for case, (console_output, report, trace, code, reason, details) in cases.items():
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary) / "solace-e2e"
                with patch.dict(os.environ, {"SOLACE_E2E": "1", "SOLACE_E2E_DIR": str(root)}, clear=True):
                    private = directory() / "private"
                    (private / "device.json").write_text(json.dumps({"id": "synthetic-device"}))
                    (private / "fixture.json").write_text(json.dumps({"email": "journey@solace.test", "password": "secret-output-sentinel"}))
                    (private / "maestro-path").write_text("synthetic-maestro")
                    def maestro(command, **options):
                        options["stdout"].write(console_output)
                        if report:
                            Path(command[command.index("--output") + 1]).write_text(report)
                        if trace:
                            (private / "maestro/mail-synthetic/commands.json").write_text(json.dumps(trace))
                        return journeys.subprocess.CompletedProcess([], code)
                    results = []
                    console = io.StringIO()
                    with patch.object(journeys.subprocess, "run", side_effect=maestro), \
                            patch.object(journeys, "capture_failure_screenshot") as screenshot, \
                            patch.object(journeys, "capture_failure_hierarchy"), redirect_stdout(console):
                        self.assertEqual(journeys.run_journey("ios", "mail", Path("synthetic.yaml"), results), reason is None)
                    self.assertEqual(results[0]["reason"], reason)
                    self.assertEqual(screenshot.call_count, 0 if reason is None else 1)
                    self.assertEqual((private / "mail-synthetic.log").read_bytes(), console_output)
                    failure = root / "artifacts/failures/mail-synthetic.json"
                    if details:
                        self.assertEqual({key: json.loads(failure.read_text())[key] for key in details}, details)
                    else:
                        self.assertFalse(failure.exists())
                    exported = console.getvalue().encode() + b"".join(path.read_bytes() for path in (root / "artifacts").rglob("*") if path.is_file())
                    self.assertNotIn(b"secret-output-sentinel", exported)
                    self.assertNotIn(b"cookie-token-sentinel", exported)

    def test_a_failed_journey_never_replays_and_keeps_its_first_attempt_evidence(self):
        # PR188 Mail: the first attempt signed in before the driver dropped, so a replay from the top waited for a sign-in screen that no longer existed.
        unreachable = b"first-attempt-sentinel\nmaestro.DeviceUnreachableException: Device became unreachable during viewHierarchy"
        cases = {
            "ios-disconnect-after-progress": ("ios", unreachable, "driver-connection"),
            "ios-unreachable-after-timeout": ("ios", b"first-attempt-sentinel\njava.net.SocketTimeoutException\n" + unreachable, "driver-connection"),
            "ios-assertion": ("ios", b"first-attempt-sentinel\nAssertion is false: sign-in-email is visible", "assertion"),
            "android-disconnect": ("android", unreachable, "driver-connection"),
        }
        for case, (platform, output, reason) in cases.items():
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary) / "solace-e2e"
                with patch.dict(os.environ, {"SOLACE_E2E": "1", "SOLACE_E2E_DIR": str(root)}, clear=True):
                    private = directory() / "private"
                    (private / "device.json").write_text(json.dumps({"id": "synthetic-device"}))
                    (private / "fixture.json").write_text(json.dumps({"email": "journey@solace.test", "password": "synthetic"}))
                    (private / "maestro-path").write_text("synthetic-maestro")
                    evidence = private / "maestro/mail-synthetic/first-attempt.png"
                    invocations = []
                    def maestro(command, **options):
                        invocations.append(command)
                        report = Path(command[command.index("--output") + 1])
                        if len(invocations) > 1:
                            # A replay against the already signed-in app would pass or fail for reasons unrelated to the first run.
                            report.write_text('<testsuites><testsuite name="replay-sentinel"/></testsuites>')
                            options["stdout"].write(b"replay-sentinel\n1/1 Flow Passed")
                            return journeys.subprocess.CompletedProcess([], 0)
                        evidence.write_bytes(b"signed-in-before-disconnect")
                        report.write_text('<testsuites><testsuite name="first-attempt-report"><testcase name="synthetic"/></testsuite></testsuites>')
                        options["stdout"].write(output)
                        return journeys.subprocess.CompletedProcess([], 1)
                    results, console = [], io.StringIO()
                    with patch.object(journeys.subprocess, "run", side_effect=maestro), \
                            patch.object(connectivity, "prepare", return_value=({**ANDROID_READY, "reverseRestored": False}, None)), \
                            patch.object(connectivity, "observe", return_value=ANDROID_READY), \
                            patch.object(journeys, "capture_failure_screenshot"), \
                            patch.object(journeys, "capture_failure_hierarchy"), redirect_stdout(console):
                        self.assertFalse(journeys.run_journey(platform, "mail", Path("synthetic.yaml"), results))
                    self.assertEqual(len(invocations), 1)
                    self.assertNotIn("Retrying", console.getvalue())
                    self.assertEqual([(result["passed"], result["reason"]) for result in results], [(False, reason)])
                    self.assertEqual(evidence.read_bytes(), b"signed-in-before-disconnect")
                    log = (private / "mail-synthetic.log").read_bytes()
                    self.assertIn(b"first-attempt-sentinel", log)
                    self.assertNotIn(b"replay-sentinel", log)
                    report = (private / "mail-synthetic.xml").read_text()
                    self.assertIn("first-attempt-report", report)
                    self.assertNotIn("replay-sentinel", report)
                    self.assertEqual(json.loads((root / "artifacts/failures/mail-synthetic.json").read_text())["reason"], reason)

    def test_android_journeys_start_only_when_the_api_and_both_port_mappings_are_reachable(self):
        ready = {"backendAlive": True, "hostHealthy": True, "deviceState": "device", "reverse": {"4001": True, "59000": True}}
        cases = {
            # name: (mappings present, adb can map, backend process, API answers, device state, backend expected, Maestro runs, reason, exported status)
            "ready": ({4001, 59000}, True, True, True, "device", True, 1, None, None),
            "api-mapping-restored": ({59000}, True, True, True, "device", True, 1, None, None),
            "mapping-cannot-be-restored": (set(), False, True, True, "device", True, 0, "device-forwarding-missing",
                                           {**ready, "reverse": {"4001": False, "59000": False}, "reverseRestored": False}),
            "backend-process-gone": ({4001, 59000}, True, False, False, "device", True, 0, "backend-unavailable",
                                     {**ready, "backendAlive": False, "hostHealthy": False, "reverseRestored": False}),
            "api-not-answering": ({4001, 59000}, True, True, False, "device", True, 0, "backend-unavailable",
                                  {**ready, "hostHealthy": False, "reverseRestored": False}),
            "device-offline": ({4001, 59000}, True, True, True, "offline", True, 0, "device-unavailable",
                               {**ready, "deviceState": "offline", "reverseRestored": False}),
            "device-state-unrecognised": ({4001, 59000}, True, True, True, "private-adb-sentinel", True, 0, "device-unavailable",
                                          {**ready, "deviceState": "unknown", "reverseRestored": False}),
            "backend-suspended-on-purpose": ({4001, 59000}, True, True, False, "device", False, 1, None, None),
        }
        for case, (mapped, mappable, backend, healthy, state, backend_expected, runs, reason, exported) in cases.items():
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary) / "solace-e2e"
                with patch.dict(os.environ, {"SOLACE_E2E": "1", "SOLACE_E2E_DIR": str(root)}, clear=True):
                    private = directory() / "private"
                    (private / "device.json").write_text(json.dumps({"id": "synthetic-device"}))
                    (private / "fixture.json").write_text(json.dumps({"email": "journey@solace.test", "password": "synthetic"}))
                    (private / "maestro-path").write_text("synthetic-maestro")
                    (private / "backend.pid").write_text("4242")
                    mapped = set(mapped)
                    calls = []
                    def tools(command, **options):
                        command = [str(part) for part in command]
                        calls.append(command)
                        if command[0] == "ps":
                            return journeys.subprocess.CompletedProcess(command, 0, stdout="xtask e2e serve" if backend else "private-adb-sentinel")
                        if command[0] == "adb":
                            arguments = command[3:]
                            if arguments == ["get-state"]:
                                return journeys.subprocess.CompletedProcess(command, 0, stdout=f"{state}\n", stderr="private-adb-sentinel")
                            if arguments == ["reverse", "--list"]:
                                listed = "".join(f"synthetic-device tcp:{port} tcp:{port}\n" for port in sorted(mapped))
                                return journeys.subprocess.CompletedProcess(command, 0, stdout=listed + "synthetic-device tcp:7001 tcp:private-adb-sentinel\n")
                            if mappable:
                                mapped.add(int(arguments[1].removeprefix("tcp:")))
                            return journeys.subprocess.CompletedProcess(command, 0 if mappable else 1, stdout="private-adb-sentinel", stderr="private-adb-sentinel")
                        options["stdout"].write(b"1/1 Flow Passed")
                        return journeys.subprocess.CompletedProcess(command, 0)
                    def health(_url, seconds):
                        calls.append(["health"])
                        if not healthy:
                            raise RuntimeError("private-response-sentinel")
                    results = []
                    printed = io.StringIO()
                    with patch.object(journeys.subprocess, "run", side_effect=tools), patch.object(connectivity, "wait_url", side_effect=health), \
                            patch.object(journeys, "capture_failure_screenshot") as screenshot, \
                            patch.object(journeys, "capture_failure_hierarchy") as hierarchy, redirect_stdout(printed):
                        options = {} if backend_expected else {"backend_expected": False}
                        passed = journeys.run_journey("android", "calendar", Path("synthetic.yaml"), results, **options)
                    maestro = [index for index, command in enumerate(calls) if command[0] == "synthetic-maestro"]
                    restores = [index for index, command in enumerate(calls) if command[3:4] == ["reverse"] and command[4:5] != ["--list"]]
                    self.assertEqual(len(maestro), runs)
                    self.assertEqual(passed, reason is None)
                    self.assertEqual(results[0]["reason"], reason)
                    self.assertEqual(["health"] in calls, backend_expected)
                    if case == "api-mapping-restored":
                        self.assertEqual([calls[index][4:] for index in restores], [["tcp:4001", "tcp:4001"]])
                        self.assertLess(restores[0], maestro[0])
                        self.assertIs(results[0]["deviceForwardingRestored"], True)
                    else:
                        self.assertEqual(len(restores), 0 if mappable or mapped else 2)
                        self.assertNotIn("deviceForwardingRestored", results[0])
                    failure = root / "artifacts/failures/calendar-synthetic.json"
                    if reason is None:
                        self.assertFalse(failure.exists())
                    else:
                        # A journey that never ran keeps the same fixed schema, with every per-step field null.
                        self.assertEqual(json.loads(failure.read_text()), {
                            "reason": reason, "exceptionType": None, "command": None, "step": None, "assertionTarget": None,
                            "exitCode": None, "commandDurationMs": None, "msSincePreviousTap": None, "commandTimeoutMs": None,
                            "driverTimeoutKind": None, "driverTimeoutCall": None, "hierarchySource": None, "connectivity": exported})
                        screenshot.assert_not_called()
                        hierarchy.assert_not_called()
                    evidence = printed.getvalue() + "".join(path.read_text(errors="replace") for path in (root / "artifacts").rglob("*") if path.is_file())
                    self.assertNotIn("private-adb-sentinel", evidence)
                    self.assertNotIn("private-response-sentinel", evidence)

    def test_a_failed_android_journey_records_connectivity_without_repairing_it_and_ios_is_left_alone(self):
        for platform in ("android", "ios"):
            with self.subTest(platform=platform), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary) / "solace-e2e"
                with patch.dict(os.environ, {"SOLACE_E2E": "1", "SOLACE_E2E_DIR": str(root)}, clear=True):
                    private = directory() / "private"
                    (private / "device.json").write_text(json.dumps({"id": "synthetic-device"}))
                    (private / "fixture.json").write_text(json.dumps({"email": "journey@solace.test", "password": "synthetic"}))
                    (private / "maestro-path").write_text("synthetic-maestro")
                    (private / "backend.pid").write_text("4242")
                    mapped = {4001, 59000}
                    calls = []
                    def tools(command, **options):
                        command = [str(part) for part in command]
                        calls.append(command)
                        if command[0] == "ps":
                            return journeys.subprocess.CompletedProcess(command, 0, stdout="xtask e2e serve")
                        if command[0] == "adb":
                            if command[3:] == ["get-state"]:
                                return journeys.subprocess.CompletedProcess(command, 0, stdout="device\n")
                            listed = "".join(f"synthetic-device tcp:{port} tcp:{port}\n" for port in sorted(mapped))
                            return journeys.subprocess.CompletedProcess(command, 0, stdout=listed)
                        # A lost mapping must remain missing in the diagnostics instead of being silently repaired.
                        mapped.discard(4001)
                        options["stdout"].write(b"Assertion is false: sign-in-email is visible")
                        return journeys.subprocess.CompletedProcess(command, 1)
                    results = []
                    with patch.object(journeys.subprocess, "run", side_effect=tools), patch.object(connectivity, "wait_url") as health, \
                            patch.object(journeys, "capture_failure_screenshot"), patch.object(journeys, "capture_failure_hierarchy"), \
                            redirect_stdout(io.StringIO()):
                        self.assertFalse(journeys.run_journey(platform, "calendar", Path("synthetic.yaml"), results))
                    details = json.loads((root / "artifacts/failures/calendar-synthetic.json").read_text())
                    self.assertEqual(details["reason"], "assertion")
                    if platform == "ios":
                        self.assertNotIn("connectivity", details)
                        self.assertEqual({command[0] for command in calls}, {"synthetic-maestro"})
                        health.assert_not_called()
                        continue
                    self.assertEqual(details["connectivity"], {"backendAlive": True, "hostHealthy": True, "deviceState": "device",
                                                               "reverse": {"4001": False, "59000": True}})
                    self.assertFalse(any(command[3:4] == ["reverse"] and command[4:5] != ["--list"] for command in calls))

    def test_failure_hierarchies_preserve_selectors_and_states_without_credentials(self):
        fixture = {"email": "journey@solace.test", "password": "private-password-sentinel",
                   "peerEmail": "peer-private-sentinel@solace.test", "peerPassword": "peer-private-sentinel"}
        tree = {"attributes": {"text": "Maestro folder", "value": fixture["email"], "sessionCookie": "private-cookie-sentinel"},
                "selected": True, "checked": False,
                "children": [{"attributes": {"resource-id": "sign-in-password", "value": fixture["password"], "text": "another-private-value"},
                              "children": [{"attributes": {"text": "nested-private-value"}}]},
                             {"attributes": {"className": "SecureTextField", "value": "private-secure-field-value"}},
                             {"attributes": {"text": fixture["peerEmail"], "value": fixture["peerPassword"]}}]}
        exported = journeys.sanitized_hierarchy(tree, fixture)
        encoded = json.dumps(exported)
        for value in (*fixture.values(), "private-cookie-sentinel", "another-private-value", "nested-private-value", "private-secure-field-value"):
            self.assertNotIn(value, encoded)
        self.assertTrue(exported["selected"])
        self.assertFalse(exported["checked"])
        self.assertEqual(exported["attributes"]["text"], "Maestro folder")
        self.assertEqual(exported["children"][0]["attributes"]["resource-id"], "sign-in-password")

    def test_ios_driver_is_reinstalled_between_journeys_and_peer_credentials_stay_private(self):
        fixture = {"email": "journey@solace.test", "password": "primary-private-sentinel",
                   "peerEmail": "peer-private-sentinel@solace.test", "peerPassword": "peer-private-sentinel"}
        for platform in ("ios", "android"):
            with self.subTest(platform=platform), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary) / "solace-e2e"
                with patch.dict(os.environ, {"SOLACE_E2E": "1", "SOLACE_E2E_DIR": str(root)}, clear=True):
                    private = directory() / "private"
                    (private / "device.json").write_text(json.dumps({"id": "synthetic-device"}))
                    (private / "fixture.json").write_text(json.dumps(fixture))
                    (private / "maestro-path").write_text("synthetic-maestro")
                    results = [{"app": "calendar", "name": "previous", "passed": True, "seconds": 1}]
                    with patch.object(journeys.subprocess, "run", return_value=journeys.subprocess.CompletedProcess([], 0)) as execute, \
                            patch.object(connectivity, "prepare", return_value=({**ANDROID_READY, "reverseRestored": False}, None)), redirect_stdout(io.StringIO()):
                        self.assertTrue(journeys.run_journey(platform, "mail", Path("synthetic.yaml"), results))
                    command = execute.call_args.args[0]
                    self.assertEqual("--no-reinstall-driver" in command, platform == "android")
                    self.assertIn(f"PEER_EMAIL={fixture['peerEmail']}", command)
                    self.assertIn(f"PEER_PASSWORD={fixture['peerPassword']}", command)
                    for path in (root / "artifacts").rglob("*"):
                        if path.is_file():
                            self.assertNotIn(b"private-sentinel", path.read_bytes())

    def test_failure_metadata_rejects_unknown_commands_and_external_trace_links(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            log = root / "log.txt"
            log.write_text("Unrecognized failure")
            report = root / "report.xml"
            report.write_text("<invalid")
            traces = root / "traces"
            traces.mkdir()
            unknown = {"command": {"secret-output-sentinel": {"text": "private-cookie-sentinel"}}, "metadata": {"status": "FAILED"}}
            (traces / "commands.json").write_text(json.dumps([unknown]))
            details = journeys.failure_details(log, report, traces, "maestro-failure")
            self.assertEqual(details["command"], "other")
            self.assertIsNone(details["exceptionType"])
            outside = root / "outside.json"
            outside.write_text(json.dumps([{"command": {"inputText": {}}, "metadata": {"status": "FAILED"}}]))
            (traces / "commands.json").unlink()
            (traces / "commands.json").symlink_to(outside)
            self.assertIsNone(journeys.failure_details(log, report, traces, "maestro-failure")["command"])
            self.assertNotIn("sentinel", json.dumps(details))

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
