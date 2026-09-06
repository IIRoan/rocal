import contextlib
import importlib.util
import io
from pathlib import Path
import unittest


BRIDGE = Path(__file__).resolve().parents[1] / "stalwart-discord-bridge.py"
SPEC = importlib.util.spec_from_file_location("stalwart_discord_bridge", BRIDGE)
bridge = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bridge)


class AccessLogTests(unittest.TestCase):
    def handler(self):
        handler = object.__new__(bridge.Handler)
        handler.address_string = lambda: "127.0.0.1"
        return handler

    def test_successful_access_log_uses_stdout(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            self.handler().log_message('"%s" %s %s', "GET / HTTP/1.1", "200", "-")
        self.assertIn("200", stdout.getvalue())
        self.assertEqual(stderr.getvalue(), "")

    def test_failed_access_log_uses_stderr(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            self.handler().log_message('"%s" %s %s', "GET /missing HTTP/1.1", "500", "-")
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("500", stderr.getvalue())
