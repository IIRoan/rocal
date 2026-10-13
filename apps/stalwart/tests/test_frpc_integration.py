"""Optional loopback-only deploy-overlap test using the deployed frpc/frps version.

Run with FRPC_TEST_BINARY and FRPS_TEST_BINARY set to existing binaries.
No production credentials, ports or mailbox operations are used.
"""

import os
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
import unittest

from test_mail_ha import render_frpc_config


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def tag_server(tag):
    server = socket.create_server(("127.0.0.1", 0))

    def serve():
        while True:
            client, _ = server.accept()
            with client:
                client.sendall(tag.encode())

    threading.Thread(target=serve, daemon=True).start()
    return server.getsockname()[1]


def hit(port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=2) as conn:
            return conn.recv(16).decode() or "EMPTY"
    except OSError:
        return "ERROR"


@unittest.skipUnless(os.environ.get("FRPC_TEST_BINARY") and os.environ.get("FRPS_TEST_BINARY"),
                     "set FRPC_TEST_BINARY and FRPS_TEST_BINARY for loopback frp integration")
class FrpGroupIntegrationTests(unittest.TestCase):
    def test_deploy_overlap_hands_over_without_failed_connections(self):
        with tempfile.TemporaryDirectory(prefix="solace-frp-integration-") as tmp:
            root = Path(tmp)
            server_port, group_port = free_port(), free_port()
            (root / "frps.toml").write_text(f'bindAddr = "127.0.0.1"\nbindPort = {server_port}\n'
                                            'proxyBindAddr = "127.0.0.1"\nauth.token = "test-only"\n')

            def run(binary, config, name):
                log = open(root / f"{name}.log", "w")
                self.addCleanup(log.close)
                process = subprocess.Popen([os.environ[binary], "-c", str(config)],
                                           stdout=log, stderr=subprocess.STDOUT)
                self.addCleanup(process.wait)
                self.addCleanup(process.kill)
                return process

            def container(name):
                config = root / f"{name}.toml"
                # Recovery mode drops the smtp proxy, whose local port 25 needs root; http exercises the same group code.
                text = render_frpc_config(config, FRPS_PORT=str(server_port), FRPC_OWNER=name, RECOVERY_MODE="true",
                                          STALWART_HTTP_PORT=str(tag_server(name)), FRPC_ADMIN_PORT=str(free_port()),
                                          FRPC_RELAY_LOCAL_PORT=str(free_port()))
                config.write_text(text.replace("remotePort = 18080", f"remotePort = {group_port}"))
                process = run("FRPC_TEST_BINARY", config, name)
                deadline = time.monotonic() + 20
                while name not in {hit(group_port) for _ in range(4)}:
                    self.assertLess(time.monotonic(), deadline, f"{name} never joined the http group")
                    time.sleep(0.2)
                return process

            run("FRPS_TEST_BINARY", root / "frps.toml", "frps")
            old = container("old")
            container("new")
            self.assertEqual({hit(group_port) for _ in range(10)}, {"old", "new"})

            old.terminate()
            old.wait(timeout=5)
            self.assertEqual({hit(group_port) for _ in range(200)}, {"new"})


if __name__ == "__main__":
    unittest.main()
