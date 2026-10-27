"""Offline regression coverage for the container's tunnel boot and shutdown."""

import base64
import http.server
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import threading
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

    def test_missing_redis_url_fails_before_any_service_is_started(self):
        env = {"PATH": os.environ["PATH"], "PGHOST": "test", "PGUSER": "test", "PGPASSWORD": "test",
               "FRPS_ADDR": "test", "FRPC_TOKEN": "test", "FRPC_RELAY_STCP_KEY": "test", "STALWART_GATE_KEY": "k" * 64}
        result = subprocess.run(["sh", str(ROOT / "railway-entrypoint.sh")], env=env,
                                capture_output=True, text=True, timeout=3)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("STALWART_REDIS_URL is required", result.stderr)

    def test_missing_webhook_secret_fails_before_any_service_is_started(self):
        env = {"PATH": os.environ["PATH"], "PGHOST": "test", "PGUSER": "test", "PGPASSWORD": "test",
               "FRPS_ADDR": "test", "FRPC_TOKEN": "test", "FRPC_RELAY_STCP_KEY": "test", "STALWART_GATE_KEY": "k" * 64,
               "STALWART_REDIS_URL": "redis://:test@redis.test:6379/0"}
        result = subprocess.run(["sh", str(ROOT / "railway-entrypoint.sh")], env=env,
                                capture_output=True, text=True, timeout=3)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("STALWART_WEBHOOK_SECRET is required", result.stderr)

    def test_redis_credentials_are_rendered_without_shell_interpretation(self):
        url = 'redis://:password-with-$(false)-and-"@redis.test:6379/0'
        result = subprocess.run(["sh", "-euc", shell_functions("render_stalwart_plan") +
                                 'render_stalwart_plan "$PLAN"'],
                                env={"PATH": os.environ["PATH"], "PLAN": str(ROOT / "stalwart/plan"),
                                     "STALWART_REDIS_URL": url}, capture_output=True, text=True, check=True)
        entries = [json.loads(line) for line in result.stdout.splitlines()]
        stores = {entry["object"]: entry["value"] for entry in entries if entry.get("object") in ("InMemoryStore", "Coordinator")}
        self.assertEqual(stores["InMemoryStore"]["url"], url)
        self.assertEqual(stores["Coordinator"]["@type"], "Default")

    def test_cluster_guard_rejects_local_or_mismatched_stores(self):
        state = {"memory": {"@type": "Default"}, "coordinator": {"@type": "Disabled"}}

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                self.rfile.read(int(self.headers["Content-Length"]))
                body = {"methodResponses": [["x:InMemoryStore/get", {"list": [state["memory"]]}, "0"],
                                            ["x:Coordinator/get", {"list": [state["coordinator"]]}, "1"]]}
                self.send_response(200)
                self.end_headers()
                self.wfile.write(json.dumps(body).encode())

            def log_message(self, *_args):
                pass

        with http.server.HTTPServer(("127.0.0.1", 0), Handler) as server:
            worker = threading.Thread(target=server.serve_forever, daemon=True)
            worker.start()
            try:
                env = {"PATH": os.environ["PATH"], "STALWART_ADMIN_TOKEN": "test-only",
                       "STALWART_REDIS_URL": "redis://:test@redis.test:6379/0"}
                script = f'stalwart_management_url() {{ echo http://127.0.0.1:{server.server_port}; }}\n'
                script += shell_functions("verify_stalwart_cluster") + "verify_stalwart_cluster\n"
                for memory, coordinator, expected in [
                    ({"@type": "Default"}, "Disabled", False),
                    ({"@type": "Redis", "url": "redis://wrong.test"}, "Default", False),
                    ({"@type": "Redis", "url": env["STALWART_REDIS_URL"]}, "Default", True),
                ]:
                    state.update(memory=memory, coordinator={"@type": coordinator})
                    result = subprocess.run(["sh", "-euc", script], env=env, capture_output=True, text=True, timeout=3)
                    self.assertEqual(result.returncode == 0, expected)
                    self.assertNotIn(env["STALWART_REDIS_URL"], result.stderr)
            finally:
                server.shutdown()
                worker.join()

    def test_unreachable_local_server_never_applies_the_plan_to_the_live_edge(self):
        with tempfile.TemporaryDirectory(prefix="solace-plan-target-") as tmp:
            root = Path(tmp)
            plan = root / "plan"
            plan.mkdir()
            (plan / "settings.ndjson").write_text('{"@type":"update","object":"Http","value":{}}\n')
            applied = root / "applied"
            cli = root / "stalwart-cli"
            cli.write_text('#!/bin/sh\ntouch "$APPLIED"\n')
            cli.chmod(0o755)
            env = {"PATH": tmp + os.pathsep + os.environ["PATH"], "APPLIED": str(applied),
                   "STALWART_ADMIN_TOKEN": "test-only", "STALWART_PLAN_DIR": str(plan),
                   "STALWART_HTTP_PORT": "8080", "STALWART_PUBLIC_URL": "https://old-deployment.invalid"}
            script = ('log() { :; }\ndie() { exit 1; }\nsleep() { :; }\n'
                      'stalwart_management_url() { echo http://192.0.2.1:8080; }\n'
                      'seed_stalwart_cli_schema() { :; }\nreload_stalwart_settings() { :; }\n'
                      'curl() { case "$*" in *old-deployment.invalid*) return 0;; *) return 1;; esac; }\n' +
                      shell_functions("render_stalwart_plan", "apply_stalwart_plan") + "apply_stalwart_plan\n")
            result = subprocess.run(["sh", "-euc", script], env=env, capture_output=True, timeout=3)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(applied.exists(), "the previous live deployment must never receive the new schema")

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

    def test_health_stays_ready_while_the_relay_listener_reconnects(self):
        code = "def ready():" + ENTRYPOINT.split("def ready():", 1)[1].split("\ndef handle(conn):", 1)[0]
        state = {"ready": True, "stalwart_pid": 1, "frpc_pid": 2}
        listening = {25, 8080, 8081}
        namespace = {"load_state": lambda: state, "pid_alive": lambda _: True,
                     "port_open": lambda port: port in listening}
        exec(code, namespace)
        self.assertTrue(namespace["ready"](), "a closed relay must not take the private JMAP gate offline")
        listening.remove(8081)
        self.assertFalse(namespace["ready"](), "the private JMAP gate must still be reachable")


if __name__ == "__main__":
    unittest.main()
