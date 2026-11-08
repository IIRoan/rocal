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
from reader_timings import collect_reader_timings

specification = importlib.util.spec_from_file_location("native_journeys", Path(__file__).with_name("run.py"))
journeys = importlib.util.module_from_spec(specification)
specification.loader.exec_module(journeys)


class HarnessTests(unittest.TestCase):
    def test_focused_ios_diagnostic_runs_authentication_before_calendar_and_photo(self):
        with patch.object(journeys, "run_journey", return_value=True) as execute, patch.object(journeys, "publish"):
            journeys.main("ios", diagnostic=True)
        self.assertEqual([(call.args[0], call.args[1], call.args[2].stem) for call in execute.call_args_list],
                         [("ios", "calendar", "01-authentication"), ("ios", "calendar", "02-calendar-management"),
                          ("ios", "calendar", "07-profile-picture")])

    def test_staged_calendar_failures_stay_visible_and_continue_the_remaining_suite(self):
        with tempfile.TemporaryDirectory() as temporary:
            repository = Path(temporary) / "repository"
            for app, names in (("calendar", ("01-authentication", "02-calendar-management", "03-content")),
                               ("mail", ("01-unlock", "offline", "sign-out"))):
                parent = repository / "e2e/native" / app
                parent.mkdir(parents=True)
                for name in names:
                    (parent / f"{name}.yaml").touch()
            expected = [("calendar", name) for name in ("01-authentication", "02-calendar-management", "03-content")]
            expected += [("mail", name) for name in ("01-unlock", "offline", "online-recovery", "sign-out")]
            for index, failed in enumerate((None, expected[0], expected[1])):
                with self.subTest(failed=failed):
                    calls = []
                    output = Path(temporary) / f"output-{index}"
                    root = Path(temporary) / str(index) / "solace-e2e"
                    def execute(_platform, app, flow, results, name=None):
                        calls.append((app, name or flow.stem))
                        passed = calls[-1] != failed
                        results.append({"app": app, "name": name or flow.stem, "passed": passed, "seconds": 1})
                        journeys.publish(results)
                        return passed
                    with patch.dict(os.environ, {"SOLACE_E2E": "1", "SOLACE_E2E_DIR": str(root), "GITHUB_OUTPUT": str(output)}, clear=True), \
                            patch.object(journeys, "REPO", repository), patch.object(journeys, "run_journey", side_effect=execute), \
                            patch.object(journeys.os, "kill") as backend_signal, \
                            patch.object(journeys.subprocess, "run", return_value=journeys.subprocess.CompletedProcess([], 0, stdout="xtask e2e serve")):
                        (directory() / "private/backend.pid").write_text("4242")
                        if failed is None:
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
                            self.assertEqual(calls, expected)
                            rows = json.loads((directory() / "artifacts/results.json").read_text())["results"]
                            self.assertEqual(len(rows), len(expected))
                            self.assertEqual([row["name"] for row in rows if not row["passed"]], [] if failed is None else [failed[1]])

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

    def test_focused_diagnostic_stops_on_failure_and_rejects_other_platforms(self):
        with patch.object(journeys, "run_journey", return_value=False) as execute, patch.object(journeys, "publish") as publish:
            with self.assertRaisesRegex(SystemExit, "failed"):
                journeys.main("ios", diagnostic=True)
            execute.assert_called_once()
            publish.assert_not_called()
            execute.reset_mock()
            with self.assertRaisesRegex(SystemExit, "iOS only"):
                journeys.main("android", diagnostic=True)
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
                        def journey(_platform, app, flow, results, name=None):
                            case = name or flow.stem
                            if name == "online-recovery":
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
            readings = collect_reader_timings(traces)
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
                    self.assertEqual(collect_reader_timings(traces), [])
            (traces / "commands.json").write_text(json.dumps([assertion]))
            self.assertEqual(collect_reader_timings(traces), [])
            (traces / "commands.json").unlink()
            (root / "outside.json").write_text(json.dumps([tap, assertion]))
            (traces / "commands.json").symlink_to(root / "outside.json")
            self.assertEqual(collect_reader_timings(traces), [])
            link = root / "linked-traces"
            link.symlink_to(traces, target_is_directory=True)
            self.assertEqual(collect_reader_timings(link), [])

    def test_peer_credentials_are_passed_privately_and_removed_from_exported_hierarchies(self):
        fixture = {"email": "journey@solace.test", "password": "primary-private-sentinel",
                   "peerEmail": "peer-private-sentinel@solace.test", "peerPassword": "peer-private-sentinel"}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "solace-e2e"
            with patch.dict(os.environ, {"SOLACE_E2E": "1", "SOLACE_E2E_DIR": str(root)}, clear=True):
                private = directory() / "private"
                (private / "device.json").write_text(json.dumps({"id": "synthetic-device"}))
                (private / "fixture.json").write_text(json.dumps(fixture))
                (private / "maestro-path").write_text("synthetic-maestro")
                with patch.object(journeys.subprocess, "run", return_value=journeys.subprocess.CompletedProcess([], 0)) as execute, redirect_stdout(io.StringIO()):
                    self.assertTrue(journeys.run_journey("android", "mail", Path("synthetic.yaml"), []))
                command = execute.call_args.args[0]
                self.assertIn(f"PEER_EMAIL={fixture['peerEmail']}", command)
                self.assertIn(f"PEER_PASSWORD={fixture['peerPassword']}", command)
                tree = {"attributes": {"text": fixture["peerEmail"], "value": fixture["peerPassword"]}}
                self.assertNotIn("peer-private-sentinel", json.dumps(journeys.sanitized_hierarchy(tree, fixture)))
                for path in (root / "artifacts").rglob("*"):
                    if path.is_file():
                        self.assertNotIn("private-sentinel", path.read_text())

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

    def test_junit_driver_failure_is_reported_without_its_credentials_or_command_text(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "solace-e2e"
            with patch.dict(os.environ, {"SOLACE_E2E": "1", "SOLACE_E2E_DIR": str(root)}, clear=True):
                private = directory() / "private"
                (private / "device.json").write_text(json.dumps({"id": "synthetic-device"}))
                (private / "fixture.json").write_text(json.dumps({"email": "journey@solace.test", "password": "secret-output-sentinel"}))
                (private / "maestro-path").write_text("synthetic-maestro")
                def fail_with_report(command, **options):
                    options["stdout"].write(b"1/1 Flow Failed")
                    Path(command[command.index("--output") + 1]).write_text(
                        '<testsuite><testcase><failure>java.net.SocketTimeoutException: secret-output-sentinel cookie-token-sentinel</failure></testcase></testsuite>')
                    trace = private / "maestro/mail-synthetic/commands.json"
                    trace.write_text(json.dumps([{"command": {"inputTextCommand": {"text": "secret-output-sentinel"}}, "metadata": {"status": "FAILED"}}]))
                    return journeys.subprocess.CompletedProcess([], 1)
                results = []
                console = io.StringIO()
                with patch.object(journeys.subprocess, "run", side_effect=fail_with_report), \
                        patch.object(journeys, "capture_failure_screenshot"), \
                        patch.object(journeys, "capture_failure_hierarchy"), redirect_stdout(console):
                    self.assertFalse(journeys.run_journey("ios", "mail", Path("synthetic.yaml"), results))
                self.assertEqual(results[0]["reason"], "driver-timeout")
                details = json.loads((root / "artifacts/failures/mail-synthetic.json").read_text())
                self.assertEqual(details["exceptionType"], "java.net.SocketTimeoutException")
                self.assertEqual(details["command"], "inputText")
                self.assertEqual(details["exitCode"], 1)
                exported = console.getvalue() + "".join(path.read_text() for path in (root / "artifacts").rglob("*") if path.is_file())
                self.assertNotIn("secret-output-sentinel", exported)
                self.assertNotIn("cookie-token-sentinel", exported)

    def test_ios_driver_is_reinstalled_between_journeys_without_resetting_the_test_app(self):
        for platform in ("ios", "android"):
            with self.subTest(platform=platform), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary) / "solace-e2e"
                with patch.dict(os.environ, {"SOLACE_E2E": "1", "SOLACE_E2E_DIR": str(root)}, clear=True):
                    private = directory() / "private"
                    (private / "device.json").write_text(json.dumps({"id": "synthetic-device"}))
                    (private / "fixture.json").write_text(json.dumps({"email": "journey@solace.test", "password": "private-fixture"}))
                    (private / "maestro-path").write_text("synthetic-maestro")
                    results = [{"app": "calendar", "name": "previous", "passed": True, "seconds": 1}]
                    with patch.object(journeys.subprocess, "run", return_value=journeys.subprocess.CompletedProcess([], 0)) as execute, redirect_stdout(io.StringIO()):
                        self.assertTrue(journeys.run_journey(platform, "mail", Path("synthetic.yaml"), results))
                    command = execute.call_args.args[0]
                    self.assertEqual("--no-reinstall-driver" in command, platform == "android")
                    self.assertNotIn("clearState", command)

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

    def test_junit_infrastructure_error_type_is_recognized(self):
        with tempfile.TemporaryDirectory() as temporary:
            log = Path(temporary) / "console.log"
            log.write_text("Flow failed")
            report = Path(temporary) / "junit.xml"
            report.write_text('<testsuite><testcase><error type="java.net.SocketTimeoutException" message="private-token-sentinel" /></testcase></testsuite>')
            self.assertEqual(journeys.failure_kind(log, report), "driver-timeout")

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
