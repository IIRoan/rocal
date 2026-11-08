import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

from common import APPS, REPO, directory
from reader_timings import CONVERSATION_JOURNEYS, collect_reader_timings


def maestro_environment():
    maestro_home = directory() / "private/maestro-home"
    maestro_home.mkdir(exist_ok=True)
    options = os.environ.get("JAVA_TOOL_OPTIONS", "")
    return {**os.environ, "MAESTRO_CLI_NO_ANALYTICS": "1", "JAVA_TOOL_OPTIONS": f'{options} -Duser.home="{maestro_home}"'.strip()}


def agenda_anchor_date(fixture_path):
    return (datetime.fromtimestamp(fixture_path.stat().st_mtime, timezone.utc) - timedelta(days=7)).date()


def agenda_anchor_label(fixture_path):
    anchor = agenda_anchor_date(fixture_path)
    return f"{anchor.strftime('%B')} {anchor.day}, {anchor.year}"


def failure_content(log, report=None):
    content = log.read_text(errors="replace")[-32768:]
    if report and report.is_file():
        try:
            for failure in ET.parse(report).getroot().iter():
                if failure.tag in ("failure", "error"):
                    content = (failure.get("type", "") + " " + failure.get("message", "") + " " + (failure.text or ""))[-32768:] + "\n" + content
        except (OSError, ET.ParseError):
            pass
    return content


def failure_kind(log, report=None):
    content = failure_content(log, report)
    if any(marker in content for marker in ("AppCrash", "AppCrashed")):
        return "app-crash"
    if any(marker in content for marker in ("TimeoutException", "DEADLINE_EXCEEDED", "OperationTimeout")):
        return "driver-timeout"
    if any(marker in content for marker in ("Connection refused", "Failed to connect to", "UNAVAILABLE: io exception", "DeviceServerDiedException")):
        return "driver-connection"
    if "Assertion is false" in content:
        return "assertion"
    if any(marker in content for marker in ("Element not found", "No visible element found")):
        return "selector"
    return "maestro-failure"


def failure_details(log, report, traces, reason, exit_code=None):
    exception = re.search(r"\b((?:maestro|java|javax|io|org|com|kotlin)\.(?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$][\w$]*(?:Exception|Error))\b", failure_content(log, report))
    details = {"reason": reason, "exceptionType": exception.group(1)[:200] if exception else None, "command": None, "step": None, "assertionTarget": None, "exitCode": exit_code}
    commands = {"launchApp", "clearState", "tapOnElement", "inputText", "eraseText", "pressKey", "assertCondition", "scrollUntilVisible",
                "waitForAnimation", "runFlow", "takeScreenshot", "swipe", "hideKeyboard", "evalScript"}
    if traces.is_symlink():
        return details
    for source in sorted(traces.rglob("commands.json")):
        if source.is_symlink() or not source.resolve().is_relative_to(traces.resolve()):
            continue
        try:
            if source.stat().st_size > 8 * 1024 * 1024:
                continue
            entries = json.loads(source.read_text())
        except (OSError, ValueError):
            continue
        if not isinstance(entries, list):
            continue
        for step, entry in enumerate(entries, start=1):
            if not isinstance(entry, dict) or not isinstance(entry.get("metadata"), dict) or entry["metadata"].get("status") != "FAILED":
                continue
            command = entry.get("command", {})
            if isinstance(command, dict):
                kinds = (kind.removesuffix("Command") for kind in command)
                kind = next((kind for kind in kinds if kind in commands), None)
                if kind is None:
                    continue
                details["command"] = kind
                details["step"] = step
                details["assertionTarget"] = None
                assertion = command.get("assertConditionCommand", command.get("assertCondition"))
                if kind == "assertCondition" and isinstance(assertion, dict):
                    encoded = json.dumps(assertion)
                    for selector, target in (("(q|Q)", "software-keyboard"), ("sign-in-email", "sign-in-email"), ("Welcome back", "sign-in-screen")):
                        if selector in encoded:
                            details["assertionTarget"] = target
                            break
    return details


def capture_failure_screenshot(platform, device, name):
    root = directory()
    target = root / f"artifacts/screenshots/native/{name}.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        with (root / f"private/{name}-native-screenshot.log").open("wb") as log:
            if platform == "ios":
                completed = subprocess.run(["xcrun", "simctl", "io", device["id"], "screenshot", "--type=png", str(target)],
                                           check=False, timeout=15, stdout=subprocess.DEVNULL, stderr=log)
            else:
                sdk = os.environ.get("ANDROID_HOME", os.environ.get("ANDROID_SDK_ROOT"))
                adb = str(Path(sdk) / "platform-tools/adb") if sdk else "adb"
                with target.open("wb") as screenshot:
                    completed = subprocess.run([adb, "-s", device["id"], "exec-out", "screencap", "-p"],
                                               check=False, timeout=15, stdout=screenshot, stderr=log)
        if completed.returncode != 0:
            target.unlink(missing_ok=True)
            print(f"Native failure screenshot unavailable: {name}", flush=True)
    except (OSError, subprocess.TimeoutExpired):
        target.unlink(missing_ok=True)
        print(f"Native failure screenshot unavailable: {name}", flush=True)


def sanitized_hierarchy(node, fixture, hidden=False):
    attributes = node.get("attributes", {})
    if not isinstance(attributes, dict):
        attributes = {}
    identifier = str(attributes.get("resource-id", "")).lower()
    hidden = hidden or "password" in identifier or attributes.get("password") in (True, "true")
    hidden = hidden or "securetext" in f'{attributes.get("class", "")} {attributes.get("className", "")}'.lower()
    names = ("resource-id", "bounds", "class", "className") if hidden else (
        "resource-id", "bounds", "class", "className", "text", "title", "accessibilityText", "hintText", "value",
    )
    exported = {}
    for key in names:
        value = attributes.get(key)
        if not isinstance(value, str):
            continue
        for secret in fixture.values():
            if isinstance(secret, str) and secret:
                value = value.replace(secret, "[redacted]")
        exported[key] = value[:512]
    result = {"attributes": exported}
    for key in ("checked", "selected", "enabled", "focused", "clickable"):
        if isinstance(node.get(key), bool):
            result[key] = node[key]
    children = node.get("children", [])
    if isinstance(children, list):
        result["children"] = [sanitized_hierarchy(child, fixture, hidden) for child in children if isinstance(child, dict)]
    return result


def capture_failure_hierarchy(tool, device, fixture, name):
    root = directory()
    source = root / f"private/{name}-hierarchy.json"
    try:
        with source.open("wb") as output, (root / f"private/{name}-hierarchy.log").open("wb") as log:
            completed = subprocess.run([tool, "--device", device["id"], "hierarchy", "--no-reinstall-driver", "--no-ansi"],
                                       cwd=REPO, env=maestro_environment(), check=False, timeout=60, stdout=output, stderr=log)
        if completed.returncode != 0:
            return
        tree = json.loads(source.read_text())
        if not isinstance(tree, dict):
            return
        target = root / "artifacts/hierarchy"
        target.mkdir(exist_ok=True)
        (target / f"{name}.json").write_text(json.dumps(sanitized_hierarchy(tree, fixture), indent=2))
    except (OSError, ValueError, subprocess.TimeoutExpired):
        print(f"Failure hierarchy unavailable: {name}", flush=True)


def publish(results, summary=False):
    root = directory()
    artifacts = root / "artifacts"
    cases = ET.Element("testsuite", name="Native user journeys", tests=str(len(results)), failures=str(sum(not result["passed"] for result in results)))
    for result in results:
        case = ET.SubElement(cases, "testcase", classname=result["app"], name=result["name"], time=str(result["seconds"]))
        if not result["passed"]:
            ET.SubElement(case, "failure", message=f"Journey failed ({result.get('reason', 'maestro-failure')}); inspect screenshots and hierarchy")
    ET.ElementTree(cases).write(artifacts / "junit.xml", encoding="utf-8", xml_declaration=True)
    (artifacts / "results.json").write_text(json.dumps({"results": results}, indent=2))
    raw = root / "private/maestro"
    if raw.exists() and not raw.is_symlink() and raw.resolve().is_relative_to((root / "private").resolve()):
        for source in raw.rglob("*.png"):
            if source.is_symlink() or not source.is_file() or not source.resolve().is_relative_to(raw.resolve()):
                continue
            target = artifacts / "screenshots" / source.relative_to(raw)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
    table = "| App | Journey | Result |\n| --- | --- | --- |\n" + "\n".join(f"| {result['app']} | {result['name']} | {'PASS' if result['passed'] else 'FAIL'} |" for result in results)
    (artifacts / "summary.md").write_text(table + "\n")
    if summary and os.environ.get("GITHUB_STEP_SUMMARY"):
        Path(os.environ["GITHUB_STEP_SUMMARY"]).write_text(table + "\n")


def run_journey(platform, app, flow, results, name=None):
    root = directory()
    device = json.loads((root / "private/device.json").read_text())
    fixture = json.loads((root / "private/fixture.json").read_text())
    tool = (root / "private/maestro-path").read_text()
    home = "Create new event" if app == "calendar" else "Compose message"
    name = name or flow.stem
    started = time.monotonic()
    screenshots = root / f"private/maestro/{app}-{name}"
    screenshots.mkdir(parents=True, exist_ok=True)
    command = [tool, "--device", device["id"], "test", "--format", "JUNIT",
               "--output", str(root / f"private/{app}-{name}.xml"),
               "--test-output-dir", str(root / f"private/maestro/{app}-{name}"),
               "--env", f"APP_ID=onl.solace.{app}.e2e", "--env", f"HOME_LABEL={home}",
               "--env", "SCREENSHOT_DIR=journey",
               "--env", f"AGENDA_DATE_LABEL={agenda_anchor_label(root / 'private/fixture.json')}",
               "--env", f"AGENDA_DATE_KEY={agenda_anchor_date(root / 'private/fixture.json').isoformat()}",
               "--env", f"EMAIL={fixture['email']}", "--env", f"PASSWORD={fixture['password']}", str(flow)]
    for key, variable in (("peerEmail", "PEER_EMAIL"), ("peerPassword", "PEER_PASSWORD")):
        if key in fixture:
            command[-1:-1] = ["--env", f"{variable}={fixture[key]}"]
    if results and platform == "android":
        command.insert(4, "--no-reinstall-driver")
    print(f"Running {platform}: {app}/{name}", flush=True)
    reason = None
    exit_code = None
    try:
        with (root / f"private/{app}-{name}.log").open("wb") as log:
            completed = subprocess.run(command, cwd=REPO, env=maestro_environment(), check=False, timeout=1200 if platform == "ios" else 600, stdout=log, stderr=subprocess.STDOUT)
        passed = completed.returncode == 0
        exit_code = completed.returncode
        if not passed:
            reason = failure_kind(root / f"private/{app}-{name}.log", root / f"private/{app}-{name}.xml")
    except subprocess.TimeoutExpired:
        passed = False
        reason = "journey-timeout"
    if app == "mail" and name in CONVERSATION_JOURNEYS:
        timings = collect_reader_timings(screenshots)
        target = root / "artifacts/reader-timings"
        target.mkdir(exist_ok=True)
        (target / f"{name}.json").write_text(json.dumps({"openings": timings}, indent=2))
        if passed and not timings:
            passed = False
            reason = "missing-reader-timings"
    if not passed:
        failures = root / "artifacts/failures"
        failures.mkdir(exist_ok=True)
        details = failure_details(root / f"private/{app}-{name}.log", root / f"private/{app}-{name}.xml", screenshots, reason, exit_code)
        (failures / f"{app}-{name}.json").write_text(json.dumps(details, indent=2))
        capture_failure_screenshot(platform, device, f"{app}-{name}")
        capture_failure_hierarchy(tool, device, fixture, f"{app}-{name}")
    status = "PASS" if passed else f"FAIL ({reason})"
    print(f"{status}: {app}/{name}; inspect the journey report and screenshots", flush=True)
    results.append({"app": app, "name": name, "passed": passed, "seconds": round(time.monotonic() - started, 2), "reason": reason})
    publish(results)
    return passed


def main(platform, diagnostic=False):
    results = []
    scenarios = REPO / "e2e/native"
    if diagnostic:
        if platform != "ios":
            raise SystemExit("The focused diagnostic supports iOS only")
        for name in ("01-authentication", "07-profile-picture"):
            if not run_journey(platform, "calendar", scenarios / f"calendar/{name}.yaml", results):
                raise SystemExit("The focused iOS diagnostic failed")
        publish(results)
        return
    for app in APPS:
        flows = sorted(path for path in (scenarios / app).glob("*.yaml")
                       if path.name not in ("offline.yaml", "sign-out.yaml") and path.stem not in CONVERSATION_JOURNEYS)
        if not flows:
            raise RuntimeError(f"No {app} user journeys found")
        for index, flow in enumerate(flows):
            passed = run_journey(platform, app, flow, results)
            if index == 0 and not passed:
                raise SystemExit(f"The {app} authentication/content prerequisite failed")
    if all(result["passed"] for result in results if result["app"] == "mail"):
        backend = int((directory() / "private/backend.pid").read_text())
        command = subprocess.run(["ps", "-p", str(backend), "-o", "args="], text=True, capture_output=True, check=True).stdout
        if backend <= 1 or "xtask e2e serve" not in command:
            raise RuntimeError("Refusing to suspend a process outside the disposable backend")
        os.kill(backend, signal.SIGSTOP)
        try:
            offline_passed = run_journey(platform, "mail", scenarios / "mail/offline.yaml", results)
        finally:
            os.kill(backend, signal.SIGCONT)
        if not offline_passed:
            raise SystemExit("The mail offline-read prerequisite failed")
        subprocess.run([sys.executable, REPO / "scripts/e2e/services.py", "wait-api"], check=True)
        if not run_journey(platform, "mail", scenarios / "common/online-recovery.yaml", results, name="online-recovery"):
            raise SystemExit("The mail online-recovery prerequisite failed")
    else:
        raise SystemExit("The mail content prerequisites failed")
    for flow in sorted((scenarios / "mail").glob("*.yaml")):
        if flow.stem in CONVERSATION_JOURNEYS:
            if not run_journey(platform, "mail", flow, results):
                raise SystemExit("The mail conversation prerequisite failed")
    run_journey(platform, "mail", scenarios / "mail/sign-out.yaml", results)
    publish(results)
    expected = sum(len(list((scenarios / app).glob("*.yaml"))) for app in APPS) + 1
    if len(results) != expected or not all(result["passed"] for result in results):
        raise SystemExit("Native end-to-end journeys failed or required scenarios did not run")


if __name__ == "__main__":
    if sys.argv[1] == "collect":
        saved = directory() / "artifacts/results.json"
        results = json.loads(saved.read_text())["results"] if saved.exists() else [
            {"app": "setup", "name": "setup-did-not-complete", "passed": False, "seconds": 0},
        ]
        publish(results, summary=True)
    else:
        if sys.argv[2:] not in ([], ["--diagnostic"]):
            raise SystemExit("Unknown journey arguments")
        main(sys.argv[1], diagnostic=sys.argv[2:] == ["--diagnostic"])
