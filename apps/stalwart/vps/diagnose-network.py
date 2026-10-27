#!/usr/bin/env python3
"""Collect bounded infrastructure counters without emitting journal messages or client addresses."""

import datetime
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tempfile


SERVICES = ("haproxy", "frps", "frpc-relay", "postfix")
EVENTS = {
    "connection_timeout": ("i/o timeout", "connection timed out", "deadline exceeded"),
    "heartbeat_timeout": ("heartbeat timeout",),
    "connection_closed": ("connection closed", "connection is closed", "stream closed", "eof"),
    "login_success": ("client login", "login to server success"),
    "proxy_registered": ("new proxy", "start proxy success"),
    "service_started": ("started ", "starting "),
    "service_stopped": ("stopped ", "stopping "),
    "out_of_memory": ("out of memory", "oom-kill", "oom killer"),
    "conntrack_full": ("nf_conntrack: table full",),
    "network_reset": ("netdev watchdog", "link is down", "link down", "reset adapter"),
    "address_banned": (" ban ",),
    "address_unbanned": (" unban ",),
}
COUNTERS = ("ListenDrops", "ListenOverflows", "TCPTimeouts", "TCPSynRetrans", "TCPAbortOnTimeout", "TCPMemoryPressures")
STATES = {"active", "inactive", "failed", "activating", "deactivating", "unknown"}


def window(start, end):
    times = [datetime.datetime.fromisoformat(value.replace("Z", "+00:00")) for value in (start, end)]
    if any(value.tzinfo is None for value in times) or not 0 < (times[1] - times[0]).total_seconds() <= 1200:
        raise ValueError("invalid_window")
    return tuple(value.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") for value in times)


def command(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=20)
    return result.stdout if result.returncode == 0 else None


def journal_summary(raw):
    counts = {name: 0 for name in EVENTS}
    if raw is None:
        return {"available": False, "truncated": False, "categories": counts}
    for line in raw.splitlines():
        try:
            row = json.loads(line)
        except ValueError:
            continue
        message = row.get("MESSAGE") if isinstance(row, dict) else None
        if not isinstance(message, str):
            continue
        for name, patterns in EVENTS.items():
            if any(pattern in message.lower() for pattern in patterns):
                counts[name] += 1
    return {"available": True, "truncated": len(raw.splitlines()) >= 2000, "categories": counts}


def tcp_counters(raw):
    lines = raw.splitlines()
    result = {}
    for names, values in zip(lines, lines[1:]):
        if names.startswith("TcpExt:") and values.startswith("TcpExt:"):
            for name, value in zip(names.split()[1:], values.split()[1:]):
                if name in COUNTERS and value.isdigit():
                    result[name] = int(value)
    return result


def ban_history(start, end, path=Path("/var/log/fail2ban.log")):
    start_time, end_time = [datetime.datetime.fromisoformat(value.replace("Z", "+00:00")) for value in (start, end)]
    try:
        with path.open("rb") as handle:
            handle.seek(0, 2)
            offset = max(0, handle.tell() - 4_000_000)
            handle.seek(offset)
            if offset:
                handle.readline()
            lines = handle.read(4_000_000).decode("utf-8", "replace").splitlines()
    except OSError:
        return journal_summary(None)
    selected, first = [], None
    for line in lines:
        try:
            date = datetime.datetime.strptime(line[:23], "%Y-%m-%d %H:%M:%S,%f").astimezone(datetime.timezone.utc)
        except ValueError:
            continue
        first = first or date
        if start_time <= date <= end_time:
            selected.append(json.dumps({"MESSAGE": line}))
    result = journal_summary("\n".join(selected))
    result["truncated"] = first is None or first > start_time
    return result


def collect(start, end):
    start, end = window(start, end)
    if os.geteuid() != 0:
        raise ValueError("administrator_required")
    services = {}
    for name in SERVICES:
        raw = command(["systemctl", "show", name, "-p", "ActiveState", "-p", "NRestarts", "-p", "ActiveEnterTimestampMonotonic"])
        fields = dict(line.split("=", 1) for line in (raw or "").splitlines() if "=" in line)
        services[name] = {
            "state": fields.get("ActiveState") if fields.get("ActiveState") in STATES else "unknown",
            "restarts": int(fields["NRestarts"]) if fields.get("NRestarts", "").isdigit() else None,
            "activeSinceMonotonicMicroseconds": int(fields["ActiveEnterTimestampMonotonic"]) if fields.get("ActiveEnterTimestampMonotonic", "").isdigit() else None,
        }
    dates = [datetime.datetime.fromisoformat(value.replace("Z", "+00:00")).strftime("%Y-%m-%d %H:%M:%S UTC") for value in (start, end)]
    args = ["journalctl", "--since", dates[0], "--until", dates[1], "--no-pager", "--output=json", "--output-fields=MESSAGE", "--lines=2000", "--quiet"]
    tunnel = journal_summary(command([*args, "-u", "frps", "-u", "frpc-relay", "-u", "haproxy"]))
    kernel = journal_summary(command([*args, "--kernel"]))
    return {
        "window": {"start": start, "end": end},
        "observedAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "uptimeSeconds": int(float(Path("/proc/uptime").read_text().split()[0])),
        "services": services,
        "tunnel": tunnel,
        "kernel": kernel,
        "bans": ban_history(start, end),
        "cumulativeTcpCounters": tcp_counters(Path("/proc/net/netstat").read_text()),
    }


def validate_report(report, start, end):
    if not isinstance(report, dict) or set(report) != {"window", "observedAt", "uptimeSeconds", "services", "tunnel", "kernel", "bans", "cumulativeTcpCounters"}:
        raise ValueError("invalid_report")
    if report["window"] != {"start": start, "end": end} or type(report["uptimeSeconds"]) is not int:
        raise ValueError("invalid_report")
    observed = datetime.datetime.strptime(report["observedAt"], "%Y-%m-%dT%H:%M:%SZ")
    if observed.strftime("%Y-%m-%dT%H:%M:%SZ") != report["observedAt"]:
        raise ValueError("invalid_report")
    if not isinstance(report["services"], dict) or set(report["services"]) != set(SERVICES):
        raise ValueError("invalid_report")
    for service in report["services"].values():
        if not isinstance(service, dict) or set(service) != {"state", "restarts", "activeSinceMonotonicMicroseconds"} or service["state"] not in STATES:
            raise ValueError("invalid_report")
        if any(value is not None and type(value) is not int for key, value in service.items() if key != "state"):
            raise ValueError("invalid_report")
    for name in ("tunnel", "kernel", "bans"):
        data = report[name]
        if not isinstance(data, dict) or set(data) != {"available", "truncated", "categories"} or type(data["available"]) is not bool or type(data["truncated"]) is not bool or not isinstance(data["categories"], dict) or set(data["categories"]) != set(EVENTS):
            raise ValueError("invalid_report")
        if any(type(value) is not int for value in data["categories"].values()):
            raise ValueError("invalid_report")
    if not isinstance(report["cumulativeTcpCounters"], dict) or set(report["cumulativeTcpCounters"]) - set(COUNTERS) or any(type(value) is not int for value in report["cumulativeTcpCounters"].values()):
        raise ValueError("invalid_report")
    return report


def remote(start, end, env):
    start, end = window(start, end)
    host = env.get("VPS_SSH_HOST") or "mail.solace.onl"
    user = env.get("VPS_SSH_USER") or "Roan"
    port = env.get("VPS_SSH_PORT") or "22"
    if not re.fullmatch(r"[A-Za-z0-9.:-]+", host) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_-]*", user) or not port.isdigit() or not 0 < int(port) < 65536:
        raise ValueError("invalid_ssh_target")
    with tempfile.TemporaryDirectory(prefix="solace-vps-diagnostics-") as directory:
        key, known = Path(directory, "identity"), Path(directory, "known_hosts")
        key.write_text(env["VPS_SSH_PRIVATE_KEY"].strip() + "\n")
        known.write_text(env["VPS_SSH_KNOWN_HOSTS"].strip() + "\n")
        key.chmod(0o600)
        known.chmod(0o600)
        args = ["ssh", "-T", "-i", str(key), "-p", port, "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "StrictHostKeyChecking=yes", "-o", f"UserKnownHostsFile={known}", "-o", "ConnectTimeout=10", f"{user}@{host}", shlex.join(["sudo", "-n", "python3", "-", "--collect", start, end])]
        result = subprocess.run(args, input=Path(__file__).read_text(), capture_output=True, text=True, timeout=90)
        if result.returncode != 0:
            raise ValueError("ssh_diagnostic_failed")
        return validate_report(json.loads(result.stdout), start, end)


def main():
    try:
        if len(sys.argv) == 4 and sys.argv[1] == "--collect":
            report = collect(sys.argv[2], sys.argv[3])
        elif len(sys.argv) == 1:
            report = remote(os.environ.get("WINDOW_START", ""), os.environ.get("WINDOW_END", ""), os.environ)
        else:
            raise ValueError("invalid_arguments")
        print(json.dumps(report, sort_keys=True))
        return 0
    except (ValueError, KeyError, TypeError, OSError, subprocess.TimeoutExpired):
        print('{"error":"diagnostic_unavailable"}')
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
