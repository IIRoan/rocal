"""Offline regression coverage for the VPS slot-manager and the container tunnel boot/shutdown."""

import concurrent.futures
import importlib.util
import io
import json
import base64
import os
from pathlib import Path
import re
import subprocess
import tempfile
import tomllib
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


manager = load("slot_manager", ROOT / "vps/stalwart-slot-manager.py")
ENTRYPOINT = (ROOT / "railway-entrypoint.sh").read_text()


def shell_functions(*names):
    return "".join(re.search(rf"^{name}\(\) \{{\n.*?^\}}\n", ENTRYPOINT, re.M | re.S).group(0) for name in names)


def render_frpc_config(path, **overrides):
    env = {"PATH": os.environ["PATH"], "FRPC_CONFIG": str(path), "FRPS_ADDR": "127.0.0.1", "FRPC_TOKEN": "test-only",
           "FRPC_ADMIN_PORT": "7400", "FRPC_RELAY_STCP_KEY": "relay-test", "FRPC_RELAY_LOCAL_PORT": "2525",
           "STALWART_HTTP_PORT": "8080", "FRPC_OWNER": "owner", "RECOVERY_MODE": "false",
           "FRPC_TLS_DIR": str(Path(path).parent / "tls"), **overrides}
    script = shell_functions("write_frpc_tls", "write_frpc_group_proxy", "write_frpc_config")
    subprocess.run(["sh", "-euc", script + "write_frpc_tls\nwrite_frpc_config"], env=env, check=True)
    return Path(path).read_text()


class CoordinationFixture(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="solace-ha-test-")
        self.addCleanup(self.tmp.cleanup)
        self.now = 1000
        self.active = "blue"
        self.proxies = {}
        for name, value in {
            "PREEMPT_DIR": self.tmp.name,
            "time": types.SimpleNamespace(time=lambda: self.now),
            "read_active_slot": lambda: self.active,
            "fetch_frp_proxies": lambda: self.proxies,
        }.items():
            p = patch.object(manager, name, value)
            p.start()
            self.addCleanup(p.stop)

    def request(self, action, slot="green", owner="new"):
        return manager.coordinate_slot(action, slot, owner)[0]


class CoordinationTests(CoordinationFixture):
    def post(self, path, body, authorized=True):
        raw = json.dumps(body).encode()
        handler = object.__new__(manager.Handler)
        handler.path = path
        handler.headers = {"Content-Length": str(len(raw)), "Authorization": "Bearer test" if authorized else ""}
        handler.rfile = io.BytesIO(raw)
        responses = []
        handler._send = lambda code, payload: responses.append((code, payload))
        with patch.object(manager, "AUTH_TOKEN", "test"), patch.dict(
            os.environ, {"SLOT_SWITCH_LOCK": str(Path(self.tmp.name, "switch.lock"))}
        ):
            handler.do_POST()
        return responses[0][0]

    def test_activation_is_owner_checked_and_renewal_survives_switch(self):
        self.request("/preempt")
        self.request("/lease/claim")

        def switch(*args, **kwargs):
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                renewed = pool.submit(self.request, "/lease/renew").result(timeout=1)
            self.assertEqual(renewed, 200)
            self.assertEqual(self.request("/preempt", owner="peer"), 409)
            self.active = "green"

        with patch.object(manager.subprocess, "run", side_effect=switch) as run:
            self.assertEqual(self.post("/activate", {"slot": "green", "owner": "wrong"}), 409)
            run.assert_not_called()
            self.assertEqual(self.post("/activate", {"slot": "green", "owner": "new"}), 200)
        self.assertFalse(manager.read_status()["greenPreempted"])

    def test_old_entrypoint_can_activate_unleased_slot_during_vps_first_rollout(self):
        with patch.object(manager.subprocess, "run") as run:
            self.assertEqual(self.post("/activate", {"slot": "green"}), 200)
            run.assert_called_once()

    def test_lease_http_requires_auth_and_owner(self):
        self.assertEqual(self.post("/lease/claim", {"slot": "green", "owner": "new"}, False), 401)
        self.assertEqual(self.post("/preempt", {"slot": "green"}), 400)
        self.assertEqual(self.post("/preempt", {"slot": [], "owner": "new"}), 400)

    def test_pending_standby_launch_must_acknowledge_before_peer_claim(self):
        self.assertEqual(self.request("/lease/claim", owner="incumbent"), 200)
        self.assertEqual(self.request("/preempt"), 200)
        self.assertEqual(self.request("/lease/claim"), 409)
        self.assertEqual(self.request("/lease/renew", owner="incumbent"), 409)
        self.assertEqual(self.request("/lease/release", owner="incumbent"), 200)
        self.assertEqual(self.request("/lease/claim"), 200)
        self.assertEqual(self.request("/preempt/clear"), 200)
        self.assertEqual(self.request("/lease/claim", owner="incumbent"), 409)

    def test_preempt_before_standby_claim_prevents_launch(self):
        self.assertEqual(self.request("/preempt"), 200)
        self.assertEqual(self.request("/lease/claim", owner="incumbent"), 409)

    def test_abandoned_preempt_expires(self):
        self.request("/preempt")
        self.now += manager.PREEMPT_SECONDS + 1
        self.assertFalse(manager.read_status()["greenPreempted"])
        self.assertEqual(self.request("/lease/claim", owner="incumbent"), 200)

    def test_expired_lease_never_overrides_online_proxy(self):
        self.request("/lease/claim", owner="dead")
        self.proxies = {"smtp-green": "online"}
        self.now += manager.LEASE_SECONDS + 1
        self.assertEqual(self.request("/lease/claim"), 409)
        self.proxies = {}
        self.assertEqual(self.request("/lease/claim"), 200)

    def test_unknown_occupancy_fails_closed(self):
        self.proxies = None
        self.assertIsNone(manager.read_status()["greenOccupied"])
        self.assertEqual(self.request("/lease/claim"), 409)

    def test_owner_scopes_clear_and_release(self):
        self.request("/preempt")
        self.request("/lease/claim")
        self.assertEqual(self.request("/preempt/clear", owner="stale"), 409)
        self.assertEqual(self.request("/lease/release", owner="stale"), 409)
        self.assertEqual(manager.read_status()["greenOwner"], "new")

    def test_primary_and_standby_claims_are_serialized(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda n: self.request("/lease/claim", owner=str(n)), range(8)))
        self.assertEqual(results.count(200), 1)

    def test_active_slot_cannot_be_preempted(self):
        self.assertEqual(self.request("/preempt", slot="blue"), 409)

    def test_former_primary_can_release_after_watcher_failover(self):
        self.request("/lease/claim", owner="incumbent")
        self.active = "green"
        self.assertEqual(self.request("/lease/renew", owner="incumbent"), 200)
        self.active = "blue"
        self.request("/preempt")
        self.assertEqual(self.request("/lease/renew", owner="incumbent"), 409)

    def test_last_owner_can_reclaim_active_slot_after_lease_expiry(self):
        self.request("/lease/claim")
        self.active = "green"
        self.now += manager.LEASE_SECONDS + 1
        self.assertEqual(self.request("/lease/renew"), 409)
        self.assertEqual(self.request("/lease/claim", owner="stranger"), 409)
        self.assertEqual(self.request("/lease/reclaim"), 200)

    def test_reclaim_after_vps_reboot_requires_vacancy(self):
        self.proxies = {"http-admin-blue": "online"}
        self.assertEqual(self.request("/lease/reclaim", slot="blue"), 409)
        self.proxies = {}
        self.assertEqual(self.request("/lease/reclaim", slot="blue"), 200)

    def test_legacy_boolean_flag_does_not_latch_preemption(self):
        Path(self.tmp.name, "green").write_text("1\n")
        self.assertFalse(manager.read_status()["greenPreempted"])


class EntrypointTests(unittest.TestCase):
    def test_missing_relay_stcp_key_fails_instead_of_public_default(self):
        env = {"PATH": os.environ["PATH"], "PGHOST": "test", "PGUSER": "test", "PGPASSWORD": "test",
               "FRPS_ADDR": "test", "FRPC_TOKEN": "test"}
        result = subprocess.run(["sh", str(ROOT / "railway-entrypoint.sh")], env=env,
                                capture_output=True, text=True, timeout=3)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("FRPC_RELAY_STCP_KEY is required", result.stderr)

    def test_short_gate_key_fails_before_any_service_is_started(self):
        env = {"PATH": os.environ["PATH"], "PGHOST": "test", "PGUSER": "test", "PGPASSWORD": "test",
               "FRPS_ADDR": "test", "FRPC_TOKEN": "test", "FRPC_RELAY_STCP_KEY": "test", "STALWART_GATE_KEY": "short"}
        result = subprocess.run(["sh", str(ROOT / "railway-entrypoint.sh")], env=env,
                                capture_output=True, text=True, timeout=3)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("STALWART_GATE_KEY (32+ characters) is required", result.stderr)

    def test_vps_frp_configs_commit_placeholders_not_secrets(self):
        for name in ("frps.toml", "frpc-relay.toml"):
            text = (ROOT / "vps" / name).read_text()
            self.assertIn('token = "__FRP_TOKEN__"', text)
        self.assertIn('secretKey = "__FRP_RELAY_STCP_KEY__"', (ROOT / "vps" / "frpc-relay.toml").read_text())

    def test_frpc_joins_fixed_group_ports_under_per_container_names(self):
        with tempfile.TemporaryDirectory(prefix="solace-frpc-config-") as tmp:
            config = tomllib.loads(render_frpc_config(Path(tmp, "frpc.toml")))
            proxies = {proxy["name"]: proxy for proxy in config["proxies"]}
            self.assertEqual({name: (proxy["remotePort"], proxy["loadBalancer"]["group"])
                              for name, proxy in proxies.items()},
                             {"smtp-owner": (10025, "smtp"), "http-owner": (18080, "http")})
            self.assertEqual(config["visitors"][0]["bindPort"], 2525)
            recovery = tomllib.loads(render_frpc_config(Path(tmp, "frpc.toml"), RECOVERY_MODE="true"))
            self.assertEqual([proxy["name"] for proxy in recovery["proxies"]], ["http-owner"])

    def test_frpc_tls_settings_follow_the_staged_rollout(self):
        pem = base64.b64encode(b"pem").decode()
        with tempfile.TemporaryDirectory(prefix="solace-frpc-tls-") as tmp:
            path = Path(tmp, "frpc.toml")
            self.assertNotIn("tls", tomllib.loads(render_frpc_config(path))["transport"])
            client_only = tomllib.loads(render_frpc_config(path, FRPC_TLS_CERT=pem, FRPC_TLS_KEY=pem))["transport"]["tls"]
            self.assertEqual(set(client_only), {"certFile", "keyFile"})
            pinned = tomllib.loads(render_frpc_config(path, FRPC_TLS_CERT=pem, FRPC_TLS_KEY=pem,
                                                      FRPC_TLS_CA=pem))["transport"]["tls"]
            self.assertEqual(pinned["serverName"], "frps.solace")
            self.assertEqual(Path(pinned["trustedCaFile"]).read_bytes(), b"pem")
            self.assertEqual(Path(pinned["keyFile"]).stat().st_mode & 0o777, 0o600)

    def test_shutdown_leaves_tunnel_groups_before_stopping_stalwart(self):
        with tempfile.TemporaryDirectory(prefix="solace-shutdown-") as tmp:
            order = Path(tmp, "order")
            script = ("write_health_state() { :; }\n" + shell_functions("cleanup") +
                      'fake() { trap \'echo "$1" >>"$ORDER"; exit 0\' TERM; while :; do sleep 0.05; done; }\n'
                      "fake frpc & FRPC_PID=$!\nfake stalwart & STALWART_PID=$!\nsleep 0.3\ncleanup\nwait\n")
            subprocess.run(["sh", "-euc", script], env={"PATH": os.environ["PATH"], "ORDER": str(order),
                                                        "FRPC_DRAIN_SECONDS": "0.2"}, check=True, timeout=10)
            self.assertEqual(order.read_text().split(), ["frpc", "stalwart"])

    def test_health_requires_ready_state_and_live_stalwart_and_frpc(self):
        code = "def ready():" + ENTRYPOINT.split("def ready():", 1)[1].split("\ndef handle(conn):", 1)[0]
        state = {"ready": True, "stalwart_pid": 1, "frpc_pid": 2}
        alive = {1, 2}
        namespace = {"load_state": lambda: state, "pid_alive": lambda pid: pid in alive, "port_open": lambda _: True}
        exec(code, namespace)
        self.assertTrue(namespace["ready"]())
        alive.discard(2)
        self.assertFalse(namespace["ready"]())
        alive.add(2)
        state["ready"] = False
        self.assertFalse(namespace["ready"]())


if __name__ == "__main__":
    unittest.main()
