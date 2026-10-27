"""Read-only diagnostics retain counters and categories, never raw journal content or credentials."""

import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("network_diagnostics", Path(__file__).resolve().parents[1] / "vps/diagnose-network.py")
diagnostics = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(diagnostics)
START, END = "2026-01-01T09:57:00Z", "2026-01-01T10:03:00Z"


def report():
    return {
        "window": {"start": START, "end": END}, "observedAt": END, "uptimeSeconds": 100000,
        "services": {name: {"state": "active", "restarts": 0, "activeSinceMonotonicMicroseconds": 100} for name in diagnostics.SERVICES},
        "tunnel": diagnostics.journal_summary(""), "kernel": diagnostics.journal_summary(""),
        "cumulativeTcpCounters": {"TCPTimeouts": 3},
    }


class NetworkDiagnosticsTests(unittest.TestCase):
    def test_window_requires_aware_times_and_at_most_twenty_minutes(self):
        self.assertEqual(diagnostics.window(START, END), (START, END))
        for start, end in [(START, START), (END, START), ("2026-01-01T09:00:00", END), (START, "2026-01-01T11:00:00Z"), ("$(secret)", END)]:
            with self.assertRaises(ValueError):
                diagnostics.window(start, end)

    def test_journal_never_emits_messages_addresses_or_tokens(self):
        raw = json.dumps({"MESSAGE": "i/o timeout user@private.test 198.51.100.7 token=secret-canary"})
        result = diagnostics.journal_summary(raw)
        self.assertEqual(result["categories"]["connection_timeout"], 1)
        for private in ("user@", "198.51.100.7", "secret-canary", "MESSAGE"):
            self.assertNotIn(private, json.dumps(result))
        self.assertFalse(diagnostics.journal_summary(None)["available"])
        self.assertTrue(diagnostics.journal_summary("{}\n" * 2000)["truncated"])

    def test_tcp_counters_keep_only_named_numeric_metrics(self):
        raw = "TcpExt: TCPTimeouts ListenDrops Other\nTcpExt: 3 4 99\n"
        self.assertEqual(diagnostics.tcp_counters(raw), {"TCPTimeouts": 3, "ListenDrops": 4})

    def test_remote_requires_host_pinning_and_removes_temporary_credentials(self):
        paths = []

        def ssh(args, **kwargs):
            key = Path(args[args.index("-i") + 1])
            paths.append(key)
            self.assertEqual(key.stat().st_mode & 0o777, 0o600)
            self.assertIn("StrictHostKeyChecking=yes", args)
            self.assertIn("IdentitiesOnly=yes", args)
            self.assertNotIn("secret-private-key", kwargs["input"])
            self.assertIn("sudo -n python3 - --collect", args[-1])
            return subprocess.CompletedProcess(args, 0, json.dumps(report()), "")

        with patch.object(diagnostics.subprocess, "run", side_effect=ssh):
            result = diagnostics.remote(START, END, {"VPS_SSH_PRIVATE_KEY": "secret-private-key", "VPS_SSH_KNOWN_HOSTS": "test-pin"})
        self.assertEqual(result, report())
        self.assertFalse(paths[0].exists())

    def test_remote_rejects_unexpected_report_fields_and_non_numeric_counters(self):
        for value in [report() | {"message": "private-data"}, report() | {"uptimeSeconds": "private-data"}, report() | {"services": []}]:
            with self.assertRaises(ValueError):
                diagnostics.validate_report(value, START, END)

    def test_collection_runs_only_read_only_commands(self):
        calls = []

        def command(args):
            calls.append(args)
            if args[0] == "systemctl":
                return "ActiveState=active\nNRestarts=0\nActiveEnterTimestampMonotonic=100\n"
            return json.dumps({"MESSAGE": "i/o timeout user@private.test token=secret-canary"})

        def read(path, **kwargs):
            return "100000.0 0.0" if str(path) == "/proc/uptime" else "TcpExt: TCPTimeouts\nTcpExt: 3\n"

        with patch.object(diagnostics, "command", side_effect=command), patch.object(diagnostics.os, "geteuid", return_value=0), patch.object(Path, "read_text", read):
            result = diagnostics.collect(START, END)
        diagnostics.validate_report(result, START, END)
        self.assertNotIn("secret-canary", json.dumps(result))
        self.assertTrue(all(args[0] in {"systemctl", "journalctl"} for args in calls))
        self.assertTrue(all(not ({"restart", "reload", "stop", "start"} & set(args)) for args in calls))


if __name__ == "__main__":
    unittest.main()
