import argparse
import base64
import contextlib
import email
import email.policy
import json
from pathlib import Path
import secrets
import subprocess
import time
import urllib.parse
import urllib.request


SUBJECT = "calm morning river zivhltjjiztavuxvdhhhncfflylqx"
MARKER = SUBJECT.split()[-1]
PASSWORD = "solace-test-subject-probe"
FIXTURE = Path(__file__).resolve().parents[3] / "packages/calendar-core/test-fixtures/stalwart-1.1.0-mail/ecc-rfc3156-import.eml"
CAPABILITIES = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"]


def podman(*arguments):
    result = subprocess.run(["podman", *arguments], capture_output=True, text=True, timeout=90)
    if result.returncode:
        raise RuntimeError("Disposable container command failed")
    return result.stdout.strip()


def wait_until(check):
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        try:
            return check()
        except (RuntimeError, OSError, json.JSONDecodeError):
            time.sleep(0.2)
    raise RuntimeError("Disposable target did not become ready")


@contextlib.contextmanager
def target():
    name = "solace-subject-probe-" + secrets.token_hex(6)
    network = name + "-network"
    database = name + "-pg"
    server = name + "-mail"
    created = []
    network_created = False
    try:
        podman("network", "create", "--internal", network)
        network_created = True
        podman("run", "-d", "--pull=never", "--name", database, "--network", network,
               "--memory", "512m", "-e", "POSTGRES_USER=solace_probe",
               "-e", "POSTGRES_PASSWORD=" + PASSWORD, "-e", "POSTGRES_DB=stalwart_probe",
               "docker.io/library/postgres:18")
        created.append(database)
        wait_until(lambda: podman("exec", database, "pg_isready", "-U", "solace_probe", "-d", "stalwart_probe"))
        podman("run", "-d", "--pull=never", "--name", server, "--network", network,
               "--memory", "1g", "-p", "127.0.0.1::8080",
               "-e", "PGHOST=" + database, "-e", "PGDATABASE=stalwart_probe", "-e", "PGUSER=solace_probe",
               "-e", "PGPASSWORD=" + PASSWORD, "-e", "SOLACE_TEST_ADMIN_PASSWORD=" + PASSWORD,
               "-e", "SOLACE_TEST_PROVISIONER_PASSWORD=" + PASSWORD, "-e", "SOLACE_TEST_NOREPLY_PASSWORD=" + PASSWORD,
               "localhost/solace-test-stalwart")
        created.append(server)
        details = json.loads(podman("inspect", server))[0]
        bindings = details["NetworkSettings"]["Ports"]["8080/tcp"]
        if len(bindings) != 1 or bindings[0]["HostIp"] != "127.0.0.1":
            raise RuntimeError("Refusing a target without an exclusive loopback binding")
        yield "http://127.0.0.1:" + bindings[0]["HostPort"], database, server
    finally:
        failures = []
        for container in reversed(created):
            try:
                podman("rm", "-f", container)
            except RuntimeError:
                failures.append("container")
        if network_created:
            try:
                podman("network", "rm", network)
            except RuntimeError:
                failures.append("network")
        if failures:
            raise RuntimeError("Disposable target cleanup failed")


class Probe:
    def __init__(self, base):
        self.base = base
        credentials = ("noreply@solace.test:" + PASSWORD).encode()
        self.headers = {"Authorization": "Basic " + base64.b64encode(credentials).decode()}

    def request(self, path, data=None, content_type="application/json"):
        request = urllib.request.Request(self.base + path, data=data,
                                         headers={**self.headers, "Content-Type": content_type})
        with urllib.request.urlopen(request, timeout=3) as response:
            return json.load(response)

    def call(self, method, arguments):
        body = json.dumps({"using": CAPABILITIES, "methodCalls": [[method, arguments, "probe"]]}).encode()
        result = self.request("/jmap/", body)
        name, response, _ = result["methodResponses"][0]
        if name != method:
            raise RuntimeError("Synthetic JMAP method refused")
        return response

    def run(self, database, server):
        session = wait_until(lambda: self.request("/jmap/session"))
        account = session["primaryAccounts"]["urn:ietf:params:jmap:mail"]
        mailboxes = self.call("Mailbox/get", {"accountId": account})["list"]
        drafts = next(mailbox["id"] for mailbox in mailboxes if mailbox.get("role") == "drafts")
        message = email.message_from_bytes(FIXTURE.read_bytes(), policy=email.policy.SMTP)
        message.replace_header("Subject", SUBJECT)
        upload_path = urllib.parse.urlsplit(session["uploadUrl"].replace("{accountId}", account)).path
        if not upload_path.startswith("/jmap/upload/"):
            raise RuntimeError("Unexpected disposable upload path")
        uploaded = self.request(upload_path, message.as_bytes(), "message/rfc822")
        result = self.call("Email/import", {"accountId": account, "emails": {"probe": {
            "blobId": uploaded["blobId"], "mailboxIds": {drafts: True}, "keywords": {"$draft": True},
        }}})
        identifier = result.get("created", {}).get("probe", {}).get("id")
        if not identifier:
            raise RuntimeError("Synthetic draft import refused")
        try:
            def matches(text):
                result = self.call("Email/query", {"accountId": account,
                    "filter": {"subject": text, "inMailbox": drafts}, "limit": 100})
                return identifier in result["ids"]

            def indexed():
                if not matches(MARKER):
                    raise RuntimeError("Synthetic draft has not entered the index")

            wait_until(indexed)
            queries = {name: matches(text) for name, text in {
                "calm": "calm", "morning": "morning", "river": "river", "marker": MARKER, "fullSubject": SUBJECT,
            }.items()}
            sql = """SELECT json_build_object(
                'storedSubject', subj::text,
                'matchesNorwegianVector', subj = to_tsvector('norwegian', 'calm morning river zivhltjjiztavuxvdhhhncfflylqx'),
                'englishRiverMatches', subj @@ plainto_tsquery('english', 'river'),
                'simpleRiverMatches', subj @@ plainto_tsquery('simple', 'river'),
                'norwegianRiverMatches', subj @@ plainto_tsquery('norwegian', 'river'))
                FROM s_email WHERE subj @@ plainto_tsquery('simple', 'zivhltjjiztavuxvdhhhncfflylqx')"""
            index = json.loads(podman("exec", database, "psql", "-U", "solace_probe", "-d", "stalwart_probe", "-Atc", sql))
            return {
                "stalwart": podman("exec", server, "/usr/local/bin/stalwart", "--version"),
                "queries": queries,
                "index": index,
                "reproduced": queries == {"calm": True, "morning": True, "river": False, "marker": True, "fullSubject": False},
            }
        finally:
            removed = self.call("Email/set", {"accountId": account, "destroy": [identifier]})
            if identifier not in removed.get("destroyed", []):
                raise RuntimeError("Synthetic draft cleanup refused")


def main():
    parser = argparse.ArgumentParser(description="Probe subject indexing on fresh, outbound-isolated PostgreSQL/Stalwart containers.")
    parser.add_argument("--assert-fixed", action="store_true", help="Fail unless every synthetic subject query finds the draft.")
    arguments = parser.parse_args()
    with target() as (base, database, server):
        report = Probe(base).run(database, server)
    print(json.dumps(report, indent=2))
    return 1 if arguments.assert_fixed and not all(report["queries"].values()) else 0


if __name__ == "__main__":
    raise SystemExit(main())
