import contextlib
import importlib.machinery
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch


loader = importlib.machinery.SourceFileLoader("monitor", str(Path(__file__).with_name("gatus-monitor.sh")))
spec = importlib.util.spec_from_loader(loader.name, loader)
monitor = importlib.util.module_from_spec(spec)
loader.exec_module(monitor)


class MonitorTest(unittest.TestCase):
    def snapshot(self, proxies=None, http=True, inactive=None):
        output = io.StringIO()
        if proxies is None:
            proxies = {"http-test": "online", "https-test": "online", "smtp-test": "online"}
        with (
            patch.object(monitor, "fetch_frp_proxies", return_value=proxies),
            patch.object(monitor, "http_ready", return_value=http),
            patch.object(monitor, "service_active", side_effect=lambda unit: "inactive" if unit == inactive else "active"),
            patch.object(monitor, "postfix_queue_count", return_value=0),
            contextlib.redirect_stdout(output),
        ):
            status = monitor.main()
        return status, json.loads(output.getvalue())

    def test_healthy_requires_every_group_and_http(self):
        status, body = self.snapshot()
        self.assertEqual(status, 0)
        self.assertEqual(body["status"], "healthy")
        self.assertEqual(body["groupMembers"], {"http": 1, "https": 1, "smtp": 1})

    def test_missing_https_passthrough_member_is_degraded(self):
        status, body = self.snapshot({"http-test": "online", "smtp-test": "online"})
        self.assertEqual(status, 1)
        self.assertEqual(body["status"], "degraded")
        self.assertEqual(body["groupMembers"]["https"], 0)

    def test_running_services_without_tunnel_member_fail(self):
        status, body = self.snapshot({"http-test": "offline", "https-test": "online", "smtp-test": "online"})
        self.assertEqual(status, 1)
        self.assertEqual(body["status"], "degraded")
        self.assertEqual(body["groupMembers"]["http"], 0)

    def test_unreachable_dashboard_fails(self):
        status, body = self.snapshot({})
        self.assertEqual(status, 1)
        self.assertEqual(body["status"], "degraded")

    def test_service_failure_fails(self):
        status, body = self.snapshot(inactive="frps")
        self.assertEqual(status, 1)
        self.assertEqual(body["unhealthyServices"], ["frps"])

    def test_local_jmap_failure_fails(self):
        status, body = self.snapshot(http=False)
        self.assertEqual(status, 1)
        self.assertEqual(body["status"], "unhealthy")

    def test_subprocess_timeouts_fail_closed(self):
        with patch.object(monitor.subprocess, "run", side_effect=subprocess.TimeoutExpired("probe", 3)):
            self.assertFalse(monitor.http_ready(18080))
            self.assertEqual(monitor.service_active("frps"), "unknown")
            self.assertIsNone(monitor.postfix_queue_count())

    def test_dashboard_timeout_does_not_report_online(self):
        with patch.object(monitor.urllib.request, "urlopen", side_effect=TimeoutError):
            self.assertEqual(monitor.fetch_frp_proxies(), {})

    def test_service_state_never_copies_raw_command_output(self):
        for stdout, stderr, status in [
            ("active\n", "", "active"),
            ("failed\n", "", "failed"),
            ("", "private-user@example.test secret-canary", "unknown"),
            ("active\nsecret-canary", "", "unknown"),
        ]:
            with self.subTest(status=status, stdout=stdout), patch.object(monitor.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, stdout, stderr)):
                self.assertEqual(monitor.service_active("frps"), status)

    def test_postfix_queue_count_uses_only_successful_standard_output(self):
        for stdout, returncode, expected in [
            ("Mail queue is empty\n", 0, 0),
            ("\nMail queue is empty\n\n", 0, 0),
            ("-Queue ID-  --Size-- ----Arrival Time---- -Sender/Recipient-------\nABC123 1024 Wed Nov 11 12:00:00 sender@example.test\nrecipient@example.test\n\n-- 2 Kbytes in 1 Request.\n", 0, 1),
            ("-Queue ID-  --Size-- ----Arrival Time---- -Sender/Recipient-------\nABC123 1024 Wed Nov 11 12:00:00 sender@example.test\nrecipient@example.test\nDEF456 1024 Wed Nov 11 12:01:00 sender@example.test\nrecipient@example.test\n\n-- 3 Kbytes in 2 Requests.\n", 0, 2),
            ("-- 4096 Kbytes in 1001 Requests.\n", 0, 1001),
            ("", 0, None),
            ("\n \n", 0, None),
            ("-Queue ID-  --Size-- ----Arrival Time---- -Sender/Recipient-------\n", 0, None),
            ("-- 2 Kbytes in unknown Requests.\n", 0, None),
            ("-- 2 Kbytes in -1 Requests.\n", 0, None),
            ("-- 2 Kbytes in 1 Request. extra\n", 0, None),
            ("Mail queue is empty\nunexpected output\n", 0, None),
            ("Mail queue is empty\n", 1, None),
            ("-- 2 Kbytes in 1 Request.\n", 1, None),
        ]:
            with self.subTest(stdout=stdout, returncode=returncode), patch.object(monitor.subprocess, "run", return_value=subprocess.CompletedProcess([], returncode, stdout, "")):
                self.assertEqual(monitor.postfix_queue_count(), expected)

    def test_postfix_queue_probe_failures_are_unknown(self):
        for error in [OSError("unavailable"), subprocess.TimeoutExpired("postqueue", 3)]:
            with self.subTest(error=type(error).__name__), patch.object(monitor.subprocess, "run", side_effect=error):
                self.assertIsNone(monitor.postfix_queue_count())


if __name__ == "__main__":
    unittest.main()
