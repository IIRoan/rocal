import argparse
import base64
import hashlib
import email
import email.policy
import json
import os
import smtplib
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path


BASE = "http://127.0.0.1:58110"
CORPUS = Path(__file__).resolve().parents[3] / "packages/calendar-core/test-fixtures/stalwart-1.1.0-mail"
CAPABILITIES = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail", "urn:ietf:params:jmap:submission", "urn:stalwart:jmap"]


class TargetMailProbe:
    def __init__(self, record_import=False):
        self.record_import = record_import
        self.fixture = json.loads((CORPUS / "manifest.json").read_text())
        if self.fixture.get("syntheticOnly") is not True:
            raise RuntimeError("Only the committed synthetic corpus may be used")
        self.domain = self.fixture["domain"]
        if not self.domain.startswith("mime-probe-") or not self.domain.endswith(".solace.test"):
            raise RuntimeError("Refusing a non-synthetic domain")
        password = os.environ.get("STALWART_TEST_ADMIN_PASSWORD", "solace-test-admin-110")
        if password != "solace-test-admin-110":
            raise RuntimeError("Refusing a secret other than this disposable target's synthetic credential")
        authorization = base64.b64encode(("admin:" + password).encode()).decode()
        self.headers = {"Authorization": "Basic " + authorization, "Content-Type": "application/json"}
        self.domain_id = None
        self.accounts = {}

    def request(self, path, body=None, content_type="application/json"):
        data = json.dumps(body).encode() if isinstance(body, dict) else body
        request = urllib.request.Request(BASE + path, data=data, headers={**self.headers, "Content-Type": content_type})
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.read()

    def batch(self, calls):
        result = json.loads(self.request("/jmap/", {"using": CAPABILITIES, "methodCalls": calls}))
        for method, arguments, _ in result["methodResponses"]:
            if method == "error":
                raise RuntimeError("Target method refused: " + str(arguments.get("type")))
        return result["methodResponses"]

    def call(self, method, arguments):
        return self.batch([[method, arguments, "probe"]])[0][1]

    @staticmethod
    def created(result, name):
        created = result.get("created", {}).get(name)
        if not created or not created.get("id"):
            raise RuntimeError("Synthetic object creation refused: " + json.dumps(result.get("notCreated", {})))
        return created["id"]

    def setup(self):
        self.domain_id = self.created(self.call("x:Domain/set", {"create": {"domain": {"name": self.domain, "enable": True}}}), "domain")
        for key in self.fixture["keys"]:
            if key["name"] == "unrelated":
                continue
            account = self.created(self.call("x:Account/set", {"create": {"account": {
                "@type": "User", "name": key["name"], "domainId": self.domain_id,
                "roles": {"@type": "User"}, "permissions": {"@type": "Inherit"},
                "encryptionAtRest": {"@type": "Disabled"},
            }}}), "account")
            self.accounts[key["name"]] = account
            public_key = self.created(self.call("x:PublicKey/set", {"accountId": account, "create": {"key": {
                "key": key["publicKeyArmored"], "description": "SYNTHETIC MIME fixture probe",
            }}}), "key")
            enabled = self.call("x:AccountSettings/set", {"accountId": account, "update": {"singleton": {
                "encryptionAtRest": {"@type": "Enabled", "publicKey": public_key, "headerProtection": "none", "encryptOnAppend": False, "allowSpamTraining": False},
            }}})
            if "singleton" not in enabled.get("updated", {}):
                raise RuntimeError("Target account encryption was not acknowledged")

    def cleanup(self):
        for account in self.accounts.values():
            result = self.call("x:Account/set", {"destroy": [account]})
            if account not in result.get("destroyed", []):
                raise RuntimeError("Synthetic account cleanup refused")
        if self.domain_id:
            result = self.call("x:Domain/set", {"destroy": [self.domain_id]})
            linked = result.get("notDestroyed", {}).get(self.domain_id, {}).get("linkedObjects", [])
            for item in linked:
                if item.get("object") != "DkimSignature":
                    raise RuntimeError("Unknown synthetic domain dependency; refusing broad cleanup")
                removed = self.call("x:DkimSignature/set", {"destroy": [item["id"]]})
                if item["id"] not in removed.get("destroyed", []):
                    raise RuntimeError("Synthetic DKIM cleanup refused")
            if linked:
                result = self.call("x:Domain/set", {"destroy": [self.domain_id]})
            if self.domain_id not in result.get("destroyed", []):
                raise RuntimeError("Synthetic domain cleanup refused")

    def email_create(self, subject, body, body_values=None):
        return {"mailboxIds": {self.drafts: True}, "keywords": {"$draft": True},
                "from": [{"email": "sender@" + self.domain}], "to": [{"email": "ecc@" + self.domain}],
                "subject": subject, "bodyStructure": body, "bodyValues": body_values or {}}

    def send(self, creation_id, message):
        result = self.batch([
            ["Email/set", {"accountId": self.sender, "create": {creation_id: message}}, "create"],
            ["EmailSubmission/set", {"accountId": self.sender, "create": {"send": {
                "emailId": "#" + creation_id, "identityId": self.identity,
                "envelope": {"mailFrom": {"email": "sender@" + self.domain}, "rcptTo": [{"email": "ecc@" + self.domain}]},
            }}}, "submit"],
        ])
        self.created(result[0][1], creation_id)
        self.created(result[1][1], "send")

    def receive(self, owner, subject):
        account = self.accounts[owner]
        for _ in range(100):
            ids = self.call("Email/query", {"accountId": account, "filter": {"subject": subject}}).get("ids", [])
            if ids:
                result = self.call("Email/get", {"accountId": account, "ids": ids, "properties": ["id", "blobId", "subject", "bodyStructure", "hasAttachment"]})["list"][0]
                self.last_message = result
                self.last_raw = self.request(f"/jmap/download/{account}/{result['blobId']}/source.eml?accept=message/rfc822")
                return email.message_from_bytes(self.last_raw, policy=email.policy.default)
            time.sleep(0.1)
        raise RuntimeError("Synthetic delivery timed out")

    def import_rfc3156(self):
        cipher = (CORPUS / "source-client-ciphertext.asc").read_bytes().decode()
        boundary = "SYNTHETIC-RFC3156-BOUNDARY"
        raw = (
            f"From: sender@{self.domain}\r\nTo: ecc@{self.domain}\r\nBcc: sender@{self.domain}\r\n"
            f"Subject: SYNTHETIC proper RFC3156 import\r\nMessage-ID: <synthetic-rfc3156-import@{self.domain}>\r\n"
            f'MIME-Version: 1.0\r\nContent-Type: multipart/encrypted; protocol="application/pgp-encrypted"; boundary="{boundary}"\r\n'
            f"\r\n--{boundary}\r\nContent-Type: application/pgp-encrypted\r\n\r\nVersion: 1\r\n"
            f"\r\n--{boundary}\r\nContent-Type: application/octet-stream\r\nContent-Disposition: inline\r\n\r\n"
            f"{cipher}\r\n--{boundary}--\r\n"
        )
        uploaded = json.loads(self.request(f"/jmap/upload/{self.sender}/", raw.encode(), "message/rfc822"))
        result = self.batch([
            ["Email/import", {"accountId": self.sender, "emails": {"proper": {"blobId": uploaded["blobId"], "mailboxIds": {self.drafts: True}, "keywords": {"$draft": True}}}}, "import"],
            ["EmailSubmission/set", {"accountId": self.sender, "create": {"send": {"emailId": "#proper", "identityId": self.identity, "envelope": {"mailFrom": {"email": "sender@" + self.domain}, "rcptTo": [{"email": "ecc@" + self.domain}, {"email": "sender@" + self.domain}]}}}}, "submit"],
        ])
        self.created(result[0][1], "proper")
        self.created(result[1][1], "send")
        received = self.receive("ecc", "SYNTHETIC proper RFC3156 import")
        actual = received.get_payload()[1].get_payload(decode=True).decode()
        assert received.get_param("protocol") == "application/pgp-encrypted"
        assert actual.strip().replace("\r\n", "\n") == cipher.strip().replace("\r\n", "\n")
        assert received.get("Bcc") is None
        print("RFC3156 Email/import + submission: protocol preserved, exact cipher retained, Bcc stripped, hasAttachment=" + str(self.last_message.get("hasAttachment")))
        if self.record_import:
            (CORPUS / "ecc-rfc3156-import.eml").write_bytes(self.last_raw)
            (CORPUS / "ecc-rfc3156-import.asc").write_text(actual)
            (CORPUS / "source-rfc3156-import.eml").write_bytes(raw.encode())
            manifest = json.loads((CORPUS / "manifest.json").read_text())
            manifest["records"] = [record for record in manifest["records"] if record["name"] != "ecc-rfc3156-import"]
            manifest["records"].append({"name": "ecc-rfc3156-import", "owner": "ecc", "subject": "SYNTHETIC proper RFC3156 import", "rawMime": "ecc-rfc3156-import.eml", "ciphertext": "ecc-rfc3156-import.asc", "message": self.last_message, "topContentType": str(received.get("Content-Type")), "expectedSignature": "verified", "expectedLayers": 1, "usable": True})
            manifest["filesSha256"] = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in CORPUS.iterdir() if path.suffix in [".asc", ".eml", ".mime"]}
            (CORPUS / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")

    def run(self):
        self.sender = self.accounts["sender"]
        mailboxes = self.call("Mailbox/get", {"accountId": self.sender})["list"]
        self.drafts = next(box["id"] for box in mailboxes if box.get("role") == "drafts")
        self.identity = self.call("Identity/get", {"accountId": self.sender})["list"][0]["id"]
        ciphertext = (CORPUS / "source-client-ciphertext.asc").read_bytes()
        uploaded = json.loads(self.request(f"/jmap/upload/{self.sender}/", ciphertext, "text/plain"))
        structured = self.email_create("SYNTHETIC probe structured", {
            "type": "multipart/encrypted", "subParts": [
                {"type": "application/pgp-encrypted", "partId": "version"},
                {"type": "application/octet-stream", "blobId": uploaded["blobId"], "size": uploaded["size"]},
            ],
        }, {"version": {"value": "Version: 1\r\n"}})
        self.send("structured", structured)
        wrapped = self.receive("ecc", "SYNTHETIC probe structured")
        assert wrapped.get_content_type() == "multipart/encrypted"
        assert wrapped.get_param("protocol") == "application/pgp-encrypted"
        assert wrapped.get_payload()[1].get_payload(decode=True) != ciphertext
        print("structured missing protocol: additional recipient at-rest wrapper confirmed")
        for name in ["source-client-ciphertext.asc", "source-nested-client-ciphertext.asc"]:
            armor = (CORPUS / name).read_bytes().decode()
            subject = "SYNTHETIC probe " + name
            self.send(name.replace(".", "-"), self.email_create(subject, {"type": "text/plain", "partId": "body"}, {"body": {"value": armor}}))
            received = self.receive("ecc", subject)
            assert received.get_content_type() == "text/plain"
            assert received.get_payload(decode=True).decode().strip().replace("\r\n", "\n") == armor.strip().replace("\r\n", "\n")
            print(name + ": exact inline armor retained without recipient wrapper")
        self.import_rfc3156()
        body = (CORPUS / "source-body.mime").read_bytes().decode()
        for owner in ["ecc", "rsa"]:
            subject = "SYNTHETIC probe inbound " + owner
            message = f"From: sender@{self.domain}\r\nTo: {owner}@{self.domain}\r\nSubject: {subject}\r\nMIME-Version: 1.0\r\n" + body
            with smtplib.SMTP("127.0.0.1", 58125, timeout=15) as smtp:
                assert not smtp.sendmail("sender@" + self.domain, [owner + "@" + self.domain], message)
            received = self.receive(owner, subject)
            assert received.get_content_type() == "multipart/encrypted"
            assert received.get_param("protocol") == "application/pgp-encrypted"
            print(owner + ": plaintext SMTP became target-produced OpenPGP/MIME")
        cases = [
            ("multipart", {"header:Content-Type": 'multipart/encrypted; protocol="application/pgp-encrypted"; boundary="x"', "subParts": [{"type": "application/octet-stream", "blobId": uploaded["blobId"]}]}, False),
            ("partId", {"partId": "body", "header:Content-Type": "text/plain"}, False),
            ("duplicate", {"type": "text/plain", "header:Content-Type": "text/plain", "blobId": uploaded["blobId"]}, False),
            ("single", {"header:Content-Type": "application/octet-stream", "blobId": uploaded["blobId"]}, True),
        ]
        for label, structure, accepted in cases:
            result = self.call("Email/set", {"accountId": self.sender, "create": {"raw": self.email_create("SYNTHETIC raw " + label, structure, {"body": {"value": "SYNTHETIC"}})}})
            if accepted:
                self.created(result, "raw")
            else:
                assert result.get("notCreated", {}).get("raw", {}).get("type") == "invalidProperties"
            print("raw Content-Type " + label + ": " + ("accepted" if accepted else "invalidProperties"))


if __name__ == "__main__":
    version = subprocess.check_output(["podman", "exec", "solace-aster-target-110", "/usr/local/bin/stalwart", "--version"], text=True).strip()
    if version != "1.1.0":
        raise SystemExit("Only the explicit local Stalwart 1.1.0 target is supported")
    ports = subprocess.check_output(["podman", "port", "solace-aster-target-110"], text=True)
    if "8080/tcp -> 127.0.0.1:58110" not in ports or "25/tcp -> 127.0.0.1:58125" not in ports:
        raise SystemExit("Disposable target ports do not match the fixed loopback endpoints")
    parser = argparse.ArgumentParser()
    parser.add_argument("--record-rfc3156", action="store_true")
    args = parser.parse_args()
    probe = TargetMailProbe(record_import=args.record_rfc3156)
    try:
        probe.setup()
        probe.run()
    finally:
        probe.cleanup()
