"""Optional loopback-only tunnel tests using the deployed frpc/frps version.

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
    def setUp(self):
        tmp = tempfile.TemporaryDirectory(prefix="solace-frp-integration-")
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.server_port, self.group_port = free_port(), free_port()

    def run_binary(self, binary, config, name):
        log = open(self.root / f"{name}.log", "w")
        self.addCleanup(log.close)
        process = subprocess.Popen([os.environ[binary], "-c", str(config)], stdout=log, stderr=subprocess.STDOUT)
        self.addCleanup(process.wait)
        self.addCleanup(process.kill)
        return process

    def start_frps(self, text):
        config = self.root / "frps.toml"
        config.write_text(text)
        self.run_binary("FRPS_TEST_BINARY", config, "frps")

    def container(self, name, joins=True, **env):
        config = self.root / name / "frpc.toml"
        config.parent.mkdir()
        # Recovery mode drops the smtp proxy, whose local port 25 needs root; http exercises the same group code.
        text = render_frpc_config(config, FRPS_PORT=str(self.server_port), FRPC_OWNER=name, RECOVERY_MODE="true",
                                  STALWART_HTTP_PORT=str(tag_server(name)), FRPC_ADMIN_PORT=str(free_port()),
                                  FRPC_RELAY_LOCAL_PORT=str(free_port()), **env)
        config.write_text(text.replace("remotePort = 18080", f"remotePort = {self.group_port}"))
        process = self.run_binary("FRPC_TEST_BINARY", config, name)
        deadline = time.monotonic() + (20 if joins else 6)
        while name not in {hit(self.group_port) for _ in range(4)}:
            if time.monotonic() >= deadline:
                if joins:
                    self.fail(f"{name} never joined the http group")
                return process
            time.sleep(0.2)
        if not joins:
            self.fail(f"{name} joined the http group without a client certificate")
        return process

    def test_deploy_overlap_hands_over_without_failed_connections(self):
        self.start_frps(f'bindAddr = "127.0.0.1"\nbindPort = {self.server_port}\n'
                        'proxyBindAddr = "127.0.0.1"\nauth.token = "test-only"\n')
        old = self.container("old")
        self.container("new")
        self.assertEqual({hit(self.group_port) for _ in range(10)}, {"old", "new"})

        old.terminate()
        old.wait(timeout=5)
        self.assertEqual({hit(self.group_port) for _ in range(200)}, {"new"})


if __name__ == "__main__":
    unittest.main()
