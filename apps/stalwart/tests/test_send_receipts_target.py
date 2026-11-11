"""Opt-in receipt probes against a disposable local Stalwart server, using synthetic accounts only."""

import base64
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import re
import unittest
import urllib.parse
import urllib.request
import uuid


ROOT = Path(__file__).resolve().parents[3]
URL = os.environ.get("STALWART_SEND_TEST_URL", "")
PASSWORD = os.environ.get("STALWART_SEND_TEST_PASSWORD", "")
REGISTRY = ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"]
MAIL = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail", "urn:ietf:params:jmap:submission"]


def basic(name, password):
    return "Basic " + base64.b64encode(f"{name}:{password}".encode()).decode()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, file, code, message, headers, url):
        return None


@unittest.skipUnless(URL, "Set STALWART_SEND_TEST_URL for disposable target probes")
class SendReceiptTargetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        parsed = urllib.parse.urlsplit(URL)
        if (parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "::1"}
                or parsed.username or parsed.password or parsed.query or parsed.fragment
                or parsed.path not in {"", "/"}):
            raise ValueError("Receipt probes require a direct numeric loopback test URL")
        if not PASSWORD.startswith("solace-test-"):
            raise ValueError("Receipt probes require a synthetic test credential")
        cls.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        cls.admin = basic("admin", PASSWORD)
        cls.domain_name = "send-probe-" + uuid.uuid4().hex[:12] + ".test"
        cls.domain = cls.method(cls.admin, REGISTRY, "x:Domain/set", {
            "create": {"d": {"name": cls.domain_name, "enable": True}}
        })["created"]["d"]["id"]

    @classmethod
    def tearDownClass(cls):
        destroyed = cls.method(cls.admin, REGISTRY, "x:Domain/set", {"destroy": [cls.domain]})
        if cls.domain not in destroyed.get("destroyed", []):
            linked = destroyed.get("notDestroyed", {}).get(cls.domain, {}).get("linkedObjects", [])
            if not linked or len(linked) > 100 or any(item.get("object") != "DkimSignature" for item in linked):
                raise AssertionError("Synthetic receipt domain has unexpected linked objects")
            ids = [item["id"] for item in linked]
            removed = cls.method(cls.admin, REGISTRY, "x:DkimSignature/set", {"destroy": ids})
            if set(removed.get("destroyed", [])) != set(ids):
                raise AssertionError("Synthetic DKIM cleanup was not confirmed")
            destroyed = cls.method(cls.admin, REGISTRY, "x:Domain/set", {"destroy": [cls.domain]})
        if cls.domain not in destroyed.get("destroyed", []):
            raise AssertionError("Synthetic receipt domain cleanup was not confirmed")

    @classmethod
    def request(cls, authorization, using, calls):
        request = urllib.request.Request(URL.rstrip("/") + "/jmap/", json.dumps({
            "using": using, "methodCalls": calls,
        }).encode(), headers={"Authorization": authorization, "Content-Type": "application/json"})
        with cls.opener.open(request, timeout=10) as response:
            return json.load(response)

    @classmethod
    def method(cls, authorization, using, method, args):
        response = cls.request(authorization, using, [[method, args, "m"]])
        row = next((row for row in response.get("methodResponses", []) if row[0] == method and row[2] == "m"), None)
        if row is None:
            raise AssertionError("Synthetic target method did not return its expected result")
        return row[1]

    def setUp(self):
        self.name = "owner-" + uuid.uuid4().hex[:12]
        self.secret = "solace-test-" + uuid.uuid4().hex
        created = self.method(self.admin, REGISTRY, "x:Account/set", {"create": {"a": {
            "@type": "User", "name": self.name, "domainId": self.domain,
            "roles": {"@type": "User"}, "encryptionAtRest": {"@type": "Disabled"},
            "credentials": {"0": {"@type": "Password", "secret": self.secret}},
        }}})
        self.account = created["created"]["a"]["id"]
        self.addCleanup(self.remove_account)
        self.email = self.name + "@" + self.domain_name
        self.owner = basic(self.email, self.secret)
        boxes = self.method(self.owner, MAIL, "Mailbox/get", {"accountId": self.account})["list"]
        self.drafts = next(box["id"] for box in boxes if box.get("role") == "drafts")
        self.sent = next(box["id"] for box in boxes if box.get("role") == "sent")
        self.identity = self.method(self.owner, MAIL, "Identity/get", {"accountId": self.account})["list"][0]["id"]
        fixture = (ROOT / "packages/calendar-core/test-fixtures/stalwart-1.1.0-mail/ecc-structured.eml").read_bytes()
        armor = re.search(rb"-----BEGIN PGP MESSAGE-----.*?-----END PGP MESSAGE-----", fixture, re.S)
        if armor is None:
            raise AssertionError("Synthetic encrypted corpus fixture is missing its message")
        payload = armor.group().replace(b"\\r\\n", b"\r\n")
        request = urllib.request.Request(URL.rstrip("/") + "/jmap/upload/" + self.account + "/", payload,
                                         headers={"Authorization": self.owner, "Content-Type": "application/octet-stream"})
        with self.opener.open(request, timeout=10) as response:
            self.ciphertext = json.load(response)

    def remove_account(self):
        destroyed = self.method(self.admin, REGISTRY, "x:Account/set", {"destroy": [self.account]})
        self.assertIn(self.account, destroyed.get("destroyed", []), "Synthetic account cleanup was not confirmed")

    def calls(self, nonce=None, identity=None):
        message_id = uuid.uuid4().hex + "@" + self.domain_name
        headers = {"from": [{"email": self.email}], "to": [{"email": "synthetic@external.test"}],
                   "subject": "Synthetic receipt fixture", "messageId": [message_id]}
        create = {"draft1": {**headers, "mailboxIds": {self.drafts: True}, "keywords": {"$draft": True},
                             "textBody": [{"partId": "text", "type": "text/plain"}],
                             "bodyValues": {"text": {"value": "Synthetic receipt probe"}}},
                  "sent1": {**headers, "mailboxIds": {self.sent: True}, "keywords": {"$seen": True},
                            "bodyStructure": {"type": "multipart/encrypted", "subParts": [
                                {"type": "application/pgp-encrypted", "partId": "version"},
                                {"type": "application/octet-stream", "blobId": self.ciphertext["blobId"], "size": self.ciphertext["size"]}]},
                            "bodyValues": {"version": {"value": "Version: 1\r\n"}}}}
        sender = {"email": self.email}
        if nonce:
            sender["parameters"] = {"ENVID": nonce}
        return [["Email/set", {"accountId": self.account, "create": create}, "c1"],
                ["EmailSubmission/set", {"accountId": self.account, "create": {"s1": {
                    "emailId": "#draft1", "identityId": identity or self.identity,
                    "envelope": {"mailFrom": sender, "rcptTo": [{"email": "synthetic@external.test"}]}}},
                    "onSuccessDestroyEmail": ["#s1"]}, "c2"]]

    def batch(self, calls):
        response = self.request(self.owner, MAIL, calls)["methodResponses"]
        email = next(row[1] for row in response if row[0] == "Email/set" and row[2] == "c1")
        submission = next(row[1] for row in response if row[0] == "EmailSubmission/set" and row[2] == "c2")
        return email, submission

    def window(self, started):
        iso = lambda value: value.isoformat().replace("+00:00", "Z")
        return {"after": iso(started - timedelta(hours=48)), "before": iso(started + timedelta(hours=48))}

    def test_exact_nonce_survives_deleted_original_and_preserves_submission_envelope(self):
        baseline_email, baseline = self.batch(self.calls())
        self.assertIn("s1", baseline.get("created", {}))
        nonce = uuid.uuid4().hex
        started = datetime.now(timezone.utc)
        email, queued = self.batch(self.calls(nonce))
        receipt_id = queued["created"]["s1"]["id"]
        original = email["created"]["draft1"]["id"]
        stored = email["created"]["sent1"]["id"]
        emails = self.method(self.owner, MAIL, "Email/get", {"accountId": self.account, "ids": [original, stored],
                                                             "properties": ["id", "mailboxIds", "bodyStructure"]})
        self.assertIn(original, emails.get("notFound", []))
        copy = next(item for item in emails["list"] if item["id"] == stored)
        self.assertTrue(copy["mailboxIds"][self.sent])
        self.assertEqual(copy["bodyStructure"]["type"], "multipart/encrypted")
        for skew_hours in (-36, 0, 36):
            ids = self.method(self.owner, MAIL, "EmailSubmission/query", {"accountId": self.account,
                "filter": self.window(started + timedelta(hours=skew_hours)), "limit": 100, "position": 0, "calculateTotal": True})["ids"]
            self.assertIn(receipt_id, ids)
        read = self.method(self.owner, MAIL, "EmailSubmission/get", {"accountId": self.account,
            "ids": [baseline["created"]["s1"]["id"], receipt_id], "properties": ["id", "emailId", "undoStatus", "envelope"]})["list"]
        receipt = next(item for item in read if item["id"] == receipt_id)
        old = next(item for item in read if item["id"] != receipt_id)
        self.assertEqual(receipt["emailId"], original)
        self.assertEqual(receipt["envelope"]["mailFrom"]["parameters"]["ENVID"], nonce)
        self.assertEqual(receipt["envelope"]["mailFrom"]["email"], old["envelope"]["mailFrom"]["email"])
        self.assertEqual(receipt["envelope"]["rcptTo"], old["envelope"]["rcptTo"])
        self.assertIn(receipt["undoStatus"], {"pending", "final"})
        self.assertIn(baseline_email["created"]["sent1"]["id"], [item["id"] for item in self.method(self.owner, MAIL, "Email/get", {
            "accountId": self.account, "ids": [baseline_email["created"]["sent1"]["id"]], "properties": ["id"]})["list"]])

    def test_sent_copy_alone_does_not_prove_acceptance_after_a_refused_batch(self):
        nonce = uuid.uuid4().hex
        started = datetime.now(timezone.utc)
        email, refused = self.batch(self.calls(nonce, identity="c"))
        self.assertNotIn("s1", refused.get("created", {}))
        self.assertIn("s1", refused.get("notCreated", {}))
        stored = email["created"]["sent1"]["id"]
        self.assertEqual(len(self.method(self.owner, MAIL, "Email/get", {"accountId": self.account,
            "ids": [stored], "properties": ["id"]})["list"]), 1)
        ids = self.method(self.owner, MAIL, "EmailSubmission/query", {"accountId": self.account,
            "filter": self.window(started), "limit": 100, "position": 0, "calculateTotal": True})["ids"]
        self.assertEqual(ids, [])

    def test_destroy_then_late_submit_is_diagnostic_and_never_a_retry_fence(self):
        for inspect_missing in (False, True):
            with self.subTest(inspect_missing=inspect_missing):
                nonce = uuid.uuid4().hex
                calls = self.calls(nonce)
                created = self.request(self.owner, MAIL, calls[:1])["methodResponses"][0][1]
                original = created["created"]["draft1"]["id"]
                destroyed = self.method(self.owner, MAIL, "Email/set", {"accountId": self.account, "destroy": [original]})
                self.assertIn(original, destroyed.get("destroyed", []))
                if inspect_missing:
                    missing = self.method(self.owner, MAIL, "Email/get", {"accountId": self.account, "ids": [original], "properties": ["id"]})
                    self.assertIn(original, missing.get("notFound", []))
                calls[1][1]["create"]["s1"]["emailId"] = original
                late = self.request(self.owner, MAIL, calls[1:])["methodResponses"][0][1]
                receipt_id = late.get("created", {}).get("s1", {}).get("id")
                if receipt_id:
                    receipt = self.method(self.owner, MAIL, "EmailSubmission/get", {"accountId": self.account,
                        "ids": [receipt_id], "properties": ["id", "emailId", "envelope"]})["list"][0]
                    self.assertEqual(receipt["emailId"], original)
                    self.assertEqual(receipt["envelope"]["mailFrom"]["parameters"]["ENVID"], nonce)
                else:
                    self.assertIn("s1", late.get("notCreated", {}))
                print("Late-submit diagnostic:", "with missing read" if inspect_missing else "without missing read", "accepted" if receipt_id else "refused")


if __name__ == "__main__":
    unittest.main()
