"""Optional loopback-only cutover test using the deployed frpc/frps version.

Run with FRPC_TEST_BINARY and FRPS_TEST_BINARY set to existing binaries.
No production credentials, ports or mailbox operations are used.
"""

import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from test_mail_ha import ROOT, FakeTunnel, load

manager = load("integration_manager", ROOT / "vps/stalwart-slot-manager.py")
supervisor = load("integration_supervisor", ROOT / "frpc-supervisor.py")


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@unittest.skipUnless(os.environ.get("FRPC_TEST_BINARY") and os.environ.get("FRPS_TEST_BINARY"),
                     "set FRPC_TEST_BINARY and FRPS_TEST_BINARY for loopback frp integration")
class FrpcIntegrationTests(unittest.TestCase):
    def test_real_frpc_cutover_crash_recovery_and_preempt_after_failover(self):
        with tempfile.TemporaryDirectory(prefix="solace-frp-integration-") as tmp:
            root = Path(tmp)
            server_port, dashboard = free_port(), free_port()
            frps_config = root / "frps.toml"
            frps_config.write_text(f'bindAddr = "127.0.0.1"\nbindPort = {server_port}\n'
                                   f'proxyBindAddr = "127.0.0.1"\nwebServer.addr = "127.0.0.1"\n'
                                   f'webServer.port = {dashboard}\nauth.method = "token"\n'
                                   'auth.token = "test-only"\n')
            output = open(root / "frps.log", "w")
            frps = subprocess.Popen([os.environ["FRPS_TEST_BINARY"], "-c", str(frps_config)],
                                    stdout=output, stderr=subprocess.STDOUT)
            active_file = root / "active"
            active_file.write_text("green")
            manager_patches = patch.multiple(manager, ACTIVE_SLOT_FILE=str(active_file),
                                            PREEMPT_DIR=str(root / "leases"), AUTH_TOKEN="test-only",
                                            FRPS_DASHBOARD=f"http://127.0.0.1:{dashboard}")
            manager_patches.start()
            http = manager.ThreadingHTTPServer(("127.0.0.1", 0), manager.Handler)
            threading.Thread(target=http.serve_forever, daemon=True).start()
            supervisors = []
            ports = {slot: (free_port(), free_port()) for slot in ("blue", "green")}
            env = patch.dict(os.environ, {"SLOT_MANAGER_URL": f"http://127.0.0.1:{http.server_port}",
                                         "SLOT_MANAGER_TOKEN": "test-only", "RECOVERY_MODE": "false",
                                         "FRPC_BINARY": os.environ["FRPC_TEST_BINARY"]})
            env.start()

            def new_deploy(owner, slot):
                directory = root / owner
                directory.mkdir()
                with patch.dict(os.environ, {"FRPC_SLOT": slot, "FRPC_OWNER": owner,
                                             "FRPC_STATE_PATH": str(directory / "state.json"),
                                             "HEALTH_STATE_PATH": str(directory / "gate.json")}):
                    s = supervisor.Supervisor()
                s.relay = FakeTunnel("relay")  # Relay recovery is covered in the offline suite.
                for color, tunnel in s.slots.items():
                    tunnel.config = str(directory / f"{color}.toml")
                    tunnel.log_path = str(directory / f"{color}.log")
                    tunnel.admin_port = free_port()
                    config = (f'serverAddr = "127.0.0.1"\nserverPort = {server_port}\n'
                              f'loginFailExit = false\nwebServer.addr = "127.0.0.1"\n'
                              f'webServer.port = {tunnel.admin_port}\nauth.method = "token"\n'
                              'auth.token = "test-only"\n')
                    for name, remote in zip(("smtp", "https"), ports[color]):
                        config += (f'\n[[proxies]]\nname = "{name}-{color}"\ntype = "tcp"\n'
                                   f'localIP = "127.0.0.1"\nlocalPort = 1\nremotePort = {remote}\n')
                    Path(tunnel.config).write_text(config)
                supervisors.append(s)
                return s

            def until(predicate, running, timeout=20):
                deadline = time.monotonic() + timeout
                while time.monotonic() < deadline:
                    for s in running:
                        s.tick()
                    if predicate():
                        return
                    time.sleep(0.1)
                self.fail("Timed out waiting for isolated frp state transition")

            def promote(s):
                active_file.write_text(s.boot_slot)
                Path(s.gate_path).write_text('{"ready":true}')

            try:
                deadline = time.monotonic() + 5
                while not supervisor.port_open(server_port):
                    self.assertLess(time.monotonic(), deadline)
                    time.sleep(0.05)
                first = new_deploy("first", "blue")
                until(lambda: json.loads(Path(first.path).read_text())["boot_ready"], [first])
                promote(first)
                until(lambda: all(t.ready for t in first.slots.values()), [first])

                # A real dead primary gets reaped/replaced while standby stays ready.
                original_pid = first.slots["blue"].process.pid
                first.slots["blue"].process.kill()
                first.slots["blue"].process.wait()
                first.tick()
                self.assertTrue(first.slots["green"].ready)
                until(lambda: first.slots["blue"].ready, [first])
                self.assertNotEqual(first.slots["blue"].process.pid, original_pid)

                second = new_deploy("second", "green")
                until(lambda: json.loads(Path(second.path).read_text())["boot_ready"], [first, second])
                self.assertFalse(first.slots["green"].alive())
                self.assertEqual(manager.read_status()["greenOwner"], "second")
                promote(second)
                for tunnel in first.slots.values():
                    first.release(tunnel)
                until(lambda: all(t.ready for t in second.slots.values()), [second])

                # Model watcher promotion, then a subsequent deployment targeting
                # the incumbent's original primary (now the inactive slot).
                active_file.write_text("blue")
                code, _ = manager.coordinate_slot("/preempt", "green", "third")
                self.assertEqual(code, 200)
                until(lambda: not second.slots["green"].alive(), [second])
                self.assertTrue(second.slots["blue"].ready)
                until(lambda: not manager.read_status()["greenOccupied"], [second])
                self.assertEqual(manager.coordinate_slot("/lease/claim", "green", "third")[0], 200)
            finally:
                for s in supervisors:
                    for tunnel in s.slots.values():
                        s.release(tunnel)
                http.shutdown()
                http.server_close()
                frps.terminate()
                frps.wait(timeout=3)
                output.close()
                env.stop()
                manager_patches.stop()


if __name__ == "__main__":
    unittest.main()
