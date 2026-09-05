"""Offline regression coverage for slot cutover and frpc recovery."""

import concurrent.futures
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
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
supervisor = load("frpc_supervisor", ROOT / "frpc-supervisor.py")


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


class FakeTunnel:
    next_pid = 100

    def __init__(self, name, *_):
        self.name = name
        self.lease_until = self.renew_at = self.started_at = self.retry_at = 0
        self.ready = self.alive_value = False
        self.will_ready = True
        self.starts = 0
        self.stops = 0
        self.pid = 0

    def alive(self):
        return self.alive_value

    def start(self):
        self.starts += 1
        FakeTunnel.next_pid += 1
        self.pid = FakeTunnel.next_pid
        self.alive_value = True
        self.ready = False
        self.started_at = supervisor.time.monotonic()
        return True

    def stop(self):
        self.stops += 1
        self.alive_value = self.ready = False

    def check_ready(self):
        self.ready = self.alive_value and self.will_ready

    def snapshot(self):
        return {"pid": self.pid if self.alive_value else 0, "ready": self.alive_value and self.ready}


class SupervisorTests(CoordinationFixture):
    def setUp(self):
        super().setUp()
        self.requests = []
        self.fail_paths = set()
        self.slow_paths = {}
        self.gate = Path(self.tmp.name, "gate.json")
        self.state = Path(self.tmp.name, "health.json")
        env = patch.dict(os.environ, {"FRPC_SLOT": "green", "FRPC_STATE_PATH": str(self.state),
                                     "HEALTH_STATE_PATH": str(self.gate), "FRPC_STANDBY_ENABLED": "true"})
        env.start()
        self.addCleanup(env.stop)
        for name, value in {"Tunnel": FakeTunnel, "log": lambda *_: None,
                            "time": types.SimpleNamespace(monotonic=lambda: self.now)}.items():
            p = patch.object(supervisor, name, value)
            p.start()
            self.addCleanup(p.stop)
        self.api = types.SimpleNamespace(owner="incumbent", request=self.api_request)
        self.s = supervisor.Supervisor(self.api)

    def api_request(self, path, slot=None, timeout=2):
        self.requests.append((path, slot))
        self.now += self.slow_paths.get(path, 0)
        if path in self.fail_paths:
            return None
        if path == "/status":
            return manager.read_status()
        code, result = manager.coordinate_slot(path, slot, self.api.owner)
        return result if code == 200 else None

    def step(self, seconds=1):
        self.now += seconds
        self.s.tick()

    def boot(self, standby=True):
        self.s.tick()
        self.step()
        self.assertTrue(json.loads(self.state.read_text())["boot_ready"])
        self.active = "green"
        self.s.standby_enabled = standby
        self.gate.write_text('{"ready":true}')
        self.step()
        self.step()

    def test_happy_path_holds_both_slots_only_after_gate(self):
        self.s.tick()
        self.assertEqual(self.s.slots["blue"].starts, 0)
        self.step()
        self.active = "green"
        self.gate.write_text('{"ready":true}')
        self.step()
        self.assertTrue(all(t.alive() for t in self.s.slots.values()))

    def test_primary_crash_keeps_standby_and_publishes_replacement_pid(self):
        self.boot()
        primary = self.s.slots["green"]
        old_pid = primary.pid
        primary.alive_value = False
        primary.will_ready = False
        self.step()
        snapshot = json.loads(self.state.read_text())
        self.assertNotEqual(snapshot["slots"]["green"]["pid"], old_pid)
        self.assertFalse(snapshot["slots"]["green"]["ready"])
        self.assertTrue(snapshot["slots"]["blue"]["ready"])
        primary.will_ready = True
        self.step(121)
        self.step(6)
        self.step()
        self.assertTrue(json.loads(self.state.read_text())["slots"]["green"]["ready"])

    def test_relay_late_recovery_updates_state_without_other_restart(self):
        self.boot()
        self.s.relay.alive_value = False
        self.s.relay.will_ready = False
        self.step(5)
        self.assertFalse(json.loads(self.state.read_text())["relay"]["ready"])
        self.s.relay.will_ready = True
        self.step()
        self.assertTrue(json.loads(self.state.read_text())["relay"]["ready"])

    def test_relay_soft_timeout_does_not_postpone_retry_forever(self):
        self.boot()
        self.s.relay.will_ready = False
        self.step(31)
        self.assertFalse(self.s.relay.alive())
        self.step(1)
        self.s.relay.will_ready = True
        self.step(4)
        self.assertTrue(self.s.relay.ready)

    def test_repeated_relay_crashes_are_bounded_during_boot(self):
        self.s.relay.will_ready = False
        self.s.tick()
        for _ in range(5):
            self.s.relay.alive_value = False
            self.step(5)
        with self.assertRaisesRegex(RuntimeError, "Relay readiness"):
            self.step(5)

    def test_repeated_primary_crashes_do_not_reset_boot_deadline(self):
        self.s.slots["green"].will_ready = False
        self.s.tick()
        for _ in range(23):
            self.s.slots["green"].alive_value = False
            self.step(5)
        with self.assertRaisesRegex(RuntimeError, "Primary proxy readiness"):
            self.step(5)

    def test_standby_timeout_is_soft_and_retried(self):
        self.boot()
        standby = self.s.slots["blue"]
        standby.will_ready = False
        # Keep leases renewed while readiness times out.
        for _ in range(25):
            self.step(5)
        self.assertGreaterEqual(standby.stops, 1)
        self.assertTrue(self.s.slots["green"].ready)
        standby.will_ready = True
        self.step(6)
        self.step()
        self.assertTrue(standby.ready)

    def test_preempt_releases_then_abandoned_deploy_allows_retry(self):
        self.boot()
        self.active = "green"
        self.request("/preempt", slot="blue", owner="peer")
        self.step()
        self.assertFalse(self.s.slots["blue"].alive())
        self.assertEqual(self.request("/lease/claim", slot="blue", owner="peer"), 200)
        for _ in range(20):
            self.step(5)
        self.assertTrue(self.s.slots["blue"].alive())

    def test_preempt_after_failover_releases_original_primary(self):
        self.boot()
        self.active = "blue"
        self.request("/preempt", slot="green", owner="peer")
        self.step()
        self.assertFalse(self.s.slots["green"].alive())
        self.assertTrue(self.s.slots["blue"].alive())

    def test_standby_restart_does_not_block_peer_preemption(self):
        self.boot()
        standby = self.s.slots["blue"]
        standby.alive_value = False
        standby.will_ready = False
        before = self.now
        self.step()
        self.assertEqual(self.now, before + 1)
        self.request("/preempt", slot="blue", owner="peer")
        self.step()
        self.assertFalse(standby.alive())

    def test_disabled_standby_never_claims_second_slot(self):
        self.boot(standby=False)
        self.assertEqual(self.s.slots["blue"].starts, 0)
        self.assertNotIn(("/lease/claim", "blue"), self.requests)

    def test_failed_preempt_never_launches_primary(self):
        self.fail_paths.add("/preempt")
        self.s.tick()
        self.assertFalse(self.s.bound)
        with self.assertRaisesRegex(RuntimeError, "vacancy deadline"):
            self.step(60)
        self.assertEqual(self.s.slots["green"].starts, 0)

    def test_unknown_status_never_launches(self):
        self.fail_paths.add("/status")
        self.s.tick()
        self.assertFalse(self.s.bound)

    def test_old_slot_manager_is_rejected(self):
        with patch.object(manager, "read_status", return_value={"active": "blue"}):
            with self.assertRaisesRegex(RuntimeError, "protocol v2"):
                self.s.tick()
        self.assertFalse(self.s.bound)

    def test_late_lease_response_is_not_permission_to_launch(self):
        self.slow_paths["/lease/claim"] = 30
        self.s.tick()
        self.assertFalse(self.s.bound)
        self.assertEqual(self.s.slots["green"].starts, 0)

    def test_api_outage_stops_before_server_lease_expiry(self):
        self.boot()
        self.fail_paths.update({"/status", "/lease/renew"})
        self.step(26)
        self.assertTrue(all(not t.alive() for t in self.s.slots.values()))


class ProcessAndHealthTests(unittest.TestCase):
    def test_expired_pending_launch_never_starts_a_process(self):
        tunnel = supervisor.Tunnel("blue", "unused", "unused", 7400)
        tunnel.lease_until = time.monotonic() - 1
        with patch.object(supervisor.subprocess, "Popen") as spawn:
            self.assertFalse(tunnel.start())
        spawn.assert_not_called()

    def test_start_returns_promptly_and_reaps_child_on_stop(self):
        with tempfile.TemporaryDirectory(prefix="solace-frpc-process-") as tmp:
            tunnel = supervisor.Tunnel("blue", "import time; print('started', flush=True); time.sleep(60)",
                                       str(Path(tmp, "frpc.log")))
            with patch.dict(os.environ, {"FRPC_BINARY": sys.executable}):
                started = time.monotonic()
                tunnel.start()
                process = tunnel.process
                try:
                    self.assertLess(time.monotonic() - started, 1)
                    self.assertTrue(tunnel.alive())
                finally:
                    tunnel.stop()
                self.assertIsNotNone(process.poll())

    def test_ready_uses_current_status_not_successful_old_log(self):
        tunnel = supervisor.Tunnel("blue", "unused", "unused", 7400)
        with patch.object(tunnel, "alive", return_value=True), patch.object(
            supervisor.urllib.request, "urlopen",
            return_value=io.BytesIO(b'{"tcp":[{"name":"smtp-blue","status":"running"},'
                                   b'{"name":"https-blue","status":"error"}]}'),
        ):
            tunnel.check_ready()
        self.assertFalse(tunnel.ready)

    def test_missing_token_fails_before_any_service_is_started(self):
        env = {"PATH": os.environ["PATH"], "PGHOST": "test", "PGUSER": "test", "PGPASSWORD": "test",
               "FRPS_ADDR": "test", "FRPC_TOKEN": "test"}
        result = subprocess.run(["sh", str(ROOT / "railway-entrypoint.sh")], env=env,
                                capture_output=True, text=True, timeout=3)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("SLOT_MANAGER_TOKEN is required", result.stderr)

    def test_health_requires_same_tunnel_alive_and_ready_and_fresh_state(self):
        source = (ROOT / "railway-entrypoint.sh").read_text()
        code = "def ready():" + source.split("def ready():", 1)[1].split("\ndef handle(conn):", 1)[0]
        with tempfile.TemporaryDirectory(prefix="solace-health-") as tmp:
            path = Path(tmp, "state.json")
            state = {"ready": True, "stalwart_pid": 1, "frpc_state_path": str(path)}
            namespace = {"json": json, "time": time, "load_state": lambda: state,
                         "pid_alive": lambda pid: pid in (1, 2, 4, 5), "port_open": lambda _: True}
            exec(code, namespace)
            snapshot = {"updated": time.monotonic(), "supervisor_pid": 5,
                        "relay": {"pid": 2, "ready": True},
                        "slots": {"blue": {"pid": 3, "ready": True}, "green": {"pid": 4, "ready": False}}}
            supervisor.atomic_json(path, snapshot)
            self.assertFalse(namespace["ready"]())
            snapshot["slots"]["green"]["ready"] = True
            supervisor.atomic_json(path, snapshot)
            self.assertTrue(namespace["ready"]())
            snapshot["updated"] -= 20
            supervisor.atomic_json(path, snapshot)
            self.assertFalse(namespace["ready"]())


if __name__ == "__main__":
    unittest.main()
