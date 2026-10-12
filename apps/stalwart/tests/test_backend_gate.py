"""Optional loopback test of backend-gate.cfg with a real HAProxy; set HAPROXY_TEST_BINARY to run it."""

import hashlib
import ipaddress
import os
import socket
import struct
import subprocess
import threading
import time
import unittest
import urllib.error
import urllib.request

from test_mail_ha import ROOT

KEY = "k" * 64
PROXY_V2_SIGNATURE = b"\r\n\r\n\x00\r\nQUIT\n"


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def read_exact(conn, size):
    data = b""
    while len(data) < size:
        chunk = conn.recv(size - len(data))
        if not chunk:
            raise ConnectionError("upstream closed early")
        data += chunk
    return data


class ProxyV2Upstream:
    """Stands in for Stalwart: records the PROXY v2 source, path and headers of each request."""

    def __init__(self):
        self.requests = []
        self.sock = socket.create_server(("127.0.0.1", 0))
        self.port = self.sock.getsockname()[1]
        threading.Thread(target=self.serve, daemon=True).start()

    def serve(self):
        while True:
            conn, _ = self.sock.accept()
            threading.Thread(target=self.handle, args=(conn,), daemon=True).start()

    def handle(self, conn):
        with conn:
            header = read_exact(conn, 16)
            if header[:12] != PROXY_V2_SIGNATURE:
                return
            family, length = header[13], struct.unpack("!H", header[14:16])[0]
            addresses = read_exact(conn, length)
            source = (ipaddress.IPv4Address(addresses[:4]) if family == 0x11
                      else ipaddress.IPv6Address(addresses[:16]))
            raw = b""
            while b"\r\n\r\n" not in raw:
                chunk = conn.recv(4096)
                if not chunk:
                    return
                raw += chunk
            lines = raw.split(b"\r\n\r\n", 1)[0].decode().split("\r\n")
            headers = {k.strip().lower(): v.strip()
                       for k, v in (line.split(":", 1) for line in lines[1:])}
            self.requests.append({"source": str(source), "path": lines[0].split(" ")[1],
                                  "headers": headers})
            conn.sendall(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok")


@unittest.skipUnless(os.environ.get("HAPROXY_TEST_BINARY"), "set HAPROXY_TEST_BINARY for the gate test")
class BackendGateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.upstream = ProxyV2Upstream()
        cls.gate_port = free_port()
        env = {**os.environ, "STALWART_GATE_PORT": str(cls.gate_port),
               "STALWART_HTTP_PORT": str(cls.upstream.port),
               "STALWART_GATE_KEY_SHA256": hashlib.sha256(KEY.encode()).hexdigest()}
        cls.gate = subprocess.Popen([os.environ["HAPROXY_TEST_BINARY"], "-db", "-f",
                                     str(ROOT / "backend-gate.cfg")], env=env)
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            with socket.socket() as sock:
                if sock.connect_ex(("127.0.0.1", cls.gate_port)) == 0:
                    return
            time.sleep(0.1)
        raise RuntimeError("gate did not start")

    @classmethod
    def tearDownClass(cls):
        cls.gate.terminate()
        cls.gate.wait(timeout=5)

    def request(self, path, method="GET", key=KEY, headers=None):
        all_headers = dict(headers or {})
        if key is not None:
            all_headers["X-Solace-Gate"] = key
        req = urllib.request.Request(f"http://127.0.0.1:{self.gate_port}{path}", method=method,
                                     headers=all_headers, data=b"" if method == "POST" else None)
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status
        except urllib.error.HTTPError as error:
            return error.code

    def test_rejects_missing_or_wrong_key(self):
        self.assertEqual(self.request("/jmap/session", key=None), 404)
        self.assertEqual(self.request("/jmap/session", key="wrong"), 404)

    def test_allows_only_backend_paths(self):
        for path in ("/admin", "/login", "/account", "/oauth/x", "/api/principal", "/"):
            self.assertEqual(self.request(path), 404, path)
        self.assertEqual(self.request("/api/auth"), 404)
        self.assertEqual(self.request("/api/auth", method="POST"), 200)
        self.assertEqual(self.request("/auth/token", method="POST"), 200)
        self.assertEqual(self.request("/jmap/download/a/b/c"), 200)

    def test_forwards_real_ip_rewrites_discovery_and_strips_key(self):
        before = len(self.upstream.requests)
        self.assertEqual(self.request("/.well-known/jmap", headers={"X-Real-IP": "203.0.113.7"}), 200)
        forwarded = self.upstream.requests[before]
        self.assertEqual(forwarded["path"], "/jmap/session")
        self.assertEqual(forwarded["source"], "203.0.113.7")
        self.assertNotIn("x-solace-gate", forwarded["headers"])


if __name__ == "__main__":
    unittest.main()
