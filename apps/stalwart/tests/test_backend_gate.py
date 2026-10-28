"""Optional loopback test of backend-gate.cfg with a real HAProxy; set HAPROXY_TEST_BINARY to run it."""

import hashlib
import ipaddress
import os
import socket
import struct
import subprocess
import tempfile
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
        self.response_headers = []
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
            if family not in (0x11, 0x21):
                return
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
            extra_headers = "".join(f"{name}: {value}\r\n" for name, value in self.response_headers)
            conn.sendall(("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n"
                          + extra_headers + "\r\nok").encode())


@unittest.skipUnless(os.environ.get("HAPROXY_TEST_BINARY"), "set HAPROXY_TEST_BINARY for the gate test")
class BackendGateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.upstream = ProxyV2Upstream()
        cls.gate_port = free_port()
        cls.public_port = free_port()
        cls.allow_dir = tempfile.TemporaryDirectory(prefix="solace-admin-allow-")
        cls.allow_file = os.path.join(cls.allow_dir.name, "operators")
        with open(cls.allow_file, "w") as handle:
            handle.write("203.0.113.11/32\n2001:db8:1::/64\n")
        env = {**os.environ, "SOLACE_ADMIN_AUTH_URL": "", "STALWART_GATE_PORT": str(cls.gate_port),
               "STALWART_GATE_LUA_PATH": str(ROOT / "admin-gate.lua"),
               "STALWART_PUBLIC_PORT": str(cls.public_port),
               "STALWART_ADMIN_ALLOW_FILE": cls.allow_file,
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
        cls.allow_dir.cleanup()

    def request(self, path, method="GET", key=KEY, headers=None, public=False):
        all_headers = dict(headers or {})
        if key is not None:
            all_headers["X-Solace-Gate"] = key
        port = self.public_port if public else self.gate_port
        req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", method=method,
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

    def test_public_jmap_works_without_private_key_or_vps(self):
        for path in ("/jmap/session", "/jmap/", "/jmap/download/a/b/name.txt", "/jmap/upload/a/",
                     "/jmap/eventsource", "/.well-known/jmap", "/.well-known/mta-sts.txt",
                     "/api/discover", "/metrics/prometheus",
                     "/mail/config-v1.1.xml", "/autodiscover/autodiscover.xml", "/autodiscover/autodiscover.json"):
            self.assertEqual(self.request(path, key=None, public=True), 200, path)

    def test_public_gateway_blocks_management_and_normalization_bypasses(self):
        for path in ("/", "/admin", "/admin/oauth/callback", "/login", "/account", "/oauth/authorize",
                     "/api/principal", "/api/auth", "/auth/code", "/auth/token", "/auth/register",
                     "/device", "/logo", "/healthz/ready", "/jmap/../admin",
                     "/jmap/%2e%2e/admin", "/jmap/%2e%2e%2fadmin", "/auth/../../admin",
                     "//admin", "/api/auth/../principal", "/metrics/prometheus/../admin"):
            before = len(self.upstream.requests)
            self.assertEqual(self.request(path, public=True), 404, path)
            self.assertEqual(len(self.upstream.requests), before, path)

    def test_public_gateway_forwards_auth_and_client_ip_without_gate_key(self):
        before = len(self.upstream.requests)
        headers = {"X-Real-IP": "203.0.113.9", "Authorization": "Bearer mailbox-test-token"}
        self.assertEqual(self.request("/jmap/", method="POST", headers=headers, public=True), 200)
        forwarded = self.upstream.requests[before]
        self.assertEqual(forwarded["source"], "203.0.113.9")
        self.assertEqual(forwarded["headers"]["authorization"], "Bearer mailbox-test-token")
        self.assertNotIn("x-solace-gate", forwarded["headers"])
        self.assertEqual(self.request("/jmap/session", key=None), 404)

    def test_public_gateway_preserves_ipv6_client_addresses(self):
        before = len(self.upstream.requests)
        self.assertEqual(self.request("/jmap/session", headers={"X-Real-IP": "2001:db8::9"}, public=True), 200)
        self.assertEqual(self.upstream.requests[before]["source"], "2001:db8::9")

    def test_direct_stalwart_login_requires_the_operator_network(self):
        for source in ("203.0.113.11", "2001:db8:1::9"):
            for path in ("/login", "/admin", "/account", "/api/auth", "/auth/token"):
                self.assertEqual(self.request(path, headers={"X-Real-IP": source}, key=None, public=True), 200)
        for headers in ({}, {"X-Real-IP": "203.0.113.12"}, {"X-Real-IP": "invalid"},
                        {"X-Forwarded-For": "203.0.113.11"}):
            self.assertEqual(self.request("/login", headers=headers, public=True), 404)

    def test_empty_operator_allowlist_denies_direct_login(self):
        with open(self.allow_file, "w") as handle:
            handle.write("")
        # HAProxy keeps its parsed rules in memory; a new process must load the empty list.
        env = {**os.environ, "SOLACE_ADMIN_AUTH_URL": "", "STALWART_GATE_PORT": str(free_port()),
               "STALWART_GATE_LUA_PATH": str(ROOT / "admin-gate.lua"),
               "STALWART_PUBLIC_PORT": str(free_port()), "STALWART_HTTP_PORT": str(self.upstream.port),
               "STALWART_ADMIN_ALLOW_FILE": self.allow_file,
               "STALWART_GATE_KEY_SHA256": hashlib.sha256(KEY.encode()).hexdigest()}
        gate = subprocess.Popen([os.environ["HAPROXY_TEST_BINARY"], "-db", "-f", str(ROOT / "backend-gate.cfg")], env=env)
        try:
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                try:
                    req = urllib.request.Request(f'http://127.0.0.1:{env["STALWART_PUBLIC_PORT"]}/login',
                                                 headers={"X-Real-IP": "203.0.113.11"})
                    urllib.request.urlopen(req, timeout=1)
                    self.fail("empty allowlist granted administrator access")
                except urllib.error.HTTPError as error:
                    self.assertEqual(error.code, 404)
                    break
                except urllib.error.URLError:
                    time.sleep(0.05)
            else:
                self.fail("gateway did not start")
        finally:
            gate.terminate()
            gate.wait(timeout=5)

    def test_vps_rollback_route_also_blocks_direct_user_authentication(self):
        with tempfile.TemporaryDirectory(prefix="solace-vps-auth-") as tmp:
            config = (ROOT / "vps/haproxy.cfg").read_text()
            public_port = free_port()
            bindings = []
            for line in config.splitlines():
                if line.strip().startswith("bind "):
                    port = public_port if "*:443" in line else free_port()
                    line = f"    bind 127.0.0.1:{port}"
                bindings.append(line)
            config = "\n".join(bindings).replace("global\n", "global\n    thread-hard-limit 8\n", 1)
            allow_file = os.path.join(tmp, "operators")
            with open(allow_file, "w") as handle:
                handle.write("203.0.113.11/32\n")
            config = config.replace("/etc/haproxy/admin-allow.lst", allow_file)
            config = config.replace("127.0.0.1:18080", f"127.0.0.1:{self.upstream.port}")
            config = config.replace("127.0.0.1:10025", f"127.0.0.1:{self.upstream.port}")
            config = config.replace("/run/haproxy/admin.sock", os.path.join(tmp, "admin.sock"))
            config_file = os.path.join(tmp, "haproxy.cfg")
            with open(config_file, "w") as handle:
                handle.write(config + "\n")
            gate = subprocess.Popen([os.environ["HAPROXY_TEST_BINARY"], "-db", "-f", config_file],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                deadline = time.monotonic() + 5
                while time.monotonic() < deadline:
                    with socket.socket() as sock:
                        if sock.connect_ex(("127.0.0.1", public_port)) == 0:
                            break
                    time.sleep(0.05)
                for path in ("/login", "/admin", "/api/auth", "/auth/token", "/auth/register", "/device"):
                    req = urllib.request.Request(f"http://127.0.0.1:{public_port}{path}",
                                                 headers={"X-Real-IP": "203.0.113.11"})
                    with self.assertRaises(urllib.error.HTTPError) as error:
                        urllib.request.urlopen(req, timeout=3)
                    self.assertEqual(error.exception.code, 404)
                with urllib.request.urlopen(f"http://127.0.0.1:{public_port}/jmap/session", timeout=3) as response:
                    self.assertEqual(response.status, 200)
            finally:
                gate.terminate()
                gate.wait(timeout=5)


if __name__ == "__main__":
    unittest.main()
