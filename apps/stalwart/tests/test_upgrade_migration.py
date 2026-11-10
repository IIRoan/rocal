"""Rehearse a populated synthetic checkpoint conversion using exact official binaries."""

import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("migration_110", ROOT / "scripts/upgrade-1.1.0.py")
upgrade = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(upgrade)
SOURCE_IMAGE = "docker.io/stalwartlabs/stalwart@sha256:baafeacd6cbde77acdd94af49972d41c6709e54a376df48e18a9fe3f445eb3d5"
TARGET_IMAGE = "docker.io/stalwartlabs/stalwart@sha256:f772aa6ef8cd8018969fa491640f1436b0270eb14e2c219b5f37f1a77020837e"


@unittest.skipUnless(os.environ.get("STALWART_RUN_MIGRATION_TESTS") == "1", "Set STALWART_RUN_MIGRATION_TESTS=1 for isolated container/PostgreSQL rehearsal")
class PopulatedMigrationTests(unittest.TestCase):
    def command(self, args, input=None):
        return subprocess.check_output(args, input=input, stderr=subprocess.DEVNULL, timeout=40)

    def psql(self, database, sql):
        return self.command(["podman", "exec", self.pg_container, "psql", "-U", self.pg_user, "-d", database, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql])

    def identity(self, database):
        value = json.loads(self.psql(database, "SELECT json_build_object('system',(pg_control_system()).system_identifier::text,'databaseOid',oid::text,'database',datname) FROM pg_database WHERE datname=current_database()"))
        value.update(bucket="", endpoint="")
        return upgrade.digest(value)

    def start(self, suffix, image, database, recovery=True, temporary=True, token=None, port=None, update_roles=False):
        name = self.prefix + "-" + suffix
        port = port or self.port
        config = self.directory / (suffix + ".json")
        config.write_text(json.dumps({"@type": "PostgreSql", "host": self.pg_container, "port": 5432, "database": database, "authUsername": self.pg_user, "authSecret": {"@type": "EnvironmentVariable", "variableName": "PGPASSWORD"}, "useTls": False, "poolMaxConnections": 4}))
        config.chmod(0o644)
        env = self.directory / (suffix + ".env")
        values = {"PGPASSWORD": self.pg_password}
        if recovery:
            values.update(STALWART_RECOVERY_MODE="true", STALWART_RECOVERY_MODE_PORT="8080")
        if temporary:
            values["STALWART_RECOVERY_ADMIN"] = "admin:solace-test-migration-admin"
        if update_roles:
            values["STALWART_UPDATE_ROLE_PERMISSIONS"] = "true"
        env.write_text("".join(key+"="+value+"\n" for key, value in values.items()))
        env.chmod(0o600)
        self.command(["podman", "run", "-d", "--name", name, "--network", self.network, "-p", "127.0.0.1:"+str(port)+":8080", "--env-file", str(env), "-v", str(config)+":/tmp/config.json:ro,z", "--entrypoint", "/usr/local/bin/stalwart", image, "--config", "/tmp/config.json"])
        self.containers.append(name)
        authorization = "Bearer " + token if token else "Basic " + base64.b64encode(b"admin:solace-test-migration-admin").decode()
        client = upgrade.Client("http://127.0.0.1:"+str(port), authorization, timeout=3)
        for _ in range(80):
            try:
                client.call("x:Account/query", {"limit": 1})
                client.timeout = 10
                return name, client
            except upgrade.Refusal:
                time.sleep(0.25)
        self.fail("Synthetic management failed to start")

    def stop(self, name, port=None):
        self.command(["podman", "stop", "-t", "15", name])
        if port:
            with socket.socket() as probe:
                self.assertNotEqual(probe.connect_ex(("127.0.0.1", port)), 0, "recovery listener must release its port")

    def test_checkpoint_exact_key_conversion_recovery_and_clean_restart(self):
        reference_pg = os.environ.get("STALWART_MIGRATION_PG_CONTAINER", "solace-test-pg")
        self.assertTrue(reference_pg.startswith("solace-test-"))
        info = json.loads(self.command(["podman", "inspect", reference_pg]))[0]
        settings = dict(value.split("=", 1) for value in info["Config"]["Env"])
        self.pg_user, self.pg_password = settings["POSTGRES_USER"], settings["POSTGRES_PASSWORD"]
        self.assertTrue(self.pg_password.startswith("solace-test-"))
        self.port = int(os.environ.get("STALWART_MIGRATION_HTTP_PORT", "58180"))
        self.assertTrue(58140 <= self.port < 59000)
        self.prefix = "solace-aster-migration-" + uuid.uuid4().hex[:10]
        self.network = self.prefix + "-network"
        self.pg_container = self.prefix + "-pg"
        source_db = self.prefix.replace("-", "_")
        reader_db = source_db + "_reader"
        self.containers = []
        self.databases = []
        with tempfile.TemporaryDirectory(prefix="solace-aster-migration-") as directory:
            self.directory = Path(directory)
            try:
                self.command(["podman", "network", "create", "--internal", self.network])
                pg_environment = self.directory / "postgres.env"
                pg_environment.write_text("POSTGRES_USER="+self.pg_user+"\nPOSTGRES_PASSWORD="+self.pg_password+"\nPOSTGRES_DB=solace_test\n")
                pg_environment.chmod(0o600)
                self.command(["podman", "run", "-d", "--name", self.pg_container, "--network", self.network, "--env-file", str(pg_environment), info["Image"]])
                self.containers.append(self.pg_container)
                for attempt in range(100):
                    ready = subprocess.run(["podman", "exec", self.pg_container, "pg_isready", "-h", "127.0.0.1", "-U", self.pg_user, "-d", "postgres"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
                    if ready.returncode == 0:
                        break
                    time.sleep(0.2)
                else:
                    self.fail("Isolated synthetic PostgreSQL failed to initialize")
                for database in (source_db, reader_db):
                    self.psql("postgres", "CREATE DATABASE " + database)
                    self.databases.append(database)
                recovery, client = self.start("source-prepare", SOURCE_IMAGE, source_db)
                listeners = client.call("x:NetworkListener/set", {"create": {"h": {"name": "synthetic-http", "protocol": "http", "bind": {"[::]:8080": True}, "useTls": False, "implicitTls": False}}})
                self.assertIn("h", listeners.get("created", {}))
                self.stop(recovery, self.port)
                normal, client = self.start("source-normal", SOURCE_IMAGE, source_db, recovery=False)
                domain = client.call("x:Domain/set", {"create": {"d": {"name": "solace.test", "enable": True}}})["created"]["d"]["id"]
                accounts = {}
                for name, role, denied in (("test1", "Admin", False), ("service", "User", False), ("stage", "User", True)):
                    result = client.call("x:Account/set", {"create": {"a": {"@type": "User", "name": name, "domainId": domain, "roles": {"@type": role}, "permissions": {"@type": "Merge", "enabledPermissions": {"emailReceive": True} if name == "test1" else {}, "disabledPermissions": {"emailReceive": True} if denied else {}}, "credentials": {"0": {"@type": "Password", "secret": "solace-test-migration-owner"}}}}})
                    accounts[name] = result["created"]["a"]["id"]
                owner = accounts["test1"]
                key = (ROOT.parents[1] / "crates/solace-api-tests/fixtures/pgp/test1.asc").read_text()
                public_key = client.call("x:PublicKey/set", {"accountId": owner, "create": {"k": {"key": key, "description": "Synthetic migration key"}}})["created"]["k"]["id"]
                client.update("x:Account", owner, {"encryptionAtRest": {"@type": "Aes256", "publicKey": public_key, "encryptOnAppend": False, "allowSpamTraining": False}})
                token = client.call("x:ApiKey/set", {"accountId": owner, "create": {"k": {"description": "Synthetic migration administration", "permissions": {"@type": "Inherit"}}}})["created"]["k"]["secret"]
                mailbox = client.call("Mailbox/query", {"accountId": owner})["ids"][0]
                stored = client.call("Email/set", {"accountId": owner, "create": {"m": {"mailboxIds": {mailbox: True}, "from": [{"email": "test1@solace.test"}], "subject": "Synthetic migration inventory", "bodyStructure": {"type": "text/plain", "partId": "t"}, "bodyValues": {"t": {"value": "Synthetic checkpoint fixture."}}}}})
                message_id = stored["created"]["m"]["id"]
                self.stop(normal, self.port)
                dump = self.command(["podman", "exec", self.pg_container, "pg_dump", "-U", self.pg_user, "-Fc", source_db])
                self.command(["podman", "exec", "-i", self.pg_container, "pg_restore", "-U", self.pg_user, "-d", reader_db, "--exit-on-error"], input=dump)
                reader, client = self.start("source-reader", SOURCE_IMAGE, reader_db)
                reader_id, target_id = self.identity(reader_db), self.identity(source_db)
                self.assertNotEqual(reader_id, target_id)
                manifest = {"version": 1, "runId": str(uuid.uuid4()), "readerStoreId": reader_id, "targetStoreId": target_id, "checkpoint": {"stalwart": hashlib.sha256(dump).hexdigest(), "api": upgrade.digest(accounts), "blobs": hashlib.sha256(dump).hexdigest(), "configuration": upgrade.digest({"source": SOURCE_IMAGE, "target": TARGET_IMAGE})}, "directory": [{"accountId": owner, "class": "user", "delivery": "active", "primaryFingerprint": upgrade.parse_public_fingerprints(key)[0]}, {"accountId": accounts["service"], "class": "service", "delivery": "active", "primaryFingerprint": None}, {"accountId": accounts["stage"], "class": "user", "delivery": "staged", "primaryFingerprint": None}]}
                baseline = upgrade.capture(client, manifest, reader_id)
                self.stop(reader, self.port)
                target, client = self.start("target-prepare", TARGET_IMAGE, source_db)
                self.assertEqual(next(a for a in client.all("x:Account") if a["id"] == owner)["encryptionAtRest"], {"@type": "Disabled"})
                upgrade.prepare_policy(client, True)
                self.assertEqual(upgrade.migration(client, baseline, target_id)["changes"], 1)
                self.assertEqual(upgrade.migration(client, baseline, target_id, True)["changes"], 1)
                self.assertEqual(upgrade.migration(client, baseline, target_id, True)["changes"], 0)
                self.assertEqual(client.query("Email", owner), [message_id])
                allowlist = {"version": 1, "storeId": target_id, "accountIds": [accounts["service"]]}
                self.assertEqual(upgrade.current(client, target_id, allowlist)["encrypted"], 1)
                definition = json.loads((ROOT / "stalwart/plan/16-provisioner-role.ndjson").read_text())["value"]["solace-provisioner"]
                definition["description"] = "Synthetic encrypted provisioner role"
                definition["enabledPermissions"] = {name: value for name, value in definition["enabledPermissions"].items() if not name.startswith(("sysPublicKey", "sysAccountSettings"))}
                management_role = client.call("x:Role/set", {"create": {"r": definition}})["created"]["r"]["id"]
                defaults = client.get("x:Authentication", ["singleton"])[0]
                service_roles = {management_role: True, **defaults["defaultUserRoleIds"]}
                role_map = {role["id"]: role for role in client.all("x:Role")}
                enabled, disabled = upgrade.role_permissions(set(service_roles), role_map)
                self.assertNotIn("impersonate", enabled-disabled)
                service_accounts = []
                for name, custom in (("test2", True), ("test3", False)):
                    created = client.call("x:Account/set", {"create": {"a": {"@type": "User", "name": name, "domainId": domain, "roles": {"@type": "Custom", "roleIds": service_roles} if custom else {"@type": "User"}, "permissions": {"@type": "Merge", "enabledPermissions": {}, "disabledPermissions": {"emailReceive": True}}}}})
                    account_id = created["created"]["a"]["id"]
                    service_accounts.append(account_id)
                    service_key = (ROOT.parents[1] / "crates/solace-api-tests/fixtures/pgp" / (name+".asc")).read_text()
                    key_id = client.call("x:PublicKey/set", {"accountId": account_id, "create": {"k": {"key": service_key, "description": "Synthetic encrypted service key"}}})["created"]["k"]["id"]
                    upgrade.usable_key(client.get("x:PublicKey", [key_id], account_id)[0], account_id)
                    client.update("x:Account", account_id, {"encryptionAtRest": upgrade.enabled_policy(key_id)})
                service_token = client.call("x:ApiKey/set", {"accountId": service_accounts[0], "create": {"k": {"description": "Synthetic dedicated provisioner", "permissions": {"@type": "Inherit"}}}})["created"]["k"]["secret"]
                provisioner = upgrade.Client("http://127.0.0.1:"+str(self.port), "Bearer "+service_token)
                activation = {"update": {service_accounts[1]: {"permissions/disabledPermissions/emailReceive": None}}}
                refused = provisioner.call("x:Account/set", activation)
                self.assertEqual(refused["notUpdated"][service_accounts[1]]["type"], "forbidden")
                client.update("x:Account", service_accounts[0], {"permissions/disabledPermissions/emailReceive": None})
                self.assertIn(service_accounts[1], provisioner.call("x:Account/set", activation)["updated"])
                self.assertEqual(upgrade.current(client, target_id, allowlist)["encrypted"], 3)
                with self.assertRaises(upgrade.Refusal):
                    provisioner.call("Email/get", {"accountId": service_accounts[1], "ids": []})
                client.call("x:Account/set", {"destroy": service_accounts})
                client.call("x:Role/set", {"destroy": [management_role]})
                self.stop(target, self.port)
                recovery, client = self.start("ordinary-preflight", TARGET_IMAGE, source_db, temporary=False, token=token)
                self.assertEqual(upgrade.current(client, target_id, allowlist)["encrypted"], 1)
                self.assertEqual(client.call("x:AccountSettings/get", {"accountId": owner, "ids": ["singleton"]})["list"][0]["encryptionAtRest"]["publicKey"], public_key)
                self.stop(recovery, self.port)
                held, client = self.start("target-held", TARGET_IMAGE, source_db, recovery=False, temporary=False, token=token, update_roles=True)
                self.assertEqual(upgrade.current(client, target_id, allowlist)["encrypted"], 1)
                roles_before = client.all("x:Role")
                redis_name = self.prefix + "-redis"
                self.command(["podman", "run", "-d", "--name", redis_name, "--network", self.network, "docker.io/library/redis@sha256:41ed50f5c0d9cf8b2151ad63df24ba96d018ccc84804d0688e9b9f1ed3d9f558", "redis-server", "--save", "", "--appendonly", "no", "--requirepass", "solace-test-migration-redis"])
                self.containers.append(redis_name)
                client.update("x:InMemoryStore", "singleton", {"@type": "Redis", "url": "redis://:solace-test-migration-redis@"+redis_name+":6379/0", "connectTimeout": 3000, "poolMaxConnections": 4})
                client.update("x:Coordinator", "singleton", {"@type": "Default"})
                self.stop(held, self.port)
                clean, client = self.start("target-clean", TARGET_IMAGE, source_db, recovery=False, temporary=False, token=token)
                self.assertEqual(client.all("x:Role"), roles_before)
                self.assertEqual(upgrade.current(client, target_id, allowlist)["encrypted"], 1)
                staged = {}
                for index in range(100):
                    staged["s"+str(index)] = {"@type": "User", "name": "stage-"+str(index), "domainId": domain, "roles": {"@type": "Custom", "roleIds": {}}, "permissions": {"@type": "Replace", "enabledPermissions": {}, "disabledPermissions": {"emailReceive": True}}}
                created = client.call("x:Account/set", {"create": staged})
                self.assertEqual(len(created.get("created", {})), 100)
                self.assertFalse(created.get("notCreated"))
                durations = []
                successful_live_probes = 0
                for attempt in range(3):
                    started = time.monotonic()
                    overlap, preflight = self.start("overlap-"+str(attempt), TARGET_IMAGE, source_db, temporary=False, token=token, port=self.port+1)
                    with ThreadPoolExecutor(max_workers=1) as executor:
                        verification = executor.submit(upgrade.current, preflight, target_id, allowlist)
                        while not verification.done():
                            client.call("x:Account/query", {"limit": 1})
                            successful_live_probes += 1
                        self.assertEqual(verification.result()["accounts"], 103)
                    self.stop(overlap, self.port+1)
                    durations.append(time.monotonic()-started)
                    self.assertEqual(client.query("Email", owner), [message_id])
                self.assertGreater(successful_live_probes, 0)
                self.assertLess(max(durations), 240)
                print(json.dumps({"syntheticAccounts": 103, "overlapPreflightSeconds": durations, "livePredecessorProbes": successful_live_probes}, sort_keys=True))
                self.stop(clean, self.port)
            finally:
                for name in self.containers:
                    if name == self.pg_container:
                        continue
                    subprocess.run(["podman", "rm", "-fv", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=25)
                for database in self.databases:
                    self.assertTrue(database.startswith("solace_aster_migration_"))
                    self.psql("postgres", "DROP DATABASE " + database + " WITH (FORCE)")
                subprocess.run(["podman", "rm", "-fv", self.pg_container], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=25)
                subprocess.run(["podman", "network", "rm", self.network], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=25)


if __name__ == "__main__":
    unittest.main()
