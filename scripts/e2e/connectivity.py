import os
from pathlib import Path
import re
import subprocess

from common import backend_pid, wait_url

HEALTH_URL = "http://127.0.0.1:4001/api/health"
# The apps reach the disposable API and the S3 mock through these two reverse mappings only.
REQUIRED_PORTS = (4001, 59000)
DEVICE_STATES = frozenset(("device", "offline", "unauthorized"))


def adb(device, *arguments, seconds=15):
    sdk = os.environ.get("ANDROID_HOME", os.environ.get("ANDROID_SDK_ROOT"))
    tool = str(Path(sdk) / "platform-tools/adb") if sdk else "adb"
    try:
        return subprocess.run([tool, "-s", device, *arguments], text=True, capture_output=True, check=False, timeout=seconds)
    except (OSError, subprocess.TimeoutExpired):
        return None


def host_healthy():
    try:
        wait_url(HEALTH_URL, seconds=10)
    except RuntimeError:
        return False
    return True


def backend_alive():
    try:
        return backend_pid() is not None
    except (OSError, ValueError):
        return False


def device_state(device):
    completed = adb(device, "get-state")
    if completed is None or completed.returncode != 0:
        return "unavailable"
    state = (completed.stdout or "").strip()
    return state if state in DEVICE_STATES else "unknown"


def mapped_ports(device):
    completed = adb(device, "reverse", "--list")
    if completed is None or completed.returncode != 0:
        return frozenset()
    ports = set()
    for line in (completed.stdout or "").splitlines():
        # Each line ends with the device-side and host-side sockets; what precedes them differs between adb versions.
        match = re.search(r"(?:^|\s)tcp:(4001|59000)\s+tcp:(4001|59000)$", line.strip())
        if match and match.group(1) == match.group(2):
            ports.add(int(match.group(1)))
    return frozenset(ports)


def observe(device, backend_expected=True):
    """Fixed booleans and states only; adb output, logs and response bodies never leave this module."""
    ports = mapped_ports(device)
    return {
        "backendAlive": backend_alive(),
        # A journey that suspends the backend on purpose has no health to report.
        "hostHealthy": host_healthy() if backend_expected else None,
        "deviceState": device_state(device),
        "reverse": {str(port): port in ports for port in REQUIRED_PORTS},
    }


def failure_reason(status, backend_expected=True):
    if backend_expected and not (status["backendAlive"] and status["hostHealthy"]):
        return "backend-unavailable"
    if status["deviceState"] != "device":
        return "device-unavailable"
    if not all(status["reverse"].values()):
        return "device-forwarding-missing"
    return None


def prepare(device, backend_expected=True):
    """Re-issues a required mapping that is gone, then reports what is true now and why a journey cannot start."""
    mapped = mapped_ports(device)
    missing = [port for port in REQUIRED_PORTS if port not in mapped]
    for port in missing:
        adb(device, "reverse", f"tcp:{port}", f"tcp:{port}")
    status = observe(device, backend_expected)
    status["reverseRestored"] = bool(missing) and all(status["reverse"][str(port)] for port in missing)
    return status, failure_reason(status, backend_expected)
