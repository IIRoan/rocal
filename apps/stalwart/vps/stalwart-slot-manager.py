#!/usr/bin/env python3
import json
import fcntl
import os
import subprocess
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ACTIVE_SLOT_FILE = os.environ.get("ACTIVE_SLOT_FILE", "/etc/haproxy/stalwart-active-slot")
SWITCH_COMMAND = os.environ.get("SWITCH_COMMAND", "/usr/local/bin/stalwart-switch-slot")
AUTH_TOKEN = os.environ.get("SLOT_MANAGER_TOKEN", "")
BIND_ADDR = os.environ.get("SLOT_MANAGER_BIND", "127.0.0.1")
PORT = int(os.environ.get("SLOT_MANAGER_PORT", "9081"))
PREEMPT_DIR = os.environ.get("SLOT_PREEMPT_DIR", "/run/stalwart-slot-preempt")
LEASE_SECONDS = 30
PREEMPT_SECONDS = 90
STATE_LOCK = threading.RLock()
SLOT_PORTS = {
    "blue": (10025, 18080),
    "green": (11025, 19080),
}
FRP_PROXIES = {
    slot: tuple(f"{name}-{slot}" for name in
                ("smtp", "https", "http-admin", "submission", "submissions", "imaps"))
    for slot in ("blue", "green")
}
HTTP_HEALTHCHECK_HOST = os.environ.get("HTTP_HEALTHCHECK_HOST", "mail.solace.onl")
FRPS_DASHBOARD = os.environ.get("FRPS_DASHBOARD_URL", "http://127.0.0.1:7500")


def read_active_slot():
    try:
        with open(ACTIVE_SLOT_FILE, "r", encoding="utf-8") as handle:
            slot = handle.read().strip()
            return slot if slot in {"blue", "green"} else "blue"
    except FileNotFoundError:
        return "blue"


def preempt_path(slot):
    return os.path.join(PREEMPT_DIR, slot)


def read_slot_state(slot):
    try:
        with open(preempt_path(slot), encoding="utf-8") as handle:
            state = json.load(handle)
    except (FileNotFoundError, ValueError):
        return {}
    if not isinstance(state, dict):  # Old boolean flags have no owner or deadline.
        return {}
    now = time.time()
    return {key: value for key, value in state.items()
            if key == "lastOwner" or
            (key in {"lease", "preempt", "activating"} and value["expires"] > now)}


def write_slot_state(slot, state):
    os.makedirs(PREEMPT_DIR, mode=0o700, exist_ok=True)
    path = preempt_path(slot)
    with open(path + ".tmp", "w", encoding="utf-8") as handle:
        json.dump(state, handle)
    os.replace(path + ".tmp", path)


def coordinate_slot(action, slot, owner):
    # Reserve before launching, including while a client has not yet registered
    # proxies. Preempt never steals a live lease: its holder must stop and release.
    with STATE_LOCK:
        state = read_slot_state(slot)
        lease = state.get("lease", {})
        preempt = state.get("preempt", {})
        active = read_active_slot()
        if action == "/preempt":
            if active == slot or state.get("activating") or preempt.get("owner", owner) != owner:
                return 409, {"error": "slot_unavailable"}
            state["preempt"] = {"owner": owner, "expires": time.time() + PREEMPT_SECONDS}
        elif action == "/preempt/clear":
            if preempt.get("owner", owner) != owner:
                return 409, {"error": "not_preempt_owner"}
            state.pop("preempt", None)
        elif action == "/lease/release":
            if lease.get("owner", owner) != owner:
                return 409, {"error": "not_lease_owner"}
            state.pop("lease", None)
        else:
            if preempt and preempt["owner"] != owner and active != slot:
                return 409, {"error": "preempted"}
            if lease.get("owner", owner) != owner:
                return 409, {"error": "leased"}
            if action == "/lease/renew" and not lease:
                return 409, {"error": "lease_expired"}
            if action in {"/lease/claim", "/lease/reclaim"} and not lease:
                # Unknown dashboard state is not evidence of vacancy. Do not use
                # a failed application probe to infer that a tunnel is absent.
                proxies = fetch_frp_proxies()
                recovering = action == "/lease/reclaim" and state.get("lastOwner") in (None, owner)
                if (active == slot and not recovering) or proxies is None or any(
                    proxies.get(name) == "online" for name in FRP_PROXIES[slot]
                ):
                    return 409, {"error": "slot_not_vacant"}
            state["lease"] = {"owner": owner, "expires": time.time() + LEASE_SECONDS}
            state["lastOwner"] = owner
        write_slot_state(slot, state)
        return 200, {"slot": slot, "leaseSeconds": LEASE_SECONDS}


def fetch_frp_proxies():
    try:
        request = urllib.request.Request(
            f"{FRPS_DASHBOARD}/api/proxy/tcp",
            headers={"Connection": "close"},
            method="GET",
        )
        with urllib.request.urlopen(request, timeout=3) as resp:
            payload = json.load(resp)
    except Exception:
        return None
    if not isinstance(payload, dict) or not isinstance(payload.get("proxies"), list):
        return None
    return {
        entry.get("name", ""): entry.get("status", "offline")
        for entry in payload.get("proxies", [])
        if entry.get("name")
    }




def read_status():
    proxies = fetch_frp_proxies()
    result = {
        "protocolVersion": 2,
        "active": read_active_slot(),
    }
    with STATE_LOCK:
        for slot in SLOT_PORTS:
            state = read_slot_state(slot)
            result[f"{slot}Occupied"] = None if proxies is None else any(
                proxies.get(name) == "online" for name in FRP_PROXIES[slot]
            )
            result[f"{slot}Preempted"] = bool(state.get("preempt"))
            result[f"{slot}PreemptOwner"] = state.get("preempt", {}).get("owner")
            result[f"{slot}Owner"] = state.get("lease", {}).get("owner")
    return result


def fetch_active_prometheus(authorization):
    """Scrape Prometheus from the active slot's local HTTP port (bypasses HAProxy round-robin)."""
    slot = read_active_slot()
    http_port = SLOT_PORTS[slot][1]
    command = [
        "curl",
        "-fsS",
        "--max-time",
        "15",
        "--haproxy-protocol",
        "-H",
        f"Host: {HTTP_HEALTHCHECK_HOST}",
    ]
    if authorization:
        command.extend(["-H", f"Authorization: {authorization}"])
    command.append(f"http://127.0.0.1:{http_port}/metrics/prometheus")
    return subprocess.run(command, capture_output=True, text=True)


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self):
        if not AUTH_TOKEN:
            return False
        return self.headers.get("Authorization") == f"Bearer {AUTH_TOKEN}"

    def _proxy_prometheus(self):
        result = fetch_active_prometheus(self.headers.get("Authorization", ""))
        if result.returncode != 0:
            details = (result.stderr or result.stdout or "prometheus scrape failed").strip()
            self._send(502, {"error": "prometheus_proxy_failed", "details": details})
            return

        body = result.stdout.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/metrics/prometheus":
            self._proxy_prometheus()
            return
        if self.path == "/active":
            self._send(200, {"active": read_active_slot()})
            return
        if self.path == "/status":
            if not self._authorized():
                self._send(401, {"error": "unauthorized"})
                return
            self._send(200, read_status())
            return
        else:
            self._send(404, {"error": "not_found"})
            return

    def do_POST(self):
        if self.path not in {"/activate", "/preempt", "/preempt/clear",
                             "/lease/claim", "/lease/reclaim", "/lease/renew", "/lease/release"}:
            self._send(404, {"error": "not_found"})
            return
        if not self._authorized():
            self._send(401, {"error": "unauthorized"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 <= length <= 4096:
                raise ValueError("invalid length")
            raw_body = self.rfile.read(length)
            payload = json.loads(raw_body or b"{}")
            if not isinstance(payload, dict):
                raise ValueError("invalid body")
        except ValueError:
            self._send(400, {"error": "invalid_json"})
            return

        slot = payload.get("slot")
        if slot not in ("blue", "green"):
            self._send(400, {"error": "invalid_slot"})
            return

        owner = payload.get("owner")
        if self.path != "/activate":
            if not isinstance(owner, str) or not 1 <= len(owner) <= 128:
                self._send(400, {"error": "owner_required"})
                return
            status, result = coordinate_slot(self.path, slot, owner)
            self._send(status, result)
            return

        try:
            # Share the watcher's switch lock, but keep lease renewal responsive
            # throughout JMAP warmup and HAProxy cutover.
            lock_path = os.environ.get("SLOT_SWITCH_LOCK", "/run/stalwart-slot-switch.lock")
            with open(lock_path, "w", encoding="utf-8") as lock:
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
                with STATE_LOCK:
                    state = read_slot_state(slot)
                    lease = state.get("lease", {})
                    # Old entrypoints may activate only when no v2 owner exists.
                    if (owner and lease.get("owner") != owner) or (lease and lease["owner"] != owner):
                        self._send(409, {"error": "not_lease_owner"})
                        return
                    state["activating"] = {"owner": owner, "expires": time.time() + 300}
                    write_slot_state(slot, state)
                try:
                    subprocess.run([SWITCH_COMMAND, slot], check=True, capture_output=True, text=True)
                    if owner:
                        coordinate_slot("/preempt/clear", slot, owner)
                finally:
                    with STATE_LOCK:
                        state = read_slot_state(slot)
                        state.pop("activating", None)
                        write_slot_state(slot, state)
        except subprocess.CalledProcessError as exc:
            self._send(502, {"error": "switch_failed", "details": exc.stderr or exc.stdout})
            return

        self._send(200, {"active": read_active_slot()})

    def log_message(self, fmt, *args):
        return


if __name__ == "__main__":
    ThreadingHTTPServer((BIND_ADDR, PORT), Handler).serve_forever()
