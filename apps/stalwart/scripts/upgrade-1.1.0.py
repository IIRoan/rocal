#!/usr/bin/env python3
"""Verify current mail policy or restore exact stopped-writer account mappings."""

import argparse
import base64
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

SOURCE_VERSION = "1.0.0"
TARGET_VERSION = "1.1.0"
MAX_INPUT = 16 * 1024 * 1024
MAX_RESPONSE = 8 * 1024 * 1024
MAX_OBJECTS = 100000
PAGE_SIZE = 100
PASSKEY_DENIALS = {"sysPasskey" + suffix for suffix in ("Get", "Create", "Update", "Destroy", "Query")}
CAPABILITIES = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail", "urn:stalwart:jmap"]


class Refusal(Exception):
    pass


def require(condition, category):
    if not condition:
        raise Refusal(category)


def strict_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "duplicate-json-key")
        result[key] = value
    return result


def decode(data):
    try:
        return json.loads(data, object_pairs_hook=strict_object, parse_constant=lambda _: (_ for _ in ()).throw(Refusal("invalid-json-number")))
    except (ValueError, UnicodeError, RecursionError) as error:
        raise Refusal("invalid-json") from error


def exact(value, fields, category):
    require(isinstance(value, dict) and set(value) == set(fields), category)
    return value


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def opaque(value):
    require(isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,160}", value), "invalid-opaque-id")
    return value


def sha256(value):
    require(isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value), "invalid-sha256")
    return value


def timestamp(value):
    require(isinstance(value, str), "invalid-time")
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise Refusal("invalid-time") from error
    require(parsed.utcoffset() is not None, "time-without-zone")
    return parsed


def true_set(value):
    if isinstance(value, list):
        require(all(isinstance(item, str) for item in value) and len(value) == len(set(value)), "invalid-set")
        return set(value)
    require(isinstance(value, dict) and all(isinstance(k, str) and v is True for k, v in value.items()), "invalid-set")
    return set(value)


def read_stdin(expected):
    sha256(expected)
    data = sys.stdin.buffer.read(MAX_INPUT + 1)
    require(len(data) <= MAX_INPUT and hashlib.sha256(data).hexdigest() == expected, "stdin-checksum-mismatch")
    return decode(data)


def local_version(binary):
    try:
        output = subprocess.check_output([binary, "--version"], stderr=subprocess.DEVNULL, timeout=10).decode()
    except (OSError, subprocess.SubprocessError, UnicodeError) as error:
        raise Refusal("binary-version-unavailable") from error
    match = re.search(r"\bv(\d+\.\d+\.\d+)\b|\b(\d+\.\d+\.\d+)\b", output)
    require(match is not None, "binary-version-unavailable")
    return next(group for group in match.groups() if group)


def store_identity(config_path):
    config = decode(Path(config_path).read_bytes())
    require(config.get("@type") == "PostgreSql", "postgres-store-required")
    command = ["psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", str(config["host"]), "-p", str(config["port"]), "-U", config["authUsername"], "-d", config["database"], "-c", "SELECT json_build_object('system', (pg_control_system()).system_identifier::text, 'databaseOid', oid::text, 'database', datname) FROM pg_database WHERE datname = current_database()"]
    try:
        actual = decode(subprocess.check_output(command, stderr=subprocess.DEVNULL, timeout=10))
    except (OSError, subprocess.SubprocessError) as error:
        raise Refusal("store-identity-unavailable") from error
    exact(actual, {"system", "databaseOid", "database"}, "invalid-store-identity")
    require(actual["database"] == config["database"], "wrong-database")
    actual["bucket"] = os.environ.get("BUCKET", "")
    actual["endpoint"] = os.environ.get("BUCKET_ENDPOINT", "")
    if actual["bucket"]:
        actual["keyPrefix"] = os.environ.get("STALWART_BLOB_KEY_PREFIX", "stalwart/")
    return digest(actual)


class Client:
    def __init__(self, url, authorization, timeout=10, deadline=240):
        parsed = urllib.parse.urlsplit(url)
        require(parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "::1", "localhost"} and not parsed.username and not parsed.query and not parsed.fragment and parsed.path in {"", "/"}, "loopback-management-required")
        require(bool(authorization), "management-credential-required")
        self.url = url.rstrip("/")
        self.authorization = authorization
        self.timeout = timeout
        self.deadline = time.monotonic() + deadline
        self.sequence = 0

    def call(self, method, args):
        require(time.monotonic() < self.deadline, "verification-deadline")
        self.sequence += 1
        call_id = str(self.sequence)
        body = json.dumps({"using": CAPABILITIES, "methodCalls": [[method, args, call_id]]}).encode()
        request = urllib.request.Request(self.url + "/jmap/", body, headers={"Authorization": self.authorization, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=min(self.timeout, max(0.1, self.deadline-time.monotonic()))) as response:
                data = response.read(MAX_RESPONSE + 1)
        except (OSError, urllib.error.HTTPError) as error:
            raise Refusal("management-request-failed") from error
        require(len(data) <= MAX_RESPONSE, "response-size-limit")
        value = decode(data)
        rows = value.get("methodResponses") if isinstance(value, dict) else None
        require(isinstance(rows, list) and len(rows) == 1, "invalid-method-response")
        row = rows[0]
        require(isinstance(row, list) and len(row) == 3 and row[0] == method and row[2] == call_id and isinstance(row[1], dict), "method-refused-or-mismatched")
        return row[1]

    def query(self, kind, account_id=None):
        position, ids, state, seen, expected_total = 0, [], None, set(), None
        while True:
            args = {"position": position, "limit": PAGE_SIZE, "calculateTotal": True}
            if account_id is not None:
                args["accountId"] = account_id
            row = self.call(kind + "/query", args)
            page = row.get("ids")
            require(row.get("position") == position and isinstance(page, list) and len(page) <= PAGE_SIZE, "invalid-query-page")
            current_state = row.get("queryState")
            require(isinstance(current_state, str) and (state is None or state == current_state), "inventory-changed-during-query")
            state = current_state
            total = row.get("total")
            require(isinstance(total, int) and not isinstance(total, bool) and 0 <= total <= MAX_OBJECTS and (expected_total is None or expected_total == total), "incomplete-or-changing-query-total")
            expected_total = total
            for object_id in page:
                opaque(object_id)
                require(object_id not in seen, "duplicate-query-id")
                seen.add(object_id)
                ids.append(object_id)
            require(len(ids) <= MAX_OBJECTS, "inventory-object-limit")
            require(len(ids) <= total and (bool(page) or len(ids) == total), "incomplete-query-results")
            if len(ids) == total:
                break
            position += len(page)
        return ids

    def get(self, kind, ids, account_id=None, properties=None):
        result = []
        for start in range(0, len(ids), PAGE_SIZE):
            requested = ids[start:start+PAGE_SIZE]
            args = {"ids": requested}
            if account_id is not None:
                args["accountId"] = account_id
            if properties is not None:
                args["properties"] = properties
            row = self.call(kind + "/get", args)
            values = row.get("list")
            require(isinstance(values, list) and not row.get("notFound"), "missing-inventory-object")
            require(len(values) == len(requested) and all(isinstance(v, dict) for v in values) and {v.get("id") for v in values} == set(requested), "incomplete-get")
            result.extend(values)
        return result

    def all(self, kind, account_id=None):
        return self.get(kind, self.query(kind, account_id), account_id)

    def update(self, kind, object_id, patch):
        row = self.call(kind + "/set", {"update": {object_id: patch}})
        require(not any(row.get(key) for key in ("notUpdated", "notCreated", "notDestroyed")) and isinstance(row.get("updated"), dict) and object_id in row["updated"], "update-not-acknowledged")


def parse_public_fingerprints(key):
    require(isinstance(key, str) and len(key) <= 2*1024*1024 and key.startswith("-----BEGIN PGP PUBLIC KEY BLOCK-----"), "public-openpgp-key-required")
    lines = key.strip().splitlines()
    require(lines[-1] == "-----END PGP PUBLIC KEY BLOCK-----", "invalid-public-key-armor")
    payload, started = [], False
    for line in lines[1:-1]:
        if not started and not line:
            started = True
        elif started and line and not line.startswith("="):
            payload.append(line)
    try:
        raw = base64.b64decode("".join(payload), validate=True)
    except ValueError as error:
        raise Refusal("invalid-public-key-base64") from error
    fingerprints, primary, pos = [], None, 0
    while pos < len(raw):
        header = raw[pos]
        pos += 1
        require(header & 128, "invalid-key-packet")
        if header & 64:
            tag = header & 63
            require(pos < len(raw), "truncated-key-packet")
            length = raw[pos]
            pos += 1
            if 192 <= length < 224:
                require(pos < len(raw), "truncated-key-packet")
                length = ((length - 192) << 8) + raw[pos] + 192
                pos += 1
            elif length == 255:
                require(pos+4 <= len(raw), "truncated-key-packet")
                length = int.from_bytes(raw[pos:pos+4], "big")
                pos += 4
            else:
                require(length < 224, "partial-key-packet-refused")
        else:
            tag, width = (header >> 2) & 15, (1, 2, 4, 0)[header & 3]
            require(width and pos+width <= len(raw), "indeterminate-key-packet-refused")
            length = int.from_bytes(raw[pos:pos+width], "big")
            pos += width
        require(pos+length <= len(raw) and tag not in {5, 7}, "private-or-truncated-key")
        packet = raw[pos:pos+length]
        pos += length
        if tag in {6, 14}:
            require(bool(packet), "empty-key-packet")
            if packet[0] == 4:
                require(length <= 65535, "oversized-v4-key")
                fingerprint = hashlib.sha1(b"\x99" + length.to_bytes(2, "big") + packet).hexdigest().upper()
            else:
                require(packet[0] in {5, 6}, "unsupported-key-version")
                prefix = b"\x9a" if packet[0] == 5 else b"\x9b"
                fingerprint = hashlib.sha256(prefix + length.to_bytes(4, "big") + packet).hexdigest().upper()
            fingerprints.append(fingerprint)
            if tag == 6:
                require(primary is None, "multiple-primary-keys")
                primary = fingerprint
    require(primary is not None, "missing-primary-key")
    return primary, set(fingerprints)


def usable_key(key, account_id, target=True, now=None):
    require(key.get("accountId") == account_id, "foreign-key-owner")
    primary, fingerprints = parse_public_fingerprints(key.get("key"))
    expires = key.get("expiresAt")
    current_time = now or dt.datetime.now(dt.timezone.utc)
    if expires is not None:
        require(timestamp(expires) > current_time, "expired-key")
    if target:
        warnings = true_set(key.get("warnings"))
        require(key.get("kind") == "openPgp" and bool(key.get("keyType")) and warnings <= {"addressMismatch", "expiresSoon"}, "unusable-or-unreviewed-key")
        require("expiresSoon" not in warnings or expires is not None, "expiry-warning-without-expiry")
        reported = true_set(key.get("fingerprints"))
        require(bool(reported) and reported <= fingerprints, "key-fingerprint-mismatch")
    return primary


def key_near_expiry(key, now=None):
    expires = key.get("expiresAt")
    if expires is None:
        return False
    current_time = now or dt.datetime.now(dt.timezone.utc)
    return current_time < timestamp(expires) <= current_time + dt.timedelta(days=14)


def enabled_policy(key_id):
    return {"@type": "Enabled", "publicKey": key_id, "headerProtection": "none", "encryptOnAppend": False, "allowSpamTraining": False}


def role_permissions(role_ids, roles):
    enabled, disabled, visited, pending = set(), set(), set(), list(role_ids)
    while pending:
        role_id = pending.pop()
        if role_id in visited:
            continue
        visited.add(role_id)
        require(role_id in roles, "missing-role")
        role = roles[role_id]
        enabled |= true_set(role.get("enabledPermissions"))
        disabled |= true_set(role.get("disabledPermissions"))
        pending.extend(true_set(role.get("roleIds")))
    return enabled, disabled


def effective_receive(account, roles, defaults):
    require(account.get("memberTenantId") is None, "tenant-permissions-require-reviewed-adapter")
    permissions = account.get("permissions")
    require(isinstance(permissions, dict) and permissions.get("@type") in {"Inherit", "Merge", "Replace"}, "unknown-permission-composition")
    if permissions["@type"] == "Inherit":
        enabled, disabled = set(), set()
    else:
        enabled, disabled = true_set(permissions.get("enabledPermissions")), true_set(permissions.get("disabledPermissions"))
    if permissions["@type"] != "Replace":
        selected = account.get("roles")
        require(isinstance(selected, dict), "missing-account-roles")
        kind = selected.get("@type")
        if kind == "Custom":
            role_ids = true_set(selected.get("roleIds"))
        else:
            require(kind in ({"Default"} if account.get("@type") == "Group" else {"User", "Admin"}), "unknown-account-roles")
            field = "defaultGroupRoleIds" if account.get("@type") == "Group" else ("defaultAdminRoleIds" if kind == "Admin" else "defaultUserRoleIds")
            role_ids = true_set(defaults.get(field))
        inherited_enabled, inherited_disabled = role_permissions(role_ids, roles)
        enabled |= inherited_enabled
        disabled |= inherited_disabled
    return "emailReceive" in enabled and "emailReceive" not in disabled


def managed_value_matches(expected, actual, aliases):
    if isinstance(expected, str) and expected.startswith("#"):
        require(expected[1:] in aliases, "unresolved-managed-reference")
        return actual == aliases[expected[1:]]
    if isinstance(expected, dict):
        if not expected:
            return actual in ({}, [])
        if all(value is True for value in expected.values()) and (isinstance(actual, list) or isinstance(actual, dict) and all(value is True for value in actual.values())):
            return {aliases.get(key[1:], key) if key.startswith("#") else key for key in true_set(expected)} == true_set(actual)
        return isinstance(actual, dict) and all(key in actual and managed_value_matches(value, actual[key], aliases) for key, value in expected.items())
    if isinstance(expected, list):
        return isinstance(actual, list) and len(expected) == len(actual) and all(managed_value_matches(left, right, aliases) for left, right in zip(expected, actual))
    return type(expected) is type(actual) and expected == actual


def verify_managed_plan(client, entries):
    require(isinstance(entries, list), "invalid-managed-plan")
    aliases, inventories, comparisons = {}, {}, []
    for entry in entries:
        require(entry.get("@type") in {"update", "upsert", "reconcile"} and isinstance(entry.get("object"), str) and isinstance(entry.get("value"), dict), "unsupported-managed-operation")
        kind = "x:" + entry["object"]
        if entry["@type"] == "update":
            comparisons.append((entry["value"], client.get(kind, ["singleton"])[0]))
            continue
        fields = entry.get("matchOn")
        require(isinstance(fields, list) and bool(fields), "managed-match-fields-required")
        if kind not in inventories:
            inventories[kind] = client.all(kind)
        for alias, expected in entry["value"].items():
            matches = [actual for actual in inventories[kind] if all(field in expected and managed_value_matches(expected[field], actual.get(field), {}) for field in fields)]
            require(len(matches) == 1, "managed-object-missing-or-ambiguous")
            require(alias not in aliases, "duplicate-managed-alias")
            aliases[alias] = matches[0]["id"]
            comparisons.append((expected, matches[0]))
    for expected, actual in comparisons:
        require(managed_value_matches(expected, actual, aliases), "managed-plan-readback-mismatch")
    return len(comparisons)


def verify_blob_binding(client):
    actual = client.get("x:BlobStore", ["singleton"])[0]
    bucket, endpoint = os.environ.get("BUCKET", ""), os.environ.get("BUCKET_ENDPOINT", "")
    if not bucket and not endpoint:
        require(actual.get("@type") == "Default", "unbound-blob-store")
        return
    region = actual.get("region")
    require(bool(bucket) and bool(endpoint) and actual.get("@type") == "S3" and actual.get("bucket") == bucket and isinstance(region, dict) and region.get("@type") == "Custom" and region.get("url", "").rstrip("/") == endpoint.rstrip("/") and actual.get("keyPrefix") == os.environ.get("STALWART_BLOB_KEY_PREFIX", "stalwart/"), "wrong-blob-store-binding")


def snapshot(client):
    verify_blob_binding(client)
    accounts = client.all("x:Account")
    roles = {role["id"]: role for role in client.all("x:Role")}
    defaults = client.get("x:Authentication", ["singleton"])[0]
    require(len({a["id"] for a in accounts}) == len(accounts), "duplicate-account")
    return accounts, roles, defaults


def verify_global(client, roles, defaults):
    sharing = client.get("x:Sharing", ["singleton"])[0]
    require(sharing.get("allowDirectoryQueries") is False, "principal-directory-queries-enabled")
    policy = client.get("x:Encryption", ["singleton"])[0]
    require(policy.get("atRestEnable") is True and policy.get("gatewayEnable") is False and policy.get("harvestKeys") == {"match": {}, "else": "false"}, "global-encryption-policy-mismatch")
    metrics = client.get("x:Metrics", ["singleton"])[0]
    selected_metrics = true_set(metrics.get("metrics"))
    require(metrics.get("metricsPolicy") in {"include", "exclude"}, "unknown-metrics-policy")
    require(("encryption.encryption-skipped" in selected_metrics) == (metrics["metricsPolicy"] == "include"), "encryption-skip-signal-filtered")
    user_ids = true_set(defaults.get("defaultUserRoleIds"))
    require(bool(user_ids), "missing-default-user-role")
    _, denied = role_permissions(user_ids, roles)
    require(PASSKEY_DENIALS <= denied, "passkeys-not-explicitly-denied")


def validate_allowlist(value, actual_store):
    exact(value, {"version", "storeId", "accountIds"}, "invalid-service-allowlist")
    require(value["version"] == 1 and value["storeId"] == actual_store and isinstance(value["accountIds"], list), "wrong-service-allowlist-store")
    ids = [opaque(v) for v in value["accountIds"]]
    require(len(ids) == len(set(ids)), "duplicate-service-account")
    return set(ids)


def current(client, actual_store, allowlist):
    service_ids = validate_allowlist(allowlist, actual_store)
    accounts, roles, defaults = snapshot(client)
    verify_global(client, roles, defaults)
    present = {a["id"] for a in accounts}
    require(service_ids <= present, "missing-allowed-service-account")
    receiving, denied, encrypted, near_expiry = 0, 0, 0, 0
    for account in accounts:
        require(account.get("@type") in {"User", "Group"}, "unknown-account-kind")
        can_receive = effective_receive(account, roles, defaults)
        if account["@type"] == "Group":
            require(not can_receive, "receiving-group-refused")
            denied += 1
            continue
        policy = account.get("encryptionAtRest")
        keys = {key["id"]: key for key in client.all("x:PublicKey", account["id"])}
        if can_receive:
            receiving += 1
        else:
            denied += 1
            continue
        if policy == {"@type": "Disabled"}:
            require(not can_receive or account["id"] in service_ids, "receiving-account-encryption-disabled")
            continue
        require(isinstance(policy, dict) and isinstance(policy.get("publicKey"), str) and policy == enabled_policy(policy["publicKey"]), "account-encryption-policy-mismatch")
        require(policy["publicKey"] in keys, "active-key-missing")
        usable_key(keys[policy["publicKey"]], account["id"])
        near_expiry += int(key_near_expiry(keys[policy["publicKey"]]))
        encrypted += 1
    return {"accounts": len(accounts), "receiving": receiving, "receiveDenied": denied, "encrypted": encrypted, "serviceExceptions": len(service_ids), "nearExpiry": near_expiry}


def prepare_policy(client, apply=False):
    verify_blob_binding(client)
    roles = {role["id"]: role for role in client.all("x:Role")}
    defaults = client.get("x:Authentication", ["singleton"])[0]
    user_ids = true_set(defaults.get("defaultUserRoleIds"))
    admin_ids = true_set(defaults.get("defaultAdminRoleIds"))
    require(bool(user_ids) and bool(admin_ids), "default-role-policy-missing")
    administrators = [role for role in roles.values() if role.get("description") == "System Administrator" and role["id"] in admin_ids]
    require(len(administrators) == 1 and administrators[0]["id"] not in user_ids, "administrator-role-repair-requires-review")
    patches = []
    for role_id in sorted(user_ids):
        require(role_id in roles, "missing-default-user-role")
        existing = true_set(roles[role_id].get("disabledPermissions"))
        desired = existing | PASSKEY_DENIALS
        if desired != existing:
            patches.append(("x:Role", role_id, {"disabledPermissions": {name: True for name in sorted(desired)}}))
    administrator = administrators[0]
    enabled = true_set(administrator.get("enabledPermissions"))
    desired = enabled | {"sysEncryptionGet", "sysEncryptionUpdate"}
    if desired != enabled:
        patches.append(("x:Role", administrator["id"], {"enabledPermissions": {name: True for name in sorted(desired)}}))
    policy = client.get("x:Encryption", ["singleton"])[0]
    desired = {"atRestEnable": True, "gatewayEnable": False, "harvestKeys": {"match": {}, "else": "false"}}
    if any(policy.get(key) != value for key, value in desired.items()):
        patches.append(("x:Encryption", "singleton", desired))
    metrics = client.get("x:Metrics", ["singleton"])[0]
    selected_metrics = true_set(metrics.get("metrics"))
    require(metrics.get("metricsPolicy") in {"include", "exclude"}, "unknown-metrics-policy")
    desired_metrics = selected_metrics | {"encryption.encryption-skipped"} if metrics["metricsPolicy"] == "include" else selected_metrics - {"encryption.encryption-skipped"}
    if selected_metrics != desired_metrics:
        patches.append(("x:Metrics", "singleton", {"metrics": {name: True for name in sorted(desired_metrics)}}))
    if apply:
        for kind, object_id, patch in patches:
            client.update(kind, object_id, patch)
            readback = client.get(kind, [object_id])[0]
            require(all(readback.get(key) == value for key, value in patch.items()), "prepare-policy-readback-mismatch")
    return {"changes": len(patches), "applied": bool(apply)}


def classification(value):
    exact(value, {"accountId", "class", "delivery", "primaryFingerprint"}, "invalid-classification")
    opaque(value["accountId"])
    require(value["class"] in {"user", "service", "group"} and value["delivery"] in {"active", "staged", "quarantined", "group"}, "invalid-account-class")
    require((value["class"] == "group") == (value["delivery"] == "group"), "group-delivery-classification-mismatch")
    fingerprint = value["primaryFingerprint"]
    require(fingerprint is None or isinstance(fingerprint, str) and re.fullmatch(r"(?:[0-9A-F]{40}|[0-9A-F]{64})", fingerprint), "invalid-primary-fingerprint")
    return value


def validate_capture_input(value):
    exact(value, {"version", "runId", "readerStoreId", "targetStoreId", "checkpoint", "directory"}, "invalid-capture-input")
    require(value["version"] == 1, "unsupported-baseline-version")
    try:
        uuid.UUID(value["runId"])
    except (ValueError, TypeError, AttributeError) as error:
        raise Refusal("invalid-run-id") from error
    sha256(value["readerStoreId"])
    sha256(value["targetStoreId"])
    exact(value["checkpoint"], {"stalwart", "api", "blobs", "configuration"}, "invalid-checkpoint-provenance")
    for checksum in value["checkpoint"].values():
        sha256(checksum)
    require(isinstance(value["directory"], list), "invalid-directory-snapshot")
    rows = [classification(v) for v in value["directory"]]
    require(len({v["accountId"] for v in rows}) == len(rows), "duplicate-directory-account")
    return value


def inventory(client, account, target=True, source_keys=None):
    public_keys = client.all("x:PublicKey", account["id"]) if source_keys is None else source_keys
    if target:
        require(all(key.get("accountId") == account["id"] for key in public_keys), "foreign-key-in-account-inventory")
    else:
        public_keys = [key for key in public_keys if key.get("accountId") == account["id"]]
    key_ids = sorted((k["id"], digest(k.get("key"))) for k in public_keys)
    if account["@type"] == "Group":
        mailbox_ids, message_ids = [], []
    else:
        mailbox_ids = sorted(client.query("Mailbox", account["id"]))
        message_ids = sorted(client.query("Email", account["id"]))
    structural = {key: account.get(key) for key in ("id", "@type", "domainId", "roles", "permissions", "memberTenantId")}
    return {"account": digest(structural), "keys": digest(key_ids), "mailboxes": digest(mailbox_ids), "messages": digest(message_ids)}, public_keys


def capture(client, manifest, actual_store):
    validate_capture_input(manifest)
    require(manifest["readerStoreId"] == actual_store, "wrong-capture-reader-store")
    accounts, roles, defaults = snapshot(client)
    directory = {row["accountId"]: row for row in manifest["directory"]}
    require(set(directory) == {a["id"] for a in accounts}, "directory-account-set-mismatch")
    source_keys = client.all("x:PublicKey")
    require(all(key.get("accountId") in directory for key in source_keys), "orphan-source-public-key")
    records = []
    for account in sorted(accounts, key=lambda a: a["id"]):
        row = directory[account["id"]]
        require((account.get("@type") == "Group") == (row["class"] == "group"), "group-classification-mismatch")
        policy = account.get("encryptionAtRest")
        if account.get("@type") != "Group":
            require(isinstance(policy, dict), "missing-source-policy")
            exact(policy, {"@type"} if policy.get("@type") == "Disabled" else {"@type", "publicKey", "encryptOnAppend", "allowSpamTraining"}, "unknown-source-policy-fields")
        observed, keys = inventory(client, account, target=False, source_keys=source_keys)
        receiving = effective_receive(account, roles, defaults)
        if row["class"] == "group":
            require(account.get("@type") == "Group" and row["delivery"] == "group" and row["primaryFingerprint"] is None and not receiving and policy is None, "group-classification-mismatch")
        elif row["delivery"] in {"staged", "quarantined"}:
            require(not receiving and row["class"] in {"user", "service"}, "receiving-stage-or-quarantine")
        else:
            require(row["delivery"] == "active", "invalid-active-classification")
        key_id, primary = None, None
        if account.get("@type") == "Group":
            pass
        elif policy.get("@type") != "Disabled":
            require(policy.get("@type") in {"Aes128", "Aes256", "Aes256Gcm", "ChaCha20Poly1305"}, "unknown-source-encryption")
            key_id = opaque(policy.get("publicKey"))
            selected = [k for k in keys if k["id"] == key_id]
            require(len(selected) == 1, "source-key-missing")
            primary = usable_key(selected[0], account["id"], target=False)
            require(primary == row["primaryFingerprint"], "source-directory-key-mismatch")
            require(policy.get("encryptOnAppend") is False and policy.get("allowSpamTraining") is False, "unsafe-source-flags")
        else:
            require(row["primaryFingerprint"] is None and (row["class"] in {"service", "group"} or not receiving), "unclassified-disabled-source-account")
        records.append({"id": account["id"], "kind": account["@type"], "class": row["class"], "delivery": row["delivery"], "policy": policy, "publicKeyId": key_id, "primaryFingerprint": primary, "inventory": observed})
    return {"version": 1, "sourceVersion": SOURCE_VERSION, "targetVersion": TARGET_VERSION, "runId": manifest["runId"], "capturedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "readerStoreId": actual_store, "targetStoreId": manifest["targetStoreId"], "checkpoint": manifest["checkpoint"], "accounts": records}


def validate_baseline(value):
    exact(value, {"version", "sourceVersion", "targetVersion", "runId", "capturedAt", "readerStoreId", "targetStoreId", "checkpoint", "accounts"}, "invalid-baseline")
    require(value["version"] == 1 and value["sourceVersion"] == SOURCE_VERSION and value["targetVersion"] == TARGET_VERSION, "wrong-baseline-version")
    timestamp(value["capturedAt"])
    require(isinstance(value["accounts"], list), "invalid-baseline-accounts")
    directory = []
    for row in value["accounts"]:
        exact(row, {"id", "kind", "class", "delivery", "policy", "publicKeyId", "primaryFingerprint", "inventory"}, "invalid-baseline-account")
        require(row["kind"] in {"User", "Group"} and (row["kind"] == "Group") == (row["class"] == "group"), "invalid-baseline-kind")
        directory.append({"accountId": row["id"], "class": row["class"], "delivery": row["delivery"], "primaryFingerprint": row["primaryFingerprint"]})
        exact(row["inventory"], {"account", "keys", "mailboxes", "messages"}, "invalid-inventory-digests")
        for checksum in row["inventory"].values():
            sha256(checksum)
        if row["kind"] == "Group":
            require(row["class"] == "group" and row["delivery"] == "group" and row["policy"] is None and row["publicKeyId"] is None and row["primaryFingerprint"] is None, "invalid-group-baseline")
            continue
        exact(row["policy"], {"@type"} if row["publicKeyId"] is None else {"@type", "publicKey", "encryptOnAppend", "allowSpamTraining"}, "unknown-baseline-policy-fields")
        if row["publicKeyId"] is None:
            require(row["policy"] == {"@type": "Disabled"} and row["primaryFingerprint"] is None, "invalid-keyless-baseline")
        else:
            opaque(row["publicKeyId"])
            require(row["policy"].get("@type") in {"Aes128", "Aes256", "Aes256Gcm", "ChaCha20Poly1305"} and row["policy"].get("publicKey") == row["publicKeyId"] and row["policy"].get("encryptOnAppend") is False and row["policy"].get("allowSpamTraining") is False and row["primaryFingerprint"] is not None, "invalid-mapped-baseline")
    validate_capture_input({"version": value["version"], "runId": value["runId"], "readerStoreId": value["readerStoreId"], "targetStoreId": value["targetStoreId"], "checkpoint": value["checkpoint"], "directory": directory})
    return value


def migration(client, baseline, actual_store, apply=False):
    validate_baseline(baseline)
    require(baseline["targetStoreId"] == actual_store, "wrong-target-store")
    accounts, roles, defaults = snapshot(client)
    verify_global(client, roles, defaults)
    indexed = {a["id"]: a for a in accounts}
    require(set(indexed) == {row["id"] for row in baseline["accounts"]}, "baseline-account-set-mismatch")
    changes, near_expiry = [], 0
    for row in baseline["accounts"]:
        account = indexed[row["id"]]
        require(account.get("@type") == row["kind"], "account-kind-mismatch")
        observed, keys = inventory(client, account)
        require(observed == row["inventory"], "stopped-writer-inventory-mismatch")
        if row["kind"] == "Group":
            require(not effective_receive(account, roles, defaults), "receiving-group-refused")
            continue
        if row["delivery"] in {"staged", "quarantined"}:
            require(not effective_receive(account, roles, defaults), "stage-or-quarantine-now-receiving")
        desired = enabled_policy(row["publicKeyId"]) if row["publicKeyId"] is not None else {"@type": "Disabled"}
        if row["publicKeyId"] is not None:
            selected = [k for k in keys if k["id"] == row["publicKeyId"]]
            require(len(selected) == 1 and usable_key(selected[0], row["id"]) == row["primaryFingerprint"], "mapped-key-invalid")
            near_expiry += int(key_near_expiry(selected[0]))
        current_policy = account.get("encryptionAtRest")
        require(current_policy in (desired, {"@type": "Disabled"}), "unexpected-active-policy")
        if desired != current_policy:
            changes.append((row["id"], desired))
    if apply:
        for account_id, policy in changes:
            client.update("x:Account", account_id, {"encryptionAtRest": policy})
            require(client.get("x:Account", [account_id])[0].get("encryptionAtRest") == policy, "policy-readback-mismatch")
    return {"accounts": len(accounts), "changes": len(changes), "applied": bool(apply), "nearExpiry": near_expiry}


def authorization():
    temporary = os.environ.get("STALWART_RECOVERY_ADMIN", "")
    if temporary:
        require(os.environ.get("STALWART_UPGRADE_PHASE") == "prepare", "temporary-admin-outside-prepare")
        require(":" in temporary, "invalid-recovery-admin")
        return "Basic " + base64.b64encode(temporary.encode()).decode()
    token = os.environ.get("STALWART_ADMIN_TOKEN", "")
    require(bool(token), "ordinary-admin-token-required")
    return "Bearer " + token


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["identity", "capture", "check", "apply", "prepare-policy", "verify-current"], nargs="?", default="check")
    parser.add_argument("--url", default="http://127.0.0.1:8080")
    parser.add_argument("--config", default="/etc/stalwart/config.json")
    parser.add_argument("--binary", default="/usr/local/bin/stalwart")
    parser.add_argument("--stdin-sha256")
    parser.add_argument("--service-allowlist", default="/etc/stalwart/service-allowlist.json")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args(argv)
    try:
        actual = store_identity(args.config)
        if args.command == "identity":
            print(actual)
            return 0
        expected_version = SOURCE_VERSION if args.command == "capture" else TARGET_VERSION
        require(local_version(args.binary) == expected_version, "wrong-server-binary")
        client = Client(args.url, authorization())
        if args.command == "prepare-policy":
            require(os.environ.get("STALWART_UPGRADE_PHASE") == "prepare" and os.environ.get("STALWART_RECOVERY_MODE", "").lower() in {"1", "true"}, "stopped-writer-prepare-required")
            require(args.stdin_sha256 is None, "baseline-forbidden-for-policy-repair")
            result = prepare_policy(client, args.apply)
        elif args.command == "verify-current":
            require(args.stdin_sha256 is None and not args.apply, "historical-baseline-forbidden-in-current-verification")
            require(os.environ.get("STALWART_APPROVED_STORE_ID") == actual, "unapproved-store")
            result = current(client, actual, decode(Path(args.service_allowlist).read_bytes()))
        else:
            require(os.environ.get("STALWART_UPGRADE_PHASE") == "prepare" and os.environ.get("STALWART_RECOVERY_MODE", "").lower() in {"1", "true"}, "stopped-writer-prepare-required")
            require(args.stdin_sha256 is not None, "stdin-checksum-required")
            value = read_stdin(args.stdin_sha256)
            if args.command == "capture":
                require(not args.apply, "capture-is-read-only")
                print(json.dumps(capture(client, value, actual), sort_keys=True, separators=(",", ":")))
                return 0
            require(not args.apply or args.command == "apply", "apply-flag-not-supported")
            require(args.command != "apply" or args.apply, "explicit-apply-required")
            result = migration(client, value, actual, args.command == "apply")
        print(json.dumps({"status": "verified", **result}, sort_keys=True))
        return 2 if result.get("changes") and not result.get("applied") else 0
    except (Refusal, OSError, KeyError, TypeError, ValueError) as error:
        category = str(error) if isinstance(error, Refusal) else "invalid-operation-input-or-environment"
        print(json.dumps({"status": "refused", "category": category}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
