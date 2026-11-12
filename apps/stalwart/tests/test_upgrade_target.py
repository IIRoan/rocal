"""Opt-in contract probes against an isolated, synthetic Stalwart 1.1.0 server."""

import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import unittest
import urllib.error
import urllib.parse
import urllib.request
import uuid


ROOT = Path(__file__).resolve().parents[3]
URL = os.environ.get("STALWART_UPGRADE_TEST_URL", "")
PASSWORD = os.environ.get("STALWART_UPGRADE_TEST_PASSWORD", "")
REGISTRY = ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"]


def basic(name, password):
    return "Basic " + base64.b64encode(f"{name}:{password}".encode()).decode()


@unittest.skipUnless(URL, "Set STALWART_UPGRADE_TEST_URL for isolated target probes")
class TargetContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        parsed = urllib.parse.urlsplit(URL)
        if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
            raise ValueError("Target probes require a loopback test server")
        if not PASSWORD.startswith("solace-test-"):
            raise ValueError("Target probes require a synthetic test credential")
        cls.admin = basic("admin", PASSWORD)
        cls.prefix = "probe-" + uuid.uuid4().hex[:12]
        cls.accounts = []
        cls.roles = []
        cls.domain = cls.call("x:Domain/set", {
            "create": {"d": {"name": cls.prefix + ".test", "enable": True}}
        })["created"]["d"]["id"]
        cls.call("x:Encryption/set", {"update": {"singleton": {
            "atRestEnable": True,
            "gatewayEnable": False,
            "harvestKeys": {"match": {}, "else": "false"},
        }}})
        role = cls.call("x:Role/query", {})
        descriptions = cls.call("x:Role/get", {"ids": role["ids"]})["list"]
        cls.user_role = next(r["id"] for r in descriptions if r["description"] == "User")

    @classmethod
    def tearDownClass(cls):
        if cls.accounts:
            cls.call("x:Account/set", {"destroy": cls.accounts})
        if cls.roles:
            cls.call("x:Role/set", {"destroy": cls.roles})
        cls.call("x:Domain/set", {"destroy": [cls.domain]})

    @classmethod
    def request(cls, path, body=None, authorization=None):
        request = urllib.request.Request(
            URL.rstrip("/") + path,
            None if body is None else json.dumps(body).encode(),
            headers={"Authorization": authorization or cls.admin, "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.load(response)

    @classmethod
    def envelope(cls, calls, authorization=None):
        return cls.request("/jmap/", {"using": REGISTRY, "methodCalls": calls}, authorization)

    @classmethod
    def call(cls, method, args, authorization=None):
        result = cls.envelope([[method, args, "c"]], authorization)["methodResponses"]
        if len(result) != 1 or result[0][0] != method or result[0][2] != "c":
            raise AssertionError(f"Unexpected target response for {method}: {result}")
        return result[0][1]

    @classmethod
    def create_account(cls, suffix, roles=None, denied=True, authorization=None, secret="solace-test-owner-110"):
        name = cls.prefix + "-" + suffix
        permissions = {"@type": "Merge", "enabledPermissions": {}, "disabledPermissions": {}}
        if denied:
            permissions["disabledPermissions"]["emailReceive"] = True
        result = cls.call("x:Account/set", {"create": {"u": {
            "@type": "User", "name": name, "domainId": cls.domain,
            "roles": roles or {"@type": "User"}, "permissions": permissions,
            "credentials": {"0": {"@type": "Password", "secret": secret}},
            "encryptionAtRest": {"@type": "Disabled"},
        }}}, authorization)
        created = result.get("created", {}).get("u", {}).get("id")
        if created:
            cls.accounts.append(created)
        return name, created, result

    def test_same_create_receive_denial_preserves_owner_bootstrap(self):
        name, account, result = self.create_account("staged")
        self.assertIsNotNone(account, result)
        owner = basic(name + "@" + self.prefix + ".test", "solace-test-owner-110")
        session = self.request("/jmap/session", authorization=owner)
        self.assertIn(account, session["accounts"])
        settings = self.call("x:AccountSettings/get", {"accountId": account, "ids": ["singleton"]}, owner)
        self.assertEqual(settings["list"][0]["encryptionAtRest"]["@type"], "Disabled")
        current = self.call("x:Account/get", {"ids": [account]})["list"][0]
        self.assertEqual(current["permissions"]["disabledPermissions"], {"emailReceive": True})

    def test_account_text_filter_finds_owner_markers_without_a_global_inventory(self):
        _, account, result = self.create_account("marker")
        self.assertIsNotNone(account, result)
        owner = "synthetic-OwNeR_" + uuid.uuid4().hex + "-mixed"
        for prefix in ("Solace managed mailbox v1:", "Solace activated mailbox v1:"):
            result = self.call("x:Account/set", {"update": {account: {"description": prefix + owner}}})
            self.assertIn(account, result.get("updated", {}))
            found = self.call("x:Account/query", {"filter": {"text": owner}, "limit": 1000, "calculateTotal": True})
            self.assertEqual(found["ids"], [account])
            self.assertEqual(found["total"], 1)

    def test_same_create_accepts_bridge_secret_and_password_refusal_leaves_no_account(self):
        secret = base64.urlsafe_b64encode(hmac.new(
            b"synthetic bridge key", (self.prefix + ":bridge:mail-bridge:v1").encode(), hashlib.sha256,
        ).digest()).decode().rstrip("=")
        name, account, result = self.create_account("bridge", secret=secret)
        self.assertIsNotNone(account, result)
        owner = basic(name + "@" + self.prefix + ".test", secret)
        self.assertIn(account, self.request("/jmap/session", authorization=owner)["accounts"])
        name, refused, result = self.create_account("weak", secret="x")
        self.assertIsNone(refused, result)
        self.assertIn("u", result.get("notCreated", {}), result)
        self.assertEqual(self.call("x:Account/query", {"filter": {"name": name, "domainId": self.domain}})["ids"], [])

    def test_owner_can_register_key_and_enable_before_receiving(self):
        name, account, result = self.create_account("key")
        self.assertIsNotNone(account, result)
        owner = basic(name + "@" + self.prefix + ".test", "solace-test-owner-110")
        key = (ROOT / "crates/solace-api-tests/fixtures/pgp/test1.asc").read_text()
        registered = self.call("x:PublicKey/set", {"accountId": account, "create": {"k": {
            "key": key, "description": "Synthetic upgrade fixture"}}}, owner)
        key_id = registered.get("created", {}).get("k", {}).get("id")
        self.assertIsNotNone(key_id, registered)
        policy = {"@type": "Enabled", "publicKey": key_id, "headerProtection": "none",
                  "encryptOnAppend": False, "allowSpamTraining": False}
        updated = self.call("x:AccountSettings/set", {"accountId": account,
            "update": {"singleton": {"encryptionAtRest": policy}}}, owner)
        self.assertIn("singleton", updated.get("updated", {}), updated)
        current = self.call("x:Account/get", {"ids": [account]})["list"][0]
        self.assertEqual(current["encryptionAtRest"], policy)
        activated = self.call("x:Account/set", {"update": {account: {
            "permissions/disabledPermissions/emailReceive": None}}})
        self.assertIn(account, activated.get("updated", {}), activated)

    def test_public_key_addresses_are_not_client_writable(self):
        name, account, result = self.create_account("readonly")
        self.assertIsNotNone(account, result)
        owner = basic(name + "@" + self.prefix + ".test", "solace-test-owner-110")
        key = (ROOT / "crates/solace-api-tests/fixtures/pgp/test1.asc").read_text()
        result = self.call("x:PublicKey/set", {"accountId": account, "create": {"k": {
            "key": key, "description": "Synthetic read-only fixture",
            "emailAddresses": {"synthetic@example.test": True}}}}, owner)
        self.assertIn("k", result.get("notCreated", {}), result)

    def test_bare_provisioner_cannot_create_user_role_accounts(self):
        plan = json.loads((ROOT / "apps/stalwart/stalwart/plan/16-provisioner-role.ndjson").read_text())
        definition = plan["value"]["solace-provisioner"]
        definition["description"] = self.prefix + " bare provisioner"
        role = self.call("x:Role/set", {"create": {"r": definition}})["created"]["r"]["id"]
        self.roles.append(role)
        name, account, result = self.create_account("bare", roles={"@type": "Custom", "roleIds": {role: True}})
        self.assertIsNotNone(account, result)
        caller = basic(name + "@" + self.prefix + ".test", "solace-test-owner-110")
        _, created, refusal = self.create_account("refused", authorization=caller)
        self.assertIsNone(created, refusal)
        self.assertIn("u", refusal.get("notCreated", {}), refusal)

    def test_default_policy_is_explicitly_disabled_for_gateway_and_harvesting(self):
        policy = self.call("x:Encryption/get", {"ids": ["singleton"]})["list"][0]
        self.assertTrue(policy["atRestEnable"])
        self.assertFalse(policy["gatewayEnable"])
        self.assertEqual(policy["harvestKeys"], {"match": {}, "else": "false"})


if __name__ == "__main__":
    unittest.main()
