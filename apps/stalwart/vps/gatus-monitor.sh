#!/usr/bin/env python3
"""Emit JSON health for Gatus SSH monitoring on the mail VPS."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.request

FRPS_DASHBOARD = os.environ.get("FRPS_DASHBOARD_URL", "http://127.0.0.1:7500")
SERVICES = (
    "haproxy",
    "frps",
    "frpc-relay",
    "postfix",
)
GROUP_HTTP_PORT = 18080
GROUPS = ("smtp", "http")


def http_ready(port: int) -> bool:
    # HTTP listeners require PROXY v2; a bare TCP connect logs network.proxy-error end-of-stream.
    try:
        result = subprocess.run(
            [
                "curl",
                "-fsS",
                "--max-time",
                "2",
                "--haproxy-protocol",
                "-H",
                "Host: mail.solace.onl",
                f"http://127.0.0.1:{port}/jmap/session",
            ],
            check=False,
            capture_output=True,
            timeout=3,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0


def service_active(unit: str) -> str:
    try:
        result = subprocess.run(
            ["systemctl", "is-active", unit],
            check=False,
            capture_output=True,
            text=True,
            timeout=3,
        )
    except (OSError, subprocess.TimeoutExpired):
        return "unknown"
    return (result.stdout or result.stderr or "unknown").strip()


def fetch_frp_proxies() -> dict[str, str]:
    try:
        request = urllib.request.Request(
            f"{FRPS_DASHBOARD}/api/proxy/tcp",
            headers={"Connection": "close"},
            method="GET",
        )
        with urllib.request.urlopen(request, timeout=3) as response:
            payload = json.load(response)
    except Exception:  # noqa: BLE001
        return {}

    return {
        entry.get("name", ""): entry.get("status", "offline")
        for entry in payload.get("proxies", [])
        if entry.get("name")
    }


def postfix_queue_count() -> int | None:
    try:
        result = subprocess.run(
            ["postqueue", "-p"],
            check=False,
            capture_output=True,
            text=True,
            timeout=3,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None

    lines = [line for line in result.stdout.splitlines() if line.strip()]
    if not lines:
        return 0
    if lines[-1].startswith("-- "):
        try:
            return int(lines[-1].split()[0])
        except (IndexError, ValueError):
            return None
    return len(lines)


def main() -> int:
    proxies = fetch_frp_proxies()
    services = {name: service_active(name) for name in SERVICES}
    queue = postfix_queue_count()
    # Containers register as <group>-<container id>; a deploy briefly shows two members.
    members = {
        group: sum(1 for name, state in proxies.items() if name.startswith(f"{group}-") and state == "online")
        for group in GROUPS
    }
    http = http_ready(GROUP_HTTP_PORT)

    unhealthy_services = [
        name for name, state in services.items() if state != "active"
    ]

    status = "healthy"
    if not all(members.values()):
        status = "degraded"
    if unhealthy_services or not http:
        status = "unhealthy"

    payload = {
        "status": status,
        "services": services,
        "groupMembers": members,
        "http": http,
        "postfixQueue": queue,
        "unhealthyServices": unhealthy_services,
    }
    print(json.dumps(payload, separators=(",", ":")))
    return 0 if status == "healthy" else 1


if __name__ == "__main__":
    sys.exit(main())
