#!/usr/bin/python3
"""Report the health of the VPS that accepted this SSH connection."""

import json
import smtplib
import socket
import ssl
import subprocess
import sys
import time
import urllib.request


VPS = {
    "mx": ("mx.solace.onl", "193.180.211.139", ("postfix", "solace-primary-relay")),
    "mx2": ("mx2.solace.onl", "193.180.213.115", ("solace-exim-relay", "solace-standby-relay")),
}


def service_state(unit):
    try:
        result = subprocess.run(["/usr/bin/systemctl", "is-active", unit],
                                capture_output=True, text=True, timeout=2, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return "unknown"
    return result.stdout.strip() or "unknown"


def kubelet_ready():
    try:
        with urllib.request.urlopen("http://127.0.0.1:10248/healthz", timeout=3) as response:
            return response.status == 200 and response.read(16).strip() == b"ok"
    except OSError:
        return False


def smtp_tls_lifetime(host, ip):
    try:
        # Connect to the node's own address with its public hostname for TLS verification.
        with smtplib.SMTP(timeout=4, local_hostname=host) as connection:
            if connection.connect(ip, 25)[0] != 220:
                return 0
            connection._host = host
            if connection.ehlo()[0] != 250:
                return 0
            connection.starttls(context=ssl.create_default_context())
            if connection.ehlo()[0] != 250:
                return 0
            expiry = ssl.cert_time_to_seconds(connection.sock.getpeercert()["notAfter"])
            return max(0, int(expiry - time.time()))
    except (OSError, smtplib.SMTPException, ValueError, KeyError):
        return 0


def main():
    node = socket.gethostname().split(".", 1)[0]
    if node not in VPS:
        print(json.dumps({"status": "unhealthy", "reason": "unexpected VPS hostname"}))
        return 1
    host, ip, relay_units = VPS[node]
    services = {unit: service_state(unit) for unit in ("haproxy", "k3s-agent", *relay_units)}
    k3s = kubelet_ready()
    expiry = smtp_tls_lifetime(host, ip)
    healthy = k3s and expiry > 0 and all(state == "active" for state in services.values())
    print(json.dumps({
        "status": "healthy" if healthy else "unhealthy",
        "node": host,
        "services": services,
        "k3sReady": k3s,
        "smtpStarttls": expiry > 0,
        "tlsExpiresInSeconds": expiry,
        # The previous Gatus deployment expects these fields until its rollout completes.
        "http": k3s,
        "groupMembers": {"http": int(k3s), "smtp": int(expiry > 0)},
    }, separators=(",", ":")))
    return 0 if healthy else 1


if __name__ == "__main__":
    sys.exit(main())
