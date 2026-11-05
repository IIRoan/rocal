import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import tarfile
import time
import urllib.error
import urllib.request
import zipfile

REPO = Path(__file__).resolve().parents[2]
APPS = ("calendar", "mail")


def directory():
    value = os.environ.get("SOLACE_E2E_DIR", "")
    path = Path(value).resolve()
    if os.environ.get("SOLACE_E2E") != "1" or not value or path.name != "solace-e2e":
        raise RuntimeError("Set SOLACE_E2E=1 and SOLACE_E2E_DIR to an isolated solace-e2e directory")
    path.mkdir(parents=True, exist_ok=True)
    (path / "private").mkdir(mode=0o700, exist_ok=True)
    (path / "private").chmod(0o700)
    (path / "artifacts").mkdir(exist_ok=True)
    return path


def run(command, **options):
    options.setdefault("cwd", REPO)
    return subprocess.run([str(part) for part in command], check=True, **options)


def output(command):
    return run(command, text=True, stdout=subprocess.PIPE).stdout.strip()


def download(name):
    specification = json.loads((REPO / "scripts/e2e/tools.json").read_text())[name]
    tools = directory() / "private/tools"
    tools.mkdir(parents=True, exist_ok=True)
    target = tools / Path(specification["url"]).name
    if not target.exists():
        with urllib.request.urlopen(specification["url"], timeout=120) as source, target.open("wb") as destination:
            while block := source.read(1024 * 1024):
                destination.write(block)
    with target.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
    if digest != specification["sha256"]:
        target.unlink()
        raise RuntimeError(f"Checksum mismatch for {name}")
    return target


def unpack(name, executable):
    archive = download(name)
    destination = archive.parent / name
    destination.mkdir(exist_ok=True)
    if zipfile.is_zipfile(archive):
        with zipfile.ZipFile(archive) as bundle:
            for member in bundle.infolist():
                if not (destination / member.filename).resolve().is_relative_to(destination.resolve()):
                    raise RuntimeError("Unsafe tool archive path")
            bundle.extractall(destination)
            for member in bundle.infolist():
                if not member.is_dir():
                    (destination / member.filename).chmod((member.external_attr >> 16) & 0o755 or 0o644)
    else:
        with tarfile.open(archive) as bundle:
            bundle.extractall(destination, filter="data")
    matches = [path for path in destination.rglob(executable) if path.is_file()]
    if len(matches) != 1:
        raise RuntimeError(f"Could not locate {executable}")
    matches[0].chmod(0o755)
    return matches[0]


def spawn(name, command, environment=None):
    private = directory() / "private"
    with (private / f"{name}.log").open("ab") as log:
        process = subprocess.Popen([str(part) for part in command], cwd=REPO,
                                   env=environment, stdout=log, stderr=log,
                                   start_new_session=True)
    (private / f"{name}.process.json").write_text(json.dumps({"pid": process.pid, "command": [str(p) for p in command]}))
    return process


def stop(name):
    manifest = directory() / f"private/{name}.process.json"
    if not manifest.exists():
        return
    recorded = json.loads(manifest.read_text())
    pid = recorded["pid"]
    result = subprocess.run(["ps", "-p", str(pid), "-o", "args="], text=True, capture_output=True, check=False)
    if pid > 1 and all(argument in result.stdout for argument in recorded["command"]):
        os.killpg(pid, signal.SIGTERM)
        for _ in range(30):
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                break
            time.sleep(0.2)
    manifest.unlink()


def wait_url(url, headers=None, seconds=120):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), timeout=3) as response:
                if response.status == 200:
                    return
        except (urllib.error.URLError, TimeoutError):
            pass
        time.sleep(1)
    raise RuntimeError(f"Local test service did not become ready: {url}")
