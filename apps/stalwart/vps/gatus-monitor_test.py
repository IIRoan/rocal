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
            proxies = {"http-test": "online", "smtp-test": "online"}
        with (
            patch.object(monitor, "fetch_frp_proxies", return_value=proxies),
            patch.object(monitor, "http_ready", return_value=http),
            patch.object(monitor, "service_active", side_effect=lambda unit: "inactive" if unit == inactive else "active"),
            patch.object(monitor, "postfix_queue_count", return_value=0),
            contextlib.redirect_stdout(output),
        ):
            status = monitor.main()
        return status, json.loads(output.getvalue())

    def test_healthy_requires_both_groups_and_http(self):
        status, body = self.snapshot()
        self.assertEqual(status, 0)
        self.assertEqual(body["status"], "healthy")
        self.assertEqual(body["groupMembers"], {"http": 1, "smtp": 1})

    def test_running_services_without_tunnel_member_fail(self):
        status, body = self.snapshot({"http-test": "offline", "smtp-test": "online"})
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


if __name__ == "__main__":
    unittest.main()
