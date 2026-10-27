"""Validate the private operator allowlist before HAProxy reads it."""

import ipaddress
import os
from pathlib import Path
import sys


def render(value):
    try:
        networks = [ipaddress.ip_network(item, strict=False) for item in value.replace(",", " ").split()]
    except ValueError:
        raise ValueError("Invalid administrator network allowlist.") from None
    if any(network.prefixlen == 0 for network in networks):
        raise ValueError("Administrator access cannot allow the entire internet.")
    return "".join(f"{network}\n" for network in networks)


if __name__ == "__main__":
    try:
        contents = render(os.environ.get("STALWART_ADMIN_ALLOW_IPS", ""))
    except ValueError as error:
        raise SystemExit(str(error)) from None
    path = Path(sys.argv[1])
    path.chmod(0o600)
    path.write_text(contents)
