import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time

import run as journeys
from common import REPO, directory, unpack

APP_ID = "onl.solace.pickerprobe"
SOURCE = REPO / "e2e/picker-probe"
STYLES = (("automatic", "open-automatic"), ("full-screen", "open-full-screen"))
# The flow's three waits have distinct budgets, so a failed wait's configured timeout names its phase.
PHASES = {60000: "launch", 180000: "grid", 30000: "cancel"}
CASE_SECONDS = 600
SETUP_SECONDS = 300


def probe_directory():
    path = directory() / "private/picker-probe"
    path.mkdir(exist_ok=True)
    return path


def bounded_int(name, default, low, high):
    value = os.environ.get(name, "")
    return min(max(int(value), low), high) if value.isascii() and value.isdecimal() else default


def quiet(command, seconds=SETUP_SECONDS, capture=False):
    """Runs a setup command with a hard limit; its stderr stays in the private probe log."""
    with (probe_directory() / "setup.log").open("ab") as log:
        completed = subprocess.run([str(part) for part in command], cwd=REPO, check=True, timeout=seconds,
                                   stdout=subprocess.PIPE if capture else log, stderr=log)
    return completed.stdout.decode().strip() if capture else None


def build():
    app = probe_directory() / "PickerProbe.app"
    shutil.rmtree(app, ignore_errors=True)
    app.mkdir()
    architecture = quiet(["uname", "-m"], capture=True)
    sdk = quiet(["xcrun", "--sdk", "iphonesimulator", "--show-sdk-path"], capture=True)
    quiet(["xcrun", "--sdk", "iphonesimulator", "swiftc", "-sdk", sdk, "-parse-as-library", "-O", "-target",
           f"{architecture}-apple-ios17.0-simulator", SOURCE / "PickerProbe.swift", "-o", app / "PickerProbe"], seconds=600)
    shutil.copyfile(SOURCE / "Info.plist", app / "Info.plist")
    quiet(["codesign", "--force", "--sign", "-", app])
    return app


def owned_devices():
    path = probe_directory() / "devices.json"
    return json.loads(path.read_text()) if path.exists() else []


def remember_device(identifier):
    (probe_directory() / "devices.json").write_text(json.dumps([*owned_devices(), identifier]))


def select_device_type():
    available = json.loads(quiet(["xcrun", "simctl", "list", "-j"], capture=True))
    runtimes = [runtime for runtime in available["runtimes"] if runtime.get("isAvailable") and ".SimRuntime.iOS-" in runtime["identifier"]]
    requested = os.environ.get("SOLACE_E2E_IOS_RUNTIME")
    if requested:
        runtimes = [runtime for runtime in runtimes if runtime["version"] == requested or runtime["version"].startswith(requested + ".")]
    if not runtimes:
        raise RuntimeError("The configured iOS simulator runtime is not installed")
    runtime = max(runtimes, key=lambda item: tuple(int(part) for part in item["version"].split(".")))
    models = [model for model in available["devicetypes"] if "iPhone" in model["name"]]
    model = next((model for model in models if model["name"] == "iPhone 17 Pro Max"), models[-1])
    return model["identifier"], runtime["identifier"]


def create_device(trial, app):
    """Creates, boots and seeds one fresh simulator the same way scripts/e2e/device.py prepares the journey device."""
    model, runtime = select_device_type()
    identifier = quiet(["xcrun", "simctl", "create", f"Solace picker probe {os.getpid()}-{trial}", model, runtime], capture=True)
    remember_device(identifier)
    try:
        quiet(["xcrun", "simctl", "boot", identifier])
        quiet(["xcrun", "simctl", "bootstatus", identifier, "-b"])
        developer = Path(os.environ.get("DEVELOPER_DIR") or quiet(["xcode-select", "-p"], capture=True))
        quiet(["open", "-a", developer / "Applications/Simulator.app", "--args", "-CurrentDeviceUDID", identifier])
        quiet(["xcrun", "simctl", "ui", identifier, "appearance", "light"])
        quiet(["xcrun", "simctl", "install", identifier, app])
        quiet(["xcrun", "simctl", "addmedia", identifier, REPO / "crates/solace-api-tests/fixtures/avatar-512.png"])
    except BaseException:
        delete_device(identifier)
        raise
    return identifier


def delete_device(identifier):
    """Deletes only a simulator this probe created; failures are left for the final cleanup pass."""
    if identifier not in owned_devices():
        return
    for command in (["xcrun", "simctl", "shutdown", identifier], ["xcrun", "simctl", "delete", identifier]):
        try:
            quiet(command, seconds=120)
        except (OSError, subprocess.SubprocessError):
            pass


def stop_group(process):
    """Stops the Maestro process group this probe started, including its XCTest runner children."""
    for sig, grace in ((signal.SIGTERM, 15), (signal.SIGKILL, 15)):
        try:
            os.killpg(process.pid, sig)
        except ProcessLookupError:
            return
        try:
            process.wait(timeout=grace)
        except subprocess.TimeoutExpired:
            pass


def run_case(tool, identifier, trial, style, open_id, results):
    root = directory()
    name = f"picker-probe-{trial:02d}-{style}"
    screenshots = root / f"private/maestro/{name}"
    screenshots.mkdir(parents=True, exist_ok=True)
    log, report = root / f"private/{name}.log", root / f"private/{name}.xml"
    command = [tool, "--device", identifier, "test", "--format", "JUNIT", "--output", report, "--test-output-dir", screenshots,
               "--env", f"OPEN_ID={open_id}", SOURCE / "picker.yaml"]
    started = time.monotonic()
    with log.open("wb") as output:
        process = subprocess.Popen([str(part) for part in command], cwd=REPO, env=journeys.maestro_environment(),
                                   stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            exit_code = process.wait(timeout=CASE_SECONDS)
        except subprocess.TimeoutExpired:
            stop_group(process)
            exit_code = None
    passed = exit_code == 0
    reason = None if passed else "journey-timeout" if exit_code is None else journeys.failure_kind(log, report)
    result = {"app": "picker-probe", "name": f"{trial:02d}-{style}", "trial": trial, "style": style, "passed": passed,
              "seconds": round(time.monotonic() - started, 2), "reason": reason, "phase": None}
    if not passed:
        details = journeys.failure_details(log, report, screenshots, reason, exit_code)
        exported = journeys.export_failed_step_hierarchy(screenshots, {}, name, details)
        details["hierarchySource"] = "failed-step" if exported else None
        details["phase"] = PHASES.get(details["commandTimeoutMs"], "other") if details["commandTimeoutMs"] is not None else None
        result["phase"] = details["phase"]
        failures = root / "artifacts/failures"
        failures.mkdir(exist_ok=True)
        (failures / f"{name}.json").write_text(json.dumps(details, indent=2))
        journeys.capture_failure_screenshot("ios", {"id": identifier}, name)
    print(f"{'PASS' if passed else f'FAIL ({reason})'}: picker probe {trial:02d} {style}", flush=True)
    results.append(result)
    journeys.publish(results)


def summarize(results):
    summary = {}
    for style, _ in STYLES:
        runs = [result for result in results if result["style"] == style]
        summary[style] = {
            "runs": len(runs),
            "passed": sum(result["passed"] for result in runs),
            "gridNotShown": sum(result["phase"] == "grid" for result in runs),
            "otherFailures": sum(not result["passed"] and result["phase"] != "grid" for result in runs),
        }
    return summary


def probe():
    root = directory()
    app = probe_directory() / "PickerProbe.app"
    if not (app / "PickerProbe").is_file():
        raise SystemExit("Build the probe app first")
    trials = bounded_int("PROBE_TRIALS", 3, 1, 6)
    deadline = time.monotonic() + bounded_int("PROBE_SECONDS", 2700, 600, 3600)
    tool = unpack("maestro", "maestro")
    results = []
    for trial in range(1, trials + 1):
        if time.monotonic() > deadline:
            break
        identifier = create_device(trial, app)
        try:
            # Alternating the order keeps a first-open effect from landing on one style only.
            for style, open_id in (STYLES if trial % 2 else STYLES[::-1]):
                if time.monotonic() > deadline:
                    break
                run_case(tool, identifier, trial, style, open_id, results)
        finally:
            delete_device(identifier)
    summary = summarize(results)
    (root / "artifacts/picker-probe-summary.json").write_text(json.dumps({"trials": trials, "styles": summary}, indent=2))
    journeys.publish(results)
    return all(result["passed"] for result in results) and bool(results)


def cleanup():
    for identifier in owned_devices():
        delete_device(identifier)


if __name__ == "__main__":
    mode = sys.argv[1:]
    if mode == ["build"]:
        build()
    elif mode == ["run"]:
        sys.exit(0 if probe() else 1)
    elif mode == ["cleanup"]:
        cleanup()
    else:
        raise SystemExit("Usage: picker_probe.py build|run|cleanup")
