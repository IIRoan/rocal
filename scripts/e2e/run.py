import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

from common import APPS, REPO, directory


def publish(results):
    root = directory()
    artifacts = root / "artifacts"
    cases = ET.Element("testsuite", name="Native user journeys", tests=str(len(results)), failures=str(sum(not result["passed"] for result in results)))
    for result in results:
        case = ET.SubElement(cases, "testcase", classname=result["app"], name=result["name"], time=str(result["seconds"]))
        if not result["passed"]:
            ET.SubElement(case, "failure", message="Maestro journey failed; inspect the job log and screenshots")
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
    summary = "| App | Journey | Result |\n| --- | --- | --- |\n" + "\n".join(f"| {result['app']} | {result['name']} | {'PASS' if result['passed'] else 'FAIL'} |" for result in results)
    (artifacts / "summary.md").write_text(summary + "\n")
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with Path(os.environ["GITHUB_STEP_SUMMARY"]).open("a") as destination:
            destination.write(summary + "\n")


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
               "--env", f"SCREENSHOT_DIR={screenshots}",
               "--env", f"EMAIL={fixture['email']}", "--env", f"PASSWORD={fixture['password']}", str(flow)]
    print(f"Running {platform}: {app}/{name}", flush=True)
    try:
        completed = subprocess.run(command, cwd=REPO, check=False, timeout=600)
        passed = completed.returncode == 0
    except subprocess.TimeoutExpired:
        passed = False
    results.append({"app": app, "name": name, "passed": passed, "seconds": round(time.monotonic() - started, 2)})
    publish(results)


def main(platform):
    results = []
    scenarios = REPO / "e2e/native"
    for app in APPS:
        flows = sorted(path for path in (scenarios / app).glob("*.yaml") if path.name not in ("offline.yaml", "sign-out.yaml"))
        if not flows:
            raise RuntimeError(f"No {app} user journeys found")
        for flow in flows:
            run_journey(platform, app, flow, results)
    if all(result["passed"] for result in results if result["app"] == "mail"):
        backend = int((directory() / "private/backend.pid").read_text())
        command = subprocess.run(["ps", "-p", str(backend), "-o", "args="], text=True, capture_output=True, check=True).stdout
        if backend <= 1 or "xtask e2e serve" not in command:
            raise RuntimeError("Refusing to suspend a process outside the disposable backend")
        os.kill(backend, signal.SIGSTOP)
        try:
            run_journey(platform, "mail", scenarios / "mail/offline.yaml", results)
        finally:
            os.kill(backend, signal.SIGCONT)
        run_journey(platform, "mail", scenarios / "mail/02-delivery-and-reader.yaml", results, name="online-recovery")
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
        publish(results)
    else:
        main(sys.argv[1])
