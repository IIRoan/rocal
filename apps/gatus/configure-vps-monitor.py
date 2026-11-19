"""Add the configured SSH checks to Gatus's endpoint list."""

import json
import os
from pathlib import Path
import sys

import yaml


def configure(path: Path, key_path: Path) -> None:
    config = yaml.safe_load(path.read_text())
    endpoints = config.setdefault("endpoints", [])
    existing = {endpoint["name"] for endpoint in endpoints}
    username = os.environ["VPS_MONITOR_SSH_USERNAME"]
    key = key_path.read_text()
    command = os.environ.get("VPS_MONITOR_SSH_COMMAND", "/usr/local/bin/solace-vps-health")
    hosts = (
        ("vps-health", os.environ.get("VPS_MONITOR_SSH_HOST", "mx.solace.onl"),
         os.environ.get("VPS_MONITOR_SSH_PORT", "22")),
        ("vps-secondary-health", os.environ.get("VPS_MONITOR_SSH_SECONDARY_HOST"),
         os.environ.get("VPS_MONITOR_SSH_SECONDARY_PORT", "22")),
    )
    for name, host, port in hosts:
        if not host or name in existing:
            continue
        endpoints.append({
            "name": name,
            "group": "VPS",
            "url": f"ssh://{host}:{port}",
            "interval": "1m",
            "ui": {"hide-url": True},
            "client": {"timeout": "20s"},
            "alerts": [{"type": "discord"}],
            "ssh": {"username": username, "private-key": key},
            "body": json.dumps({"command": command}),
            "conditions": [
                "[CONNECTED] == true",
                "[STATUS] == 0",
                "[BODY].status == healthy",
                "[BODY].k3sReady == true",
                "[BODY].smtpStarttls == true",
                "[BODY].tlsExpiresInSeconds > 1209600",
            ],
        })
    temporary = path.with_suffix(".yaml.tmp")
    temporary.write_text(yaml.safe_dump(config, sort_keys=False))
    temporary.chmod(0o600)
    temporary.replace(path)


if __name__ == "__main__":
    try:
        configure(Path(sys.argv[1]), Path(sys.argv[2]))
    except (ValueError, TypeError, AttributeError, KeyError, OSError, yaml.YAMLError):
        raise SystemExit("Could not configure the Gatus SSH endpoints") from None
