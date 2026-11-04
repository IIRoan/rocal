import contextlib
import importlib.util
import io
from pathlib import Path
import unittest
from unittest import mock


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


class StatusPageTests(unittest.TestCase):
    def dispatch(self, command, path):
        handler = object.__new__(bridge.Handler)
        handler.command, handler.path, handler.wfile = command, path, io.BytesIO()
        sent = {}
        handler.send_response = lambda code: sent.setdefault("status", code)
        handler.send_header = sent.setdefault
        handler.end_headers = lambda: None
        proxied = []
        with mock.patch.object(bridge, "_proxy", proxied.append):
            handler._dispatch()
        return sent, handler.wfile.getvalue(), proxied

    def test_page_routes_serve_the_status_page(self):
        for path in ("/", "/?ref=x", "/endpoints/application_api-health", "/suites/x"):
            sent, body, proxied = self.dispatch("GET", path)
            self.assertEqual(sent["status"], 200)
            self.assertIn(b"<title>Solace status</title>", body)
            self.assertEqual(sent["Content-Length"], str(len(body)))
            self.assertIn("frame-ancestors 'none'", sent["Content-Security-Policy"])
            self.assertEqual(proxied, [])

    def test_head_sends_no_body(self):
        sent, body, _ = self.dispatch("HEAD", "/")
        self.assertEqual(sent["status"], 200)
        self.assertEqual(body, b"")

    def test_api_and_assets_go_to_gatus(self):
        for path in ("/api/v1/endpoints/statuses?page=1&pageSize=1", "/solace-logo.png", "/health"):
            _, _, proxied = self.dispatch("GET", path)
            self.assertEqual(len(proxied), 1)
