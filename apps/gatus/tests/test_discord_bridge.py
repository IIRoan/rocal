import contextlib
from datetime import datetime, timezone
import importlib.util
import io
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest
from email.message import Message
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace
from unittest import mock
from zoneinfo import ZoneInfo


BRIDGE = Path(__file__).resolve().parents[1] / "stalwart-discord-bridge.py"
SPEC = importlib.util.spec_from_file_location("stalwart_discord_bridge", BRIDGE)
bridge = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bridge)


class ProxyRedirectTests(unittest.TestCase):
    def test_upstream_redirect_is_relayed_without_fetching_its_target(self):
        paths = []

        class RedirectHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                paths.append(self.path)
                self.send_response(302 if self.path == "/start" else 200)
                self.send_header("Location", "/private")
                self.end_headers()

            def log_message(self, *args):
                pass

        with ThreadingHTTPServer(("127.0.0.1", 0), RedirectHandler) as upstream:
            thread = threading.Thread(target=upstream.serve_forever)
            thread.start()
            self.addCleanup(thread.join)
            self.addCleanup(upstream.shutdown)
            sent = {}
            handler = SimpleNamespace(
                headers=Message(), rfile=io.BytesIO(), wfile=io.BytesIO(),
                path="/start", command="GET", send_response=lambda code: sent.update(status=code),
                send_header=sent.__setitem__, end_headers=lambda: None,
            )
            with mock.patch.object(bridge, "GATUS_PORT", upstream.server_port):
                bridge._proxy(handler)
            self.assertEqual(paths, ["/start"])
            self.assertEqual(sent["status"], 302)
            self.assertEqual(sent["Location"], "/private")


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


def dispatch(command, path):
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


class StatusPageTests(unittest.TestCase):
    def test_page_routes_serve_the_status_page(self):
        for path in ("/", "/?ref=x", "/endpoints/application_api-health", "/suites/x"):
            sent, body, proxied = dispatch("GET", path)
            self.assertEqual(sent["status"], 200)
            self.assertIn(b"<title>Solace status</title>", body)
            self.assertEqual(sent["Content-Length"], str(len(body)))
            self.assertIn("frame-ancestors 'none'", sent["Content-Security-Policy"])
            self.assertEqual(proxied, [])

    def test_head_sends_no_body(self):
        sent, body, _ = dispatch("HEAD", "/")
        self.assertEqual(sent["status"], 200)
        self.assertEqual(body, b"")

    def test_api_and_assets_go_to_gatus(self):
        for path in ("/api/v1/endpoints/statuses?page=1&pageSize=1", "/solace-logo.png", "/health"):
            _, _, proxied = dispatch("GET", path)
            self.assertEqual(len(proxied), 1)


class TimelineTests(unittest.TestCase):
    DAY_START = 1_793_660_400  # 2026-11-03 00:00 Amsterdam, a merged daily row
    HOURLY_START = 1_793_750_400  # 2026-11-04 00:00 UTC, so three hours share one 6-hour bucket

    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = str(Path(directory.name, "gatus.db"))
        db = sqlite3.connect(path)
        db.executescript(
            "CREATE TABLE endpoints (endpoint_id INTEGER PRIMARY KEY, endpoint_key TEXT);"
            "CREATE TABLE endpoint_uptimes (endpoint_id INTEGER, hour_unix_timestamp INTEGER, total_executions INTEGER,"
            " successful_executions INTEGER, total_response_time INTEGER);"
            "CREATE TABLE endpoint_results (endpoint_result_id INTEGER PRIMARY KEY, endpoint_id INTEGER, success INTEGER,"
            " duration INTEGER, status INTEGER, errors TEXT, timestamp TEXT);"
            "CREATE TABLE endpoint_result_conditions (endpoint_result_condition_id INTEGER PRIMARY KEY, endpoint_result_id INTEGER,"
            " condition TEXT, success INTEGER);"
            "INSERT INTO endpoints VALUES (1, 'application_api-health');"
            "INSERT INTO endpoint_result_conditions VALUES (1, 1, '[STATUS] (0) == 200', 0), (2, 1, '[RESPONSE_TIME] < 5000', 1);"
        )
        db.execute("INSERT INTO endpoint_uptimes VALUES (1, ?, 1440, 1400, 144000)", (self.DAY_START,))
        for hour in range(3):
            db.execute("INSERT INTO endpoint_uptimes VALUES (1, ?, 60, 60, 600)", (self.HOURLY_START + hour * 3600,))
        stamp = datetime.fromtimestamp(self.HOURLY_START + 90, timezone.utc).strftime("%Y-%m-%d %H:%M:%S.123456789 +0000 UTC")
        db.execute("INSERT INTO endpoint_results VALUES (1, 1, 0, 10000000000, 0, 'timeout|~|retry failed', ?)", (stamp,))
        db.execute("INSERT INTO endpoint_results VALUES (2, 1, 1, 9000000, 200, '', 'not a timestamp')")
        db.commit()
        db.close()
        patcher = mock.patch.object(bridge, "GATUS_DB", path)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_merged_days_and_hours_keep_their_spans(self):
        data = bridge.timeline("application_api-health", self.DAY_START, self.HOURLY_START + 3 * 3600)
        self.assertEqual([(b["span"], b["total"], b["ms"]) for b in data["buckets"]], [(86_400, 1440, 100)] + [(3600, 60, 10)] * 3)
        self.assertNotIn("checks", data)

    def test_steps_sum_hours_but_keep_merged_days_whole(self):
        data = bridge.timeline("application_api-health", self.DAY_START, self.HOURLY_START + 3 * 3600, 6 * 3600)
        self.assertEqual([(b["span"], b["total"], b["ok"], b["ms"]) for b in data["buckets"]], [(86_400, 1440, 1400, 100), (21_600, 180, 180, 10)])

    def test_days_follow_the_viewers_midnight(self):
        data = bridge.timeline("application_api-health", self.DAY_START, self.HOURLY_START + 3 * 3600, 86_400, ZoneInfo("Europe/Amsterdam"))
        # 00:00-03:00 UTC on Nov 4 is 01:00-04:00 in Amsterdam, so the hours join the local day that began 23:00 UTC.
        self.assertEqual([(b["at"], b["span"], b["total"]) for b in data["buckets"]], [(self.DAY_START, 86_400, 1440), (self.HOURLY_START - 3600, 86_400, 180)])

    def test_short_windows_include_the_checks_inside_them(self):
        data = bridge.timeline("application_api-health", self.HOURLY_START, self.HOURLY_START + 3600)
        self.assertEqual(data["checks"], [{
            "at": (self.HOURLY_START + 90) * 1000 + 123, "ok": False, "ms": 10000, "status": 0,
            "errors": ["timeout", "retry failed"], "conditions": [["[STATUS] (0) == 200", False], ["[RESPONSE_TIME] < 5000", True]],
        }])
        self.assertEqual(data["checksSince"], (self.HOURLY_START + 90) * 1000 + 123)

    def test_unknown_endpoints_and_bad_ranges_are_refused(self):
        self.assertIsNone(bridge.timeline("nope", self.HOURLY_START, self.HOURLY_START + 3600))
        bad = ("", "?from=x&to=1", "?from=10&to=5", f"?from=0&to={93 * 86_400}", "?from=10&to=20&step=7", "?from=10&to=20&tz=../../etc/passwd", "?from=10&to=20&tz=Mars/Olympus")
        for query in bad:
            sent, _, _ = dispatch("GET", f"/timeline/application_api-health{query}")
            self.assertEqual(sent["status"], 400)
        sent, _, _ = dispatch("GET", "/timeline/nope?from=10&to=20")
        self.assertEqual(sent["status"], 404)
