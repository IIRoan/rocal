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

from common import APPS, REPO, backend_pid, directory

CALENDAR_START = ("01-authentication", "02-calendar-management")
CONVERSATION_JOURNEYS = frozenset(("07-conversation-first-message", "08-conversation-replies", "09-conversation-reader"))


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
    if "AppCrash" in content:
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


def trace_entries(traces):
    if traces.is_symlink():
        return
    for source in sorted(traces.rglob("commands.json")):
        if source.is_symlink() or not source.resolve().is_relative_to(traces.resolve()):
            continue
        try:
            entries = json.loads(source.read_text()) if source.stat().st_size <= 8 * 1024 * 1024 else None
        except (OSError, ValueError):
            continue
        if isinstance(entries, list):
            yield entries


def collect_reader_timings(traces):
    measurements = []
    observed = set()
    for entries in trace_entries(traces):
        tap = None
        for entry in entries:
            try:
                metadata = entry["metadata"]
                timestamp, duration = metadata["timestamp"], metadata["duration"]
                if metadata["status"] != "COMPLETED" or type(timestamp) is not int or type(duration) is not int or timestamp <= 0 or not 0 <= duration <= 1_200_000:
                    continue
                command = metadata.get("evaluatedCommand", entry.get("command", {}))
                if "tapOnElement" in command.keys():
                    tap = timestamp
                assertion = command["assertConditionCommand"]
                budget = assertion.get("timeout")
                if assertion["condition"]["visible"]["idRegex"] != "mail-message-text" or budget not in ("5000", "10000") or tap is None:
                    continue
            except (AttributeError, KeyError, TypeError):
                continue
            opening = timestamp + duration - tap
            if not 0 <= opening <= 1_200_000 or (timestamp, duration) in observed:
                continue
            observed.add((timestamp, duration))
            measurements.append({"opening": len(measurements) + 1, "tapToBodyMs": opening, "bodyAssertionMs": duration, "bodyWaitBudgetMs": int(budget)})
    return measurements


def failure_details(log, report, traces, reason, exit_code=None):
    exception = re.search(r"\b((?:maestro|java|javax|io|org|com|kotlin)\.(?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$][\w$]*(?:Exception|Error))\b", failure_content(log, report))
    details = {"reason": reason, "exceptionType": exception.group(1)[:200] if exception else None, "command": None, "step": None, "assertionTarget": None, "exitCode": exit_code}
    commands = {"launchApp", "clearState", "tapOnElement", "inputText", "eraseText", "pressKey", "assertCondition", "scrollUntilVisible",
                "waitForAnimation", "runFlow", "takeScreenshot", "swipe", "hideKeyboard", "evalScript"}
    for entries in trace_entries(traces):
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


def run_journey(platform, app, flow, results):
    root = directory()
    device = json.loads((root / "private/device.json").read_text())
    fixture = json.loads((root / "private/fixture.json").read_text())
    tool = (root / "private/maestro-path").read_text()
    home = "Create new event" if app == "calendar" else "Compose message"
    name = flow.stem
    started = time.monotonic()
    screenshots = root / f"private/maestro/{app}-{name}"
    screenshots.mkdir(parents=True, exist_ok=True)
    command = [tool, "--device", device["id"], "test", "--format", "JUNIT",
               "--output", str(root / f"private/{app}-{name}.xml"),
               "--test-output-dir", str(screenshots),
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


def run_calendar_start(platform):
    results = []
    for index, name in enumerate(CALENDAR_START):
        passed = run_journey(platform, "calendar", REPO / f"e2e/native/calendar/{name}.yaml", results)
        if index == 0 and not passed:
            raise SystemExit("The calendar authentication prerequisite failed")
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with Path(output).open("a") as destination:
            destination.write("ready=true\n")
    if not all(result["passed"] for result in results):
        raise SystemExit("The calendar management journey failed")


def calendar_checkpoint():
    try:
        results = json.loads((directory() / "artifacts/results.json").read_text())["results"]
        valid = [(result["app"], result["name"], type(result["passed"])) for result in results] == [("calendar", name, bool) for name in CALENDAR_START]
    except (OSError, ValueError, LookupError, TypeError):
        valid = False
    if not valid:
        raise SystemExit("The calendar checkpoint is missing, incomplete or invalid")
    if results[0]["passed"] is not True:
        raise SystemExit("The calendar authentication prerequisite failed")
    return results


def run_mail_tail(platform, scenarios, results):
    if not all(result["passed"] for result in results if result["app"] == "mail"):
        raise SystemExit("The mail content prerequisites failed")
    backend = backend_pid()
    if backend is None:
        raise RuntimeError("Refusing to suspend a process outside the disposable backend")
    os.kill(backend, signal.SIGSTOP)
    try:
        offline_passed = run_journey(platform, "mail", scenarios / "mail/offline.yaml", results)
    finally:
        os.kill(backend, signal.SIGCONT)
    if not offline_passed:
        raise SystemExit("The mail offline-read prerequisite failed")
    subprocess.run([sys.executable, REPO / "scripts/e2e/services.py", "wait-api"], check=True)
    if not run_journey(platform, "mail", scenarios / "common/online-recovery.yaml", results):
        raise SystemExit("The mail online-recovery prerequisite failed")
    for flow in sorted((scenarios / "mail").glob("*.yaml")):
        if flow.stem in CONVERSATION_JOURNEYS and not run_journey(platform, "mail", flow, results):
            raise SystemExit("The mail conversation prerequisite failed")
    run_journey(platform, "mail", scenarios / "mail/sign-out.yaml", results)


def main(platform, diagnostic=False, resume=False):
    apps = (os.environ["E2E_APP"],) if os.environ.get("E2E_APP") else APPS
    if not set(apps) <= set(APPS):
        raise SystemExit("E2E_APP must be calendar or mail")
    results = calendar_checkpoint() if resume else []
    scenarios = REPO / "e2e/native"
    if diagnostic:
        if platform != "ios":
            raise SystemExit("The focused diagnostic supports iOS only")
        for name in (*CALENDAR_START, "07-profile-picture"):
            if not run_journey(platform, "calendar", scenarios / f"calendar/{name}.yaml", results):
                raise SystemExit("The focused iOS diagnostic failed")
        publish(results)
        return
    # Mail unlocks the account Calendar sets up, so a Mail-only run signs in through Calendar first.
    if apps == ("mail",) and not run_journey(platform, "calendar", scenarios / "calendar/01-authentication.yaml", results):
        raise SystemExit("The calendar authentication prerequisite failed")
    for app in apps:
        flows = sorted(path for path in (scenarios / app).glob("*.yaml")
                       if path.name not in ("offline.yaml", "sign-out.yaml") and path.stem not in CONVERSATION_JOURNEYS
                       and not (resume and app == "calendar" and path.stem in CALENDAR_START))
        if not flows:
            raise RuntimeError(f"No {app} user journeys found")
        for index, flow in enumerate(flows):
            passed = run_journey(platform, app, flow, results)
            if index == 0 and not passed:
                raise SystemExit(f"The {app} authentication/content prerequisite failed")
    if "mail" in apps:
        run_mail_tail(platform, scenarios, results)
    publish(results)
    expected = sum(len(list((scenarios / app).glob("*.yaml"))) for app in apps) + ("mail" in apps) + (apps == ("mail",))
    if len(results) != expected or not all(result["passed"] for result in results):
        raise SystemExit("Native end-to-end journeys failed or required scenarios did not run")


if __name__ == "__main__":
    if sys.argv[1] == "collect":
        saved = directory() / "artifacts/results.json"
        results = json.loads(saved.read_text())["results"] if saved.exists() else [
            {"app": "setup", "name": "setup-did-not-complete", "passed": False, "seconds": 0},
        ]
        publish(results, summary=True)
    elif (mode := {(): main, ("--calendar-start",): run_calendar_start, ("--diagnostic",): lambda platform: main(platform, diagnostic=True),
                   ("--continue",): lambda platform: main(platform, resume=True)}.get(tuple(sys.argv[2:]))) is None:
        raise SystemExit("Unknown journey arguments")
    else:
        mode(sys.argv[1])
