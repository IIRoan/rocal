"""Offline regression coverage for the container's tunnel boot and shutdown."""

import base64
import os
from pathlib import Path
import re
import subprocess
import tempfile
import tomllib
import unittest

ROOT = Path(__file__).resolve().parents[1]
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
