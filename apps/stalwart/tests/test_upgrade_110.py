"""Exercise exact-key migration refusals, retry and current-state policy independently."""

import copy
import datetime as dt
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest import mock
import uuid

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("upgrade_110", ROOT / "scripts/upgrade-1.1.0.py")
upgrade = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(upgrade)
KEY = (ROOT.parents[1] / "crates/solace-api-tests/fixtures/pgp/test1.asc").read_text()
PRIMARY, FINGERPRINTS = upgrade.parse_public_fingerprints(KEY)
STORE = "1" * 64


class FakeClient:
    def __init__(self):
        self.accounts = [{"id": "u", "@type": "User", "domainId": "d", "roles": {"@type": "User"}, "permissions": {"@type": "Inherit"}, "memberTenantId": None, "encryptionAtRest": {"@type": "Disabled"}}]
        self.roles = [{"id": "r", "description": "User", "roleIds": {}, "enabledPermissions": {"emailReceive": True}, "disabledPermissions": {key: True for key in upgrade.PASSKEY_DENIALS}}]
        self.defaults = {"defaultUserRoleIds": {"r": True}, "defaultAdminRoleIds": {"r": True}, "defaultGroupRoleIds": {"r": True}}
        self.keys = {"u": [{"id": "k", "accountId": "u", "key": KEY, "kind": "openPgp", "keyType": "RSA", "warnings": {}, "expiresAt": None, "fingerprints": {key: True for key in FINGERPRINTS}}]}
        self.global_policy = {"id": "singleton", "atRestEnable": True, "gatewayEnable": False, "harvestKeys": {"match": {}, "else": "false"}}
        self.metrics = {"metricsPolicy": "exclude", "metrics": {}}
        self.sharing = {"allowDirectoryQueries": False}
        self.writes = []
        self.fail_after = None

    def all(self, kind, account_id=None):
        if kind == "x:Account":
            return copy.deepcopy(self.accounts)
        if kind == "x:Role":
            return copy.deepcopy(self.roles)
        if kind == "x:PublicKey":
            return copy.deepcopy([key for values in self.keys.values() for key in values] if account_id is None else self.keys.get(account_id, []))
        raise AssertionError(kind)

    def get(self, kind, ids, account_id=None, properties=None):
        if kind == "x:BlobStore":
            return [{"@type": "Default"}]
        if kind == "x:Authentication":
            return [copy.deepcopy(self.defaults)]
        if kind == "x:Encryption":
            return [copy.deepcopy(self.global_policy)]
        if kind == "x:Metrics":
            return [copy.deepcopy(self.metrics)]
        if kind == "x:Sharing":
            return [copy.deepcopy(self.sharing)]
        return [value for value in self.all(kind, account_id) if value["id"] in ids]

    def query(self, kind, account_id=None):
        if kind in {"Mailbox", "Email"}:
            return [kind.lower() + account_id]
        raise AssertionError(kind)

    def update(self, kind, object_id, patch):
        if self.fail_after is not None and len(self.writes) >= self.fail_after:
            raise upgrade.Refusal("injected-write-failure")
        self.writes.append((kind, object_id, copy.deepcopy(patch)))
        if kind == "x:Role":
            next(value for value in self.roles if value["id"] == object_id).update(copy.deepcopy(patch))
        elif kind == "x:Metrics":
            self.metrics.update(copy.deepcopy(patch))
        elif kind == "x:Encryption":
            self.global_policy.update(copy.deepcopy(patch))
        elif kind == "x:Sharing":
            self.sharing.update(copy.deepcopy(patch))
        else:
            next(value for value in self.accounts if value["id"] == object_id).update(copy.deepcopy(patch))


def manifest(client):
    return {"version": 1, "runId": str(uuid.uuid4()), "readerStoreId": STORE, "targetStoreId": STORE, "checkpoint": {name: "2" * 64 for name in ("stalwart", "api", "blobs", "configuration")}, "directory": [{"accountId": value["id"], "class": "user", "delivery": "active", "primaryFingerprint": PRIMARY} for value in client.accounts]}


def baseline(client):
    old = copy.deepcopy(client)
    for row in old.accounts:
        row["encryptionAtRest"] = {"@type": "Aes256", "publicKey": "k" + row["id"] if row["id"] != "u" else "k", "encryptOnAppend": False, "allowSpamTraining": False}
    return upgrade.capture(old, manifest(old), STORE)


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.client = FakeClient()
        self.baseline = baseline(self.client)

    def test_check_is_read_only_and_apply_is_idempotent(self):
        self.assertEqual(upgrade.migration(self.client, self.baseline, STORE)["changes"], 1)
        self.assertEqual(self.client.writes, [])
        self.assertEqual(upgrade.migration(self.client, self.baseline, STORE, True)["changes"], 1)
        self.assertEqual(self.client.accounts[0]["encryptionAtRest"], upgrade.enabled_policy("k"))
        self.assertEqual(upgrade.migration(self.client, self.baseline, STORE, True)["changes"], 0)
        self.assertEqual(len(self.client.writes), 1)

    def test_entire_input_is_validated_before_first_write(self):
        self.client.accounts.append(copy.deepcopy(self.client.accounts[0]))
        self.client.accounts[1]["id"] = "v"
        self.client.keys["v"] = [{**copy.deepcopy(self.client.keys["u"][0]), "id": "kv", "accountId": "v"}]
        data = baseline(self.client)
        data["accounts"][1]["primaryFingerprint"] = "A" * 40
        with self.assertRaisesRegex(upgrade.Refusal, "mapped-key-invalid"):
            upgrade.migration(self.client, data, STORE, True)
        self.assertEqual(self.client.writes, [])

    def test_partial_failure_can_resume_without_replaying_completed_update(self):
        self.client.accounts.append({**copy.deepcopy(self.client.accounts[0]), "id": "v"})
        self.client.keys["v"] = [{**copy.deepcopy(self.client.keys["u"][0]), "id": "kv", "accountId": "v"}]
        data = baseline(self.client)
        self.client.fail_after = 1
        with self.assertRaisesRegex(upgrade.Refusal, "injected"):
            upgrade.migration(self.client, data, STORE, True)
        self.client.fail_after = None
        self.assertEqual(upgrade.migration(self.client, data, STORE, True)["changes"], 1)
        self.assertEqual(upgrade.migration(self.client, data, STORE, True)["changes"], 0)
        self.assertEqual(len(self.client.writes), 2)

    def test_wrong_store_and_foreign_key_refuse_without_writes(self):
        with self.assertRaisesRegex(upgrade.Refusal, "wrong-target-store"):
            upgrade.migration(self.client, self.baseline, "3" * 64, True)
        self.client.keys["u"][0]["accountId"] = "foreign"
        with self.assertRaisesRegex(upgrade.Refusal, "foreign-key"):
            upgrade.migration(self.client, self.baseline, STORE, True)
        self.assertEqual(self.client.writes, [])

    def test_unknown_account_and_inventory_changes_refuse(self):
        self.client.accounts.append({**copy.deepcopy(self.client.accounts[0]), "id": "foreign"})
        with self.assertRaisesRegex(upgrade.Refusal, "account-set-mismatch"):
            upgrade.migration(self.client, self.baseline, STORE, True)
        self.client.accounts.pop()
        self.client.accounts[0]["domainId"] = "changed"
        with self.assertRaisesRegex(upgrade.Refusal, "inventory-mismatch"):
            upgrade.migration(self.client, self.baseline, STORE, True)
        self.assertEqual(self.client.writes, [])

    def test_historical_mapping_never_overwrites_later_active_key(self):
        self.client.accounts[0]["encryptionAtRest"] = upgrade.enabled_policy("rotation")
        with self.assertRaisesRegex(upgrade.Refusal, "unexpected-active-policy"):
            upgrade.migration(self.client, self.baseline, STORE, True)
        self.assertEqual(self.client.writes, [])

    def test_expiry_warning_and_malformed_policy_refuse(self):
        key = self.client.keys["u"][0]
        key["expiresAt"] = "2000-01-01T00:00:00Z"
        with self.assertRaisesRegex(upgrade.Refusal, "expir"):
            upgrade.migration(self.client, self.baseline, STORE, True)
        key["expiresAt"] = None
        key["warnings"] = {"weakKey": True}
        with self.assertRaisesRegex(upgrade.Refusal, "unreviewed"):
            upgrade.migration(self.client, self.baseline, STORE, True)

    def test_strict_json_unknown_fields_duplicates_and_checksum(self):
        with self.assertRaisesRegex(upgrade.Refusal, "duplicate-json-key"):
            upgrade.decode('{"version":1,"version":1}')
        with self.assertRaisesRegex(upgrade.Refusal, "invalid-json-number"):
            upgrade.decode('{"version":NaN}')
        self.baseline["extra"] = True
        with self.assertRaisesRegex(upgrade.Refusal, "invalid-baseline"):
            upgrade.validate_baseline(self.baseline)
        with mock.patch.object(upgrade.sys, "stdin", io.TextIOWrapper(io.BytesIO(b'{}'))):
            with self.assertRaisesRegex(upgrade.Refusal, "checksum"):
                upgrade.read_stdin("0" * 64)

    def test_query_continues_when_server_clamps_page_size(self):
        client = upgrade.Client("http://127.0.0.1:58140", "Bearer synthetic")
        pages = [{"position": 0, "queryState": "q", "ids": ["a"], "total": 2}, {"position": 1, "queryState": "q", "ids": ["b"], "total": 2}]
        with mock.patch.object(client, "call", side_effect=pages) as request:
            self.assertEqual(client.query("x:Account"), ["a", "b"])
            self.assertEqual(request.call_count, 2)
        pages[1]["queryState"] = "changed"
        with mock.patch.object(client, "call", side_effect=pages):
            with self.assertRaisesRegex(upgrade.Refusal, "changed-during-query"):
                client.query("x:Account")

    def test_key_policy_matches_shared_fixture(self):
        fixture = json.loads((ROOT.parents[1] / "packages/calendar-core/test-fixtures/mail-key-policy.json").read_text())
        now = upgrade.timestamp(fixture["now"])
        for case in fixture["cases"]:
            with self.subTest(case=case["name"]):
                key = {**copy.deepcopy(self.client.keys["u"][0]), "warnings": case["warnings"], "expiresAt": case["expiresAt"]}
                if case["usable"]:
                    self.assertEqual(upgrade.usable_key(key, "u", now=now), PRIMARY)
                else:
                    with self.assertRaises(upgrade.Refusal):
                        upgrade.usable_key(key, "u", now=now)
                self.assertEqual(upgrade.key_near_expiry(key, now=now), case["nearExpiry"])

    def test_group_capture_migration_and_current_require_effective_denial(self):
        group = {"id": "group", "@type": "Group", "roles": {"@type": "Default"}, "permissions": {"@type": "Inherit"}, "memberTenantId": None}
        self.client.accounts = [group]
        self.client.keys = {}
        manifest_value = {"version": 1, "runId": str(uuid.uuid4()), "readerStoreId": STORE, "targetStoreId": STORE, "checkpoint": {name: "2"*64 for name in ("stalwart", "api", "blobs", "configuration")}, "directory": [{"accountId": "group", "class": "group", "delivery": "group", "primaryFingerprint": None}]}
        with self.assertRaisesRegex(upgrade.Refusal, "group-classification"):
            upgrade.capture(self.client, manifest_value, STORE)
        with self.assertRaisesRegex(upgrade.Refusal, "receiving-group"):
            upgrade.current(self.client, STORE, {"version": 1, "storeId": STORE, "accountIds": []})
        group["permissions"] = {"@type": "Merge", "enabledPermissions": {}, "disabledPermissions": {"emailReceive": True}}
        captured = upgrade.capture(self.client, manifest_value, STORE)
        self.assertEqual(upgrade.migration(self.client, captured, STORE, True)["changes"], 0)
        group["permissions"] = {"@type": "Inherit"}
        captured["accounts"][0]["inventory"] = upgrade.inventory(self.client, group)[0]
        with self.assertRaisesRegex(upgrade.Refusal, "receiving-group"):
            upgrade.migration(self.client, captured, STORE, True)
        self.assertEqual(self.client.writes, [])

    def test_managed_plan_readback_resolves_ids_and_refuses_changed_globals(self):
        entries = [{"@type": "update", "object": "Encryption", "value": {"atRestEnable": True}}, {"@type": "upsert", "object": "Role", "matchOn": ["description"], "value": {"user-role": {"description": "User", "roleIds": {}}}}]
        self.assertEqual(upgrade.verify_managed_plan(self.client, entries), 2)
        self.assertTrue(upgrade.managed_value_matches({"defaultUserRoleIds": {"#user-role": True}}, {"defaultUserRoleIds": {"r": True}}, {"user-role": "r"}))
        self.client.global_policy["atRestEnable"] = False
        with self.assertRaisesRegex(upgrade.Refusal, "readback-mismatch"):
            upgrade.verify_managed_plan(self.client, entries)

    def test_target_bridge_and_webui_plan_retire_first_party(self):
        rows = [json.loads(line) for line in (ROOT / "stalwart/plan/15-oauth-webadmin.ndjson").read_text().splitlines()]
        bridge = next(row["value"]["solace-mail-bridge"] for row in rows if row.get("object") == "OAuthClient" and "solace-mail-bridge" in row["value"])
        self.assertNotIn("firstParty", bridge)
        self.assertEqual(bridge["scopes"], {"mail": True, "settings": True})
        application = next(row["value"]["webui"] for row in rows if row.get("object") == "Application")
        self.assertTrue(application["resourceUrl"].endswith("/v2.0.5/webui.zip"))

    def test_private_key_material_is_rejected(self):
        with self.assertRaisesRegex(upgrade.Refusal, "public-openpgp"):
            upgrade.parse_public_fingerprints(KEY.replace("PUBLIC KEY", "PRIVATE KEY"))
        self.assertEqual(PRIMARY, "CDCE225F09515A0156BBECB7D0018F17DFF405AC")


class CurrentPolicyTests(unittest.TestCase):
    def setUp(self):
        self.client = FakeClient()
        self.allowlist = {"version": 1, "storeId": STORE, "accountIds": []}

    def test_receiving_disabled_refuses_and_explicit_service_allowance_is_bound(self):
        with self.assertRaisesRegex(upgrade.Refusal, "encryption-disabled"):
            upgrade.current(self.client, STORE, self.allowlist)
        self.allowlist["accountIds"] = ["u"]
        self.assertEqual(upgrade.current(self.client, STORE, self.allowlist)["serviceExceptions"], 1)
        self.allowlist["storeId"] = "3" * 64
        with self.assertRaisesRegex(upgrade.Refusal, "wrong-service-allowlist-store"):
            upgrade.current(self.client, STORE, self.allowlist)

    def test_merge_replace_and_nested_role_denials_are_effective(self):
        account = self.client.accounts[0]
        account["permissions"] = {"@type": "Merge", "enabledPermissions": {}, "disabledPermissions": {"emailReceive": True}}
        self.assertEqual(upgrade.current(self.client, STORE, self.allowlist)["receiveDenied"], 1)
        account["permissions"] = {"@type": "Replace", "enabledPermissions": {}, "disabledPermissions": {}}
        self.assertEqual(upgrade.current(self.client, STORE, self.allowlist)["receiveDenied"], 1)
        account["permissions"] = {"@type": "Inherit"}
        self.client.roles[0]["roleIds"] = {"nested": True}
        self.client.roles.append({"id": "nested", "roleIds": {"r": True}, "enabledPermissions": {}, "disabledPermissions": {"emailReceive": True}})
        self.assertEqual(upgrade.current(self.client, STORE, self.allowlist)["receiveDenied"], 1)
        account["permissions"] = {"@type": "Merge", "enabledPermissions": {"emailReceive": True}, "disabledPermissions": {}}
        self.assertEqual(upgrade.current(self.client, STORE, self.allowlist)["receiveDenied"], 1)
        self.client.roles[1]["disabledPermissions"] = {}
        with self.assertRaisesRegex(upgrade.Refusal, "encryption-disabled"):
            upgrade.current(self.client, STORE, self.allowlist)

    def test_new_user_and_later_legitimate_key_pass_without_baseline(self):
        self.client.accounts[0]["encryptionAtRest"] = upgrade.enabled_policy("rotated")
        self.client.keys["u"][0]["id"] = "rotated"
        self.client.accounts.append({**copy.deepcopy(self.client.accounts[0]), "id": "new"})
        self.client.keys["new"] = [{**copy.deepcopy(self.client.keys["u"][0]), "accountId": "new"}]
        result = upgrade.current(self.client, STORE, self.allowlist)
        self.assertEqual(result["encrypted"], 2)
        self.assertEqual(self.client.writes, [])

    def test_gateway_harvesting_and_passkey_denials_are_checked(self):
        self.client.accounts[0]["encryptionAtRest"] = upgrade.enabled_policy("k")
        self.client.global_policy["harvestKeys"]["else"] = "true"
        with self.assertRaisesRegex(upgrade.Refusal, "global-encryption"):
            upgrade.current(self.client, STORE, self.allowlist)
        self.client.global_policy["harvestKeys"]["else"] = "false"
        self.client.roles[0]["disabledPermissions"].pop("sysPasskeyCreate")
        with self.assertRaisesRegex(upgrade.Refusal, "passkeys"):
            upgrade.current(self.client, STORE, self.allowlist)

    def test_public_principal_directory_is_refused_before_checking_accounts(self):
        self.client.sharing["allowDirectoryQueries"] = True
        with self.assertRaisesRegex(upgrade.Refusal, "principal-directory-queries-enabled"):
            upgrade.current(self.client, STORE, self.allowlist)
        self.assertEqual(self.client.writes, [])

    def test_prepare_preserves_existing_permissions_and_repairs_only_admin_role(self):
        self.client.roles[0]["disabledPermissions"] = {"sysAccountCreate": True}
        self.client.roles.append({"id": "admin", "description": "System Administrator", "roleIds": {}, "enabledPermissions": {"sysRoleGet": True}, "disabledPermissions": {}})
        self.client.defaults["defaultAdminRoleIds"] = {"admin": True}
        self.client.metrics = {"metricsPolicy": "include", "metrics": {"server.memory": True}}
        self.assertEqual(upgrade.prepare_policy(self.client)["changes"], 3)
        self.assertEqual(self.client.writes, [])
        upgrade.prepare_policy(self.client, True)
        self.assertIn("sysAccountCreate", self.client.roles[0]["disabledPermissions"])
        self.assertIn("sysRoleGet", self.client.roles[1]["enabledPermissions"])
        self.assertNotIn("sysEncryptionGet", self.client.roles[0]["enabledPermissions"])
        self.assertEqual(upgrade.prepare_policy(self.client, True)["changes"], 0)
        self.assertIn("encryption.encryption-skipped", self.client.metrics["metrics"])

    def test_denied_quarantine_can_have_an_unusable_active_key(self):
        self.client.accounts[0]["permissions"] = {"@type": "Merge", "enabledPermissions": {}, "disabledPermissions": {"emailReceive": True}}
        self.client.accounts[0]["encryptionAtRest"] = upgrade.enabled_policy("missing")
        self.assertEqual(upgrade.current(self.client, STORE, self.allowlist)["receiveDenied"], 1)
        self.client.accounts[0]["permissions"]["disabledPermissions"] = {}
        with self.assertRaisesRegex(upgrade.Refusal, "active-key-missing"):
            upgrade.current(self.client, STORE, self.allowlist)

    def test_array_key_metadata_and_filtered_skip_counter(self):
        key = self.client.keys["u"][0]
        key["warnings"], key["fingerprints"] = [], list(FINGERPRINTS)
        self.client.accounts[0]["encryptionAtRest"] = upgrade.enabled_policy("k")
        self.assertEqual(upgrade.current(self.client, STORE, self.allowlist)["encrypted"], 1)
        self.client.metrics["metrics"]["encryption.encryption-skipped"] = True
        with self.assertRaisesRegex(upgrade.Refusal, "signal-filtered"):
            upgrade.current(self.client, STORE, self.allowlist)

    def test_tenant_unknown_composition_and_missing_roles_refuse(self):
        self.client.accounts[0]["memberTenantId"] = "tenant"
        with self.assertRaisesRegex(upgrade.Refusal, "tenant"):
            upgrade.current(self.client, STORE, self.allowlist)
        self.client.accounts[0]["memberTenantId"] = None
        self.client.accounts[0]["permissions"]["@type"] = "Future"
        with self.assertRaisesRegex(upgrade.Refusal, "composition"):
            upgrade.current(self.client, STORE, self.allowlist)


if __name__ == "__main__":
    unittest.main()
