"""Run the entrypoint phase ordering and health policy with bounded synthetic children."""

import base64
import http.server
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import threading
import unittest
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
ENTRYPOINT = (ROOT / "railway-entrypoint.sh").read_text()


def functions(*names):
    return "".join(re.search(rf"^{name}\(\) \{{\n.*?^\}}\n", ENTRYPOINT, re.M | re.S).group(0) for name in names)


class PhaseTests(unittest.TestCase):
    def phase(self, mode, fail=None):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            body = ENTRYPOINT
            mocks = []
            for name in ("write_store_config", "validate_upgrade_configuration", "start_health_server", "start_recovery", "render_service_allowlist", "verify_current_policy", "stop_recovery", "start_stalwart", "verify_stalwart_cluster", "apply_stalwart_plan", "start_gate", "update_relay_route", "start_frpc", "write_health_state"):
                result = "; return 1" if fail == name else ""
                if name == "verify_current_policy":
                    result = "; exit 1" if fail == name else ""
                mocks.append(f'{name}() {{ printf "%s\\n" "{name}" >> "$CALLS"{result}; }}')
            mocks += ['supervise_prepare() { printf "prepare-held\\n" >> "$CALLS"; exit 0; }', 'mark_health_ready() { printf "ready:%s:%s\\n" "$UPGRADE_PHASE" "$STALWART_HELD_MODE" >> "$CALLS"; exit 0; }']
            prefix, main = body.split("# --- main ---", 1)
            script = path / "entrypoint.sh"
            script.write_text(prefix + "\n" + "\n".join(mocks) + "\n" + main)
            calls = path / "calls"
            env = {"PATH": os.environ["PATH"], "CALLS": str(calls), "PGHOST": "test", "PGUSER": "test", "PGPASSWORD": "test", "FRPS_ADDR": "test", "FRPC_TOKEN": "test", "FRPC_RELAY_STCP_KEY": "test", "STALWART_GATE_KEY": "g"*32, "STALWART_REDIS_URL": "redis://test", "STALWART_WEBHOOK_SECRET": "test", "STALWART_UPGRADE_PHASE": mode}
            result = subprocess.run(["sh", str(script)], env=env, capture_output=True, text=True, timeout=5)
            return result, calls.read_text().splitlines()

    def test_prepare_never_starts_ordinary_workers_or_gates(self):
        result, calls = self.phase("prepare")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("prepare-held", calls)
        self.assertNotIn("start_stalwart", calls)
        self.assertNotIn("start_gate", calls)
        self.assertNotIn("start_frpc", calls)

    def test_failed_verification_has_no_ordinary_fallback(self):
        result, calls = self.phase("ordinary", "verify_current_policy")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("start_stalwart", calls)
        self.assertNotIn("start_gate", calls)
        self.assertNotIn("start_frpc", calls)

    def test_ordinary_verifies_and_exits_recovery_before_normal_exposure(self):
        result, calls = self.phase("ordinary")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertLess(calls.index("verify_current_policy"), calls.index("stop_recovery"))
        self.assertLess(calls.index("stop_recovery"), calls.index("start_stalwart"))
        self.assertLess(calls.index("apply_stalwart_plan"), calls.index("verify_current_policy"))
        self.assertLess(calls.index("verify_stalwart_cluster"), calls.index("start_stalwart"))
        self.assertEqual(calls.count("apply_stalwart_plan"), 1)
        self.assertLess(calls.index("start_gate"), calls.index("start_frpc"))

    def test_held_opens_only_private_gate_after_verification(self):
        result, calls = self.phase("held")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("start_gate", calls)
        self.assertIn("ready:held:true", calls)
        self.assertNotIn("update_relay_route", calls)
        self.assertNotIn("start_frpc", calls)

    def test_existing_management_listener_refuses_before_starting_another_child(self):
        script = 'die() { exit 7; }; port_listening() { return 0; }; STALWART_HTTP_PORT=8080; ' + functions("start_recovery") + "\nstart_recovery"
        result = subprocess.run(["sh", "-euc", script], capture_output=True, timeout=5)
        self.assertEqual(result.returncode, 7)

    def test_recovery_must_exit_and_release_port(self):
        script = functions("stop_recovery")
        result = subprocess.run(["sh", "-euc", 'die() { exit 7; }; port_listening() { return 0; }; STALWART_HTTP_PORT=8080; sleep 30 & STALWART_PID=$!; ' + script + '\nstop_recovery'], capture_output=True, timeout=5)
        self.assertEqual(result.returncode, 7)

    def test_unsupported_phases_ports_and_temporary_credentials_refuse(self):
        base = {"PATH": os.environ["PATH"], "UPGRADE_HELPER": "unused", "UPGRADE_PHASE": "ordinary", "RECOVERY_MODE": "false", "STALWART_HTTP_PORT": "8080", "STALWART_APPROVED_STORE_ID": "1"*64, "STALWART_APPROVED_VERSION": "1.1.0", "STALWART_ADMIN_TOKEN": "test", "STALWART_RECOVERY_ISOLATION": "unrouted-8080"}
        cases = [{"UPGRADE_PHASE": "automatic"}, {"STALWART_HTTP_PORT": "9999"}, {"STALWART_RECOVERY_MODE_PORT": "9999"}, {"STALWART_RECOVERY_ADMIN": "admin:test"}, {"STALWART_UPDATE_ROLE_PERMISSIONS": "true"}, {"STALWART_APPROVED_VERSION": "1.0.0"}]
        for changes in cases:
            with self.subTest(changes=changes):
                result = subprocess.run(["sh", "-euc", 'die() { exit 7; }; ' + functions("validate_upgrade_configuration") + '\nvalidate_upgrade_configuration'], env={**base, **changes}, capture_output=True, timeout=5)
                self.assertEqual(result.returncode, 7)


class HealthTests(unittest.TestCase):
    def health(self, state, store_ready=True):
        code = "def ready():" + ENTRYPOINT.split("def ready():", 1)[1].split("\ndef handle(conn):", 1)[0]
        namespace = {"load_state": lambda: state, "pid_alive": lambda _: True, "port_open": lambda _: True}
        exec(code, namespace)
        namespace["management_ready"] = lambda *args, **kwargs: store_ready
        return namespace

    def test_maintenance_and_held_are_never_ordinary_ready(self):
        for phase in ("prepare", "held"):
            namespace = self.health({"phase": phase, "ready": True, "stalwart_pid": 1})
            self.assertFalse(namespace["ready"]())
            self.assertTrue(namespace["phase_ready"](phase))

    def test_process_liveness_cannot_hide_store_failure(self):
        state = {"phase": "ordinary", "ready": True, "stalwart_pid": 1, "frpc_pid": 2}
        self.assertFalse(self.health(state, store_ready=False)["ready"]())
        self.assertTrue(self.health(state, store_ready=True)["ready"]())

    def test_held_public_gate_has_unconditional_hold_before_authorization(self):
        config = (ROOT / "backend-gate.cfg").read_text()
        public = config.split("frontend ft_public_jmap", 1)[1].split("backend bk_stalwart", 1)[0]
        self.assertLess(public.index("return status 503"), public.index("lua.solace_admin_authorize"))


if __name__ == "__main__":
    unittest.main()
