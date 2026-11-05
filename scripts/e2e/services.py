import base64
import json
import os
from pathlib import Path
import platform
import signal
import subprocess
import sys
import urllib.request

from common import REPO, directory, download, output, run, spawn, stop, unpack, wait_url

STALWART = "http://127.0.0.1:58080"
ADMIN = "solace-test-admin-local"


def jmap(methods):
    payload = json.dumps({"using": ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"], "methodCalls": methods}).encode()
    request = urllib.request.Request(STALWART + "/jmap/", payload, {
        "Content-Type": "application/json",
        "Authorization": "Basic " + base64.b64encode(f"admin:{ADMIN}".encode()).decode(),
    })
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.load(response)


def start_macos():
    private = directory() / "private"
    pg = Path(output(["brew", "--prefix", "postgresql@18"])) / "bin"
    data = private / "postgres"
    password = private / "postgres-password"
    password.write_text("solace-test-pg")
    run([pg / "initdb", "-D", data, "-U", "solace_test", "--pwfile", password, "--auth-host=scram-sha-256", "--auth-local=trust"], stdout=subprocess.DEVNULL)
    run([pg / "pg_ctl", "-D", data, "-l", private / "postgres.log", "-o", f"-h 127.0.0.1 -p 55432 -k {private}", "-w", "start"], stdout=subprocess.DEVNULL)
    run([pg / "createdb", "-h", "127.0.0.1", "-p", "55432", "-U", "solace_test", "solace_test"], env={**os.environ, "PGPASSWORD": "solace-test-pg"})
    architecture = "arm64" if platform.machine() == "arm64" else "x86_64"
    binary = unpack("stalwart-" + architecture, "stalwart")
    cli = unpack("stalwart-cli-" + architecture, "stalwart-cli")
    start_stalwart(private, binary, cli)
    start_s3(private)


def start_s3(private, port=59000):
    s3_environment = {**os.environ, "COM_ADOBE_TESTING_S3MOCK_STORE_INITIAL_BUCKETS": "solace-test-avatars", "COM_ADOBE_TESTING_S3MOCK_STORE_ROOT": str(private / "avatars"), "SERVER_ADDRESS": "127.0.0.1"}
    spawn("s3", ["java", "-Xmx512m", "-jar", download("s3mock"), "--server.port=0", f"--com.adobe.testing.s3mock.http-port={port}"], s3_environment)
    wait_url(f"http://127.0.0.1:{port}/solace-test-avatars")


def start_stalwart(private, binary, cli):
    config = private / "stalwart.json"
    config.write_text(json.dumps({"@type": "RocksDb", "path": str(private / "mail-store")}))
    environment = {**os.environ, "STALWART_RECOVERY_ADMIN": f"admin:{ADMIN}", "STALWART_RECOVERY_MODE_PORT": STALWART.rsplit(":", 1)[1], "STALWART_RECOVERY_MODE": "1"}
    process = spawn("stalwart", [binary, "--config", config], environment)
    authorization = "Basic " + base64.b64encode(f"admin:{ADMIN}".encode()).decode()
    wait_url(STALWART + "/jmap/session", {"Authorization": authorization})
    if process.poll() is not None:
        raise RuntimeError("The isolated Stalwart process exited")
    network = {"@type": "reconcile", "object": "NetworkListener", "matchOn": ["name"], "value": {
        "e2e-http": {"name": "http", "protocol": "http", "bind": {STALWART.removeprefix("http://"): True}, "useTls": False, "implicitTls": False},
        "e2e-smtp": {"name": "smtp", "protocol": "smtp", "bind": {"127.0.0.1:2525": True}, "useTls": False, "implicitTls": False},
    }}
    plan_path = private / "mail-plan.ndjson"
    plan_path.write_text(json.dumps(network) + "\n")
    run([cli, "--url", STALWART, "--user", "admin", "--password", ADMIN, "apply", "--file", plan_path, "--quiet"])
    stop("stalwart")
    environment.pop("STALWART_RECOVERY_MODE")
    spawn("stalwart", [binary, "--config", config], environment)
    wait_url(STALWART + "/jmap/session", {"Authorization": authorization})
    roles = jmap([["x:Role/query", {}, "q"], ["x:Role/get", {"#ids": {"resultOf": "q", "name": "x:Role/query", "path": "/ids"}, "properties": ["id", "description"]}, "g"]])
    role = next(item["id"] for item in roles["methodResponses"][1][1]["list"] if item["description"] == "User")
    substitutions = {"SOLACE_TEST_USER_ROLE_ID": role, "SOLACE_TEST_PROVISIONER_PASSWORD": "solace-test-provisioner-local", "SOLACE_TEST_NOREPLY_PASSWORD": "solace-test-noreply-local"}
    plan = "\n".join((REPO / path).read_text() for path in ["apps/stalwart/stalwart/plan/16-provisioner-role.ndjson", "apps/stalwart/test-env/plan.ndjson"])
    for key, value in substitutions.items():
        plan = plan.replace("${" + key + "}", value)
    plan_path.write_text(plan + "\n")
    run([cli, "--url", STALWART, "--user", "admin", "--password", ADMIN, "apply", "--file", plan_path, "--quiet"])
    stop("stalwart")
    spawn("stalwart", [binary, "--config", config], environment)
    wait_url(STALWART + "/jmap/session", {"Authorization": authorization})


def cleanup():
    private = directory() / "private"
    backend = private / "backend.pid"
    if backend.exists():
        pid = int(backend.read_text())
        command = subprocess.run(["ps", "-p", str(pid), "-o", "args="], text=True, capture_output=True, check=False).stdout
        if pid > 1 and "xtask e2e serve" in command:
            os.kill(pid, signal.SIGCONT)
            os.kill(pid, signal.SIGTERM)
    for name in ["emulator", "s3", "stalwart"]:
        stop(name)
    device = private / "device.json"
    if platform.system() == "Darwin":
        if device.exists():
            identifier = json.loads(device.read_text())["id"]
            subprocess.run(["xcrun", "simctl", "shutdown", identifier], check=False, capture_output=True)
            subprocess.run(["xcrun", "simctl", "delete", identifier], check=False, capture_output=True)
        data = private / "postgres"
        if data.exists():
            pg = Path(output(["brew", "--prefix", "postgresql@18"])) / "bin"
            subprocess.run([pg / "pg_ctl", "-D", data, "-m", "fast", "stop"], check=False, capture_output=True)
    elif os.environ.get("GITHUB_ACTIONS") == "true":
        subprocess.run(["podman", "rm", "-f", "solace-test-pg", "solace-test-stalwart", "solace-test-s3"], check=False, capture_output=True)


if __name__ == "__main__":
    directory()
    command = sys.argv[1]
    if command == "start":
        if platform.system() == "Darwin":
            start_macos()
        else:
            run([REPO / "target/debug/xtask", "test-env", "up"])
    elif command == "wait-api":
        backend = int((directory() / "private/backend.pid").read_text())
        command_line = subprocess.run(["ps", "-p", str(backend), "-o", "args="], text=True, capture_output=True, check=True).stdout
        if "xtask e2e serve" not in command_line:
            raise RuntimeError("The disposable backend did not start")
        wait_url("http://127.0.0.1:4001/api/health")
    elif command == "stop":
        cleanup()
    else:
        raise RuntimeError("Choose start, wait-api or stop")
