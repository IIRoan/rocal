import importlib.util
import io
import json
import os
from pathlib import Path
import re
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
import connectivity

specification = importlib.util.spec_from_file_location("native_journeys", Path(__file__).with_name("run.py"))
journeys = importlib.util.module_from_spec(specification)
specification.loader.exec_module(journeys)
ANDROID_READY = {"backendAlive": True, "hostHealthy": True, "deviceState": "device", "reverse": {"4001": True, "59000": True}}


class HarnessTests(unittest.TestCase):
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
                    journeys.capture_failure_hierarchy("test-maestro", {"id":"test-device"}, {}, "test-flow")
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

    def test_only_a_disconnected_ios_driver_retries_the_journey_once_with_fresh_evidence(self):
        unreachable = b"maestro.DeviceUnreachableException: Device became unreachable during viewHierarchy"
        cases = {
            "recovers": ("ios", [(unreachable, 1), (b"1/1 Flow Passed", 0)], True, None),
            "stays-unreachable": ("ios", [(unreachable, 1), (unreachable, 1)], False, "driver-connection"),
            "unreachable-after-timeout": ("ios", [(b"java.net.SocketTimeoutException\n" + unreachable, 1), (b"1/1 Flow Passed", 0)], True, None),
            "assertion": ("ios", [(b"Assertion is false: sign-in-email is visible", 1)], False, "assertion"),
            "android-unreachable": ("android", [(unreachable, 1)], False, "driver-connection"),
        }
        for case, (platform, attempts, passed, reason) in cases.items():
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary) / "solace-e2e"
                with patch.dict(os.environ, {"SOLACE_E2E": "1", "SOLACE_E2E_DIR": str(root)}, clear=True):
                    private = directory() / "private"
                    (private / "device.json").write_text(json.dumps({"id": "synthetic-device"}))
                    (private / "fixture.json").write_text(json.dumps({"email": "journey@solace.test", "password": "synthetic"}))
                    (private / "maestro-path").write_text("synthetic-maestro")
                    outcomes = iter(attempts)
                    evidence = private / "maestro/calendar-synthetic/first-attempt.png"
                    stale_evidence = []
                    def maestro(command, **options):
                        stale_evidence.append(evidence.exists())
                        evidence.write_bytes(b"screenshot")
                        output, code = next(outcomes)
                        options["stdout"].write(output)
                        return journeys.subprocess.CompletedProcess([], code)
                    results = []
                    with patch.object(journeys.subprocess, "run", side_effect=maestro), \
                            patch.object(connectivity, "prepare", return_value=({**ANDROID_READY, "reverseRestored": False}, None)), \
                            patch.object(connectivity, "observe", return_value=ANDROID_READY), \
                            patch.object(journeys, "capture_failure_screenshot"), \
                            patch.object(journeys, "capture_failure_hierarchy"), redirect_stdout(io.StringIO()):
                        self.assertEqual(journeys.run_journey(platform, "calendar", Path("synthetic.yaml"), results), passed)
                    self.assertEqual(stale_evidence, [False] * len(attempts))
                    self.assertEqual([(result["passed"], result["reason"]) for result in results], [(passed, reason)])

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
                            patch.object(journeys, "capture_failure_screenshot") as screenshot, patch.object(journeys, "capture_failure_hierarchy"), \
                            redirect_stdout(printed):
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
                        self.assertEqual(json.loads(failure.read_text()), {
                            "reason": reason, "exceptionType": None, "command": None, "step": None, "assertionTarget": None,
                            "exitCode": None, "connectivity": exported})
                        screenshot.assert_not_called()
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
            self.assertIsNone(details["command"])
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
