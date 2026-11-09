#!/usr/bin/env python3
"""Serve the status page, front the Gatus API and forward Stalwart telemetry.alert webhooks to Discord."""
from __future__ import annotations

import hmac
import json
import os
import re
import sqlite3
import sys
import urllib.error
import urllib.parse
import urllib.request
from contextlib import closing
from datetime import datetime, timedelta, tzinfo
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


LISTEN_PORT = int(os.environ.get("PORT", "8080"))
GATUS_PORT = int(os.environ.get("GATUS_INTERNAL_PORT", "8081"))
DISCORD_WEBHOOK_URL = (os.environ.get("DISCORD_WEBHOOK_URL") or "").strip()
BEARER = (os.environ.get("STALWART_WEBHOOK_BEARER") or "").strip()
HOOK_PATH = "/hooks/stalwart"
STATUS_PAGE = Path(__file__).with_name("status.html")
STATUS_PAGE_HEADERS = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
    "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
    "img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
}
GATUS_DB = "/data/gatus.db"
TIMELINE_PATH = "/timeline/"
HOUR = 3600
DAY = 24 * HOUR
TIMELINE_MAX_WINDOW = 92 * DAY
TIMELINE_STEPS = {HOUR, 6 * HOUR, DAY}
CHECKS_WINDOW = 2 * HOUR
GATUS_LIST_SEPARATOR = "|~|"
_ZONE_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_+-]*(?:/[A-Za-z0-9_+-]+){0,2}$")
_GO_TIME = re.compile(r"^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)(?:\.(\d+))? ([+-]\d{4})")
# Drop hop-by-hop + length/encoding: we buffer the body and set Content-Length ourselves.
_SKIP_RESPONSE_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "content-encoding",
    "content-length",
}


def _is_status_page(path: str) -> bool:
    # Gatus's own SPA routes get the Solace page too, so its unthemed UI is never shown.
    return path == "/" or path.startswith(("/endpoints/", "/suites/"))


def _check_time_ms(text: str) -> int | None:
    # Gatus stores Go's time.String(), e.g. "2026-11-05 10:57:39.453228855 +0000 UTC".
    match = _GO_TIME.match(text)
    if not match:
        return None
    at = datetime.strptime(f"{match[1]} {match[3]}", "%Y-%m-%d %H:%M:%S %z")
    return int(at.timestamp()) * 1000 + int((match[2] or "0")[:3].ljust(3, "0"))


def _local_day(at: int, zone: tzinfo) -> tuple[int, int]:
    local = datetime.fromtimestamp(at, zone)
    midnight = datetime(local.year, local.month, local.day, tzinfo=zone)
    begin = int(midnight.timestamp())
    return begin, int((midnight + timedelta(days=1)).timestamp()) - begin


def timeline(key: str, start: int, end: int, step: int = HOUR, zone: tzinfo | None = None) -> dict[str, Any] | None:
    """Uptime buckets of `step` seconds (days at `zone` midnight) for [start, end), plus checks for windows of two hours or less."""
    db = sqlite3.connect(f"file:{GATUS_DB}?mode=ro", uri=True, timeout=5)
    try:
        found = db.execute("SELECT endpoint_id FROM endpoints WHERE endpoint_key = ?", (key,)).fetchone()
        if found is None:
            return None
        rows = db.execute(
            "SELECT hour_unix_timestamp, total_executions, successful_executions, total_response_time FROM endpoint_uptimes"
            " WHERE endpoint_id = ? AND hour_unix_timestamp >= ? AND hour_unix_timestamp < ? ORDER BY hour_unix_timestamp",
            (found[0], start - 2 * DAY, end + 2 * DAY),
        ).fetchall()
        sums: dict[int, list[int]] = {}
        for i, (at, total, ok, total_ms) in enumerate(rows):
            # Rows Gatus merged into days before hourly retention sit a day apart; hourly rows an hour apart.
            span = DAY if i + 1 < len(rows) and rows[i + 1][0] - at >= 23 * HOUR else HOUR
            if at + span <= start or at >= end:
                continue
            if span > step:
                begin, size = at, span
            elif step == DAY and zone is not None:
                begin, size = _local_day(at, zone)
            else:
                begin, size = at - at % step, step
            bucket = sums.setdefault(begin, [size, 0, 0, 0])
            bucket[1] += total
            bucket[2] += ok
            bucket[3] += total_ms
        data: dict[str, Any] = {
            "buckets": [
                {"at": at, "span": size, "total": total, "ok": ok, "ms": round(total_ms / total) if total else 0}
                for at, (size, total, ok, total_ms) in sorted(sums.items())
            ]
        }
        if end - start <= CHECKS_WINDOW:
            checks: dict[int, dict[str, Any]] = {}
            since = None
            for result_id, stamp, ok, duration, status, errors in db.execute(
                "SELECT endpoint_result_id, timestamp, success, duration, status, errors FROM endpoint_results WHERE endpoint_id = ?",
                (found[0],),
            ):
                at = _check_time_ms(stamp)
                if at is None:
                    continue
                since = at if since is None else min(since, at)
                if start * 1000 <= at < end * 1000:
                    checks[result_id] = {
                        "at": at,
                        "ok": bool(ok),
                        "ms": duration // 1_000_000,
                        "status": status,
                        "errors": [error for error in errors.split(GATUS_LIST_SEPARATOR) if error],
                        "conditions": [],
                    }
            if checks:
                marks = ",".join("?" * len(checks))
                for result_id, condition, ok in db.execute(
                    f"SELECT endpoint_result_id, condition, success FROM endpoint_result_conditions WHERE endpoint_result_id IN ({marks})"
                    " ORDER BY endpoint_result_condition_id",
                    tuple(checks),
                ):
                    checks[result_id]["conditions"].append([condition, bool(ok)])
            data["checks"] = sorted(checks.values(), key=lambda check: check["at"])
            data["checksSince"] = since
        return data
    finally:
        db.close()


def _proxy(handler: BaseHTTPRequestHandler) -> None:
    length = int(handler.headers.get("Content-Length") or 0)
    body = handler.rfile.read(length) if length else b""

    # Buffering this response means we cannot keep Content-Encoding. If we
    # forward the browser's Accept-Encoding, Gatus (Fiber) returns Brotli and
    # the status page is served as undecodable bytes.
    headers = {
        key: value
        for key, value in handler.headers.items()
        if key.lower()
        not in {
            "host",
            "connection",
            "transfer-encoding",
            "content-length",
            "accept-encoding",
        }
    }
    headers["Accept-Encoding"] = "identity"
    try:
        with closing(HTTPConnection("127.0.0.1", GATUS_PORT, timeout=60)) as connection:
            connection.request(handler.command, handler.path, body=body or None, headers=headers)
            resp = connection.getresponse()
            payload = resp.read()
            handler.send_response(resp.status)
            for key, value in resp.headers.items():
                if key.lower() in _SKIP_RESPONSE_HEADERS:
                    continue
                handler.send_header(key, value)
            handler.send_header("Content-Length", str(len(payload)))
            handler.end_headers()
            if handler.command != "HEAD":
                handler.wfile.write(payload)
    except Exception:  # noqa: BLE001 — surface upstream failure without internal details
        msg = b"gatus proxy unavailable\n"
        handler.send_response(502)
        handler.send_header("Content-Type", "text/plain")
        handler.send_header("Content-Length", str(len(msg)))
        handler.end_headers()
        handler.wfile.write(msg)


def _authorized(handler: BaseHTTPRequestHandler) -> bool:
    if not BEARER:
        return False
    auth = handler.headers.get("Authorization", "")
    return hmac.compare_digest(auth.encode(), f"Bearer {BEARER}".encode())


def _discord_payload(events: list[dict[str, Any]]) -> dict[str, Any]:
    lines: list[str] = []
    for event in events:
        etype = event.get("type", "unknown")
        data = event.get("data") or {}
        message = ""
        if isinstance(data, dict):
            message = (
                data.get("message")
                or data.get("eventMessage")
                or data.get("text")
                or ""
            )
            if not message and data:
                message = json.dumps(data, separators=(",", ":"))[:500]
        created = event.get("createdAt", "")
        line = f"**{etype}**"
        if created:
            line += f" · `{created}`"
        if message:
            line += f"\n{message}"
        lines.append(line)

    description = "\n\n".join(lines)[:3900] or "Stalwart metric alert fired."
    return {
        "username": "Solace Mail Alerts",
        "embeds": [
            {
                "title": "Stalwart metric alert",
                "description": description,
                "color": 0xE54D2E,
                "footer": {"text": "Enterprise Alert → status.solace.onl/hooks/stalwart"},
            }
        ],
    }


def _post_discord(payload: dict[str, Any]) -> tuple[int, str]:
    if not DISCORD_WEBHOOK_URL:
        return 503, "DISCORD_WEBHOOK_URL not configured"
    req = urllib.request.Request(
        DISCORD_WEBHOOK_URL,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode("utf-8", "replace")
    except urllib.error.URLError as err:
        return 502, f"discord unreachable: {err.reason}"
    except Exception as exc:  # noqa: BLE001 — timeouts, SSL, and other network failures
        return 502, f"discord post failed: {exc}"


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: Any) -> None:
        try:
            status = int(args[1])
        except (IndexError, TypeError, ValueError):
            status = 500
        stream = sys.stderr if status >= 400 else sys.stdout
        stream.write("%s - %s\n" % (self.address_string(), fmt % args))
        stream.flush()

    def do_HEAD(self) -> None:  # noqa: N802
        self._dispatch()

    def do_GET(self) -> None:  # noqa: N802
        self._dispatch()

    def do_POST(self) -> None:  # noqa: N802
        self._dispatch()

    def do_PUT(self) -> None:  # noqa: N802
        self._dispatch()

    def do_DELETE(self) -> None:  # noqa: N802
        self._dispatch()

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._dispatch()

    def _dispatch(self) -> None:
        path = self.path.split("?", 1)[0]
        if path.rstrip("/") == HOOK_PATH.rstrip("/") and self.command == "POST":
            self._handle_stalwart()
            return
        if self.command in ("GET", "HEAD") and _is_status_page(path):
            self._send_status_page()
            return
        if self.command == "GET" and path.startswith(TIMELINE_PATH):
            self._handle_timeline(urllib.parse.unquote(path[len(TIMELINE_PATH):]))
            return
        _proxy(self)

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _handle_timeline(self, key: str) -> None:
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        try:
            start, end = int(query["from"][0]), int(query["to"][0])
            step = int(query.get("step", [HOUR])[0])
        except (KeyError, ValueError):
            self._send_json(400, {"error": "from, to and step must be whole seconds"})
            return
        if not key or not 0 < end - start <= TIMELINE_MAX_WINDOW or step not in TIMELINE_STEPS:
            self._send_json(400, {"error": "invalid endpoint, range or step"})
            return
        zone = None
        if "tz" in query:
            try:
                if not _ZONE_NAME.match(query["tz"][0]):
                    raise ValueError
                zone = ZoneInfo(query["tz"][0])
            except (ValueError, ZoneInfoNotFoundError):
                self._send_json(400, {"error": "unknown time zone"})
                return
        try:
            data = timeline(key, start, end, step, zone)
        except sqlite3.Error:
            self._send_json(503, {"error": "history unavailable"})
            return
        if data is None:
            self._send_json(404, {"error": "unknown endpoint"})
            return
        self._send_json(200, data)

    def _send_status_page(self) -> None:
        body = STATUS_PAGE.read_bytes()
        self.send_response(200)
        for key, value in STATUS_PAGE_HEADERS.items():
            self.send_header(key, value)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _handle_stalwart(self) -> None:
        if not _authorized(self):
            body = b"unauthorized\n"
            self.send_response(401)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            body = b"invalid json\n"
            self.send_response(400)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        events = payload.get("events") if isinstance(payload, dict) else None
        if not isinstance(events, list):
            events = [payload] if isinstance(payload, dict) else []

        alerts = [
            e
            for e in events
            if isinstance(e, dict) and str(e.get("type", "")).startswith("telemetry.alert")
        ]
        if not alerts:
            # Still acknowledge non-alert batches so Stalwart does not retry forever.
            body = b'{"ok":true,"forwarded":0}\n'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        status, detail = _post_discord(_discord_payload(alerts))
        out = json.dumps({"ok": 200 <= status < 300, "discord": status, "detail": detail[:200]}).encode()
        self.send_response(200 if 200 <= status < 300 else 502)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)


def main() -> int:
    if not BEARER:
        print("STALWART_WEBHOOK_BEARER unset; /hooks/stalwart will reject all posts.", file=sys.stderr)
    if not DISCORD_WEBHOOK_URL:
        print("DISCORD_WEBHOOK_URL unset; Stalwart alerts cannot reach Discord.", file=sys.stderr)

    server = ThreadingHTTPServer(("0.0.0.0", LISTEN_PORT), Handler)
    print(f"proxy listening on :{LISTEN_PORT}, gatus upstream :{GATUS_PORT}", flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
