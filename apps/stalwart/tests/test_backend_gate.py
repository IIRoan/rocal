"""Optional loopback test of backend-gate.cfg with a real HAProxy; set HAPROXY_TEST_BINARY to run it."""

import hashlib
import ipaddress
import json
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
        env = {**os.environ, "SOLACE_ADMIN_AUTH_URL": "", "STALWART_GATE_PORT": str(cls.gate_port),
               "STALWART_GATE_LUA_PATH": str(ROOT / "admin-gate.lua"),
               "STALWART_PUBLIC_PORT": str(cls.public_port),
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

    def test_unconfigured_session_gate_denies_direct_stalwart_login(self):
        for headers in ({}, {"X-Real-IP": "203.0.113.11"}, {"X-Real-IP": "2001:db8:1::9"},
                        {"X-Real-IP": "invalid"}, {"X-Forwarded-For": "203.0.113.11"}):
            for path in ("/login", "/admin", "/account", "/api/auth", "/auth/token"):
                before = len(self.upstream.requests)
                self.assertEqual(self.request(path, headers=headers, key=None, public=True), 404, path)
                self.assertEqual(len(self.upstream.requests), before, path)

    def test_vps_passes_tls_through_untouched_with_the_client_address(self):
        received = []
        sink = socket.create_server(("127.0.0.1", 0))

        def accept():
            conn, _ = sink.accept()
            with conn:
                conn.settimeout(3)
                data = b""
                try:
                    while chunk := conn.recv(4096):
                        data += chunk
                except socket.timeout:
                    pass
                received.append(data)

        threading.Thread(target=accept, daemon=True).start()
        with tempfile.TemporaryDirectory(prefix="solace-vps-tls-") as tmp:
            config = (ROOT / "vps/haproxy.cfg").read_text()
            public_port, redirect_port = free_port(), free_port()
            lines = []
            for line in config.splitlines():
                if line.strip().startswith("bind "):
                    port = {"*:443": public_port, "*:80": redirect_port}.get(line.split()[1], free_port())
                    line = f"    bind 127.0.0.1:{port}"
                if "127.0.0.1:18443" in line:
                    # The sink would answer health checks too; the passthrough itself is under test.
                    line = f"    server stalwart 127.0.0.1:{sink.getsockname()[1]} send-proxy-v2"
                lines.append(line)
            config = "\n".join(lines).replace("global\n", "global\n    thread-hard-limit 8\n", 1)
            config = config.replace("/run/haproxy/admin.sock", os.path.join(tmp, "admin.sock"))
            config_file = os.path.join(tmp, "haproxy.cfg")
            with open(config_file, "w") as handle:
                handle.write(config + "\n")
            edge = subprocess.Popen([os.environ["HAPROXY_TEST_BINARY"], "-db", "-f", config_file],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                # Probing :443 itself would open a passthrough connection, so readiness waits on :80.
                deadline = time.monotonic() + 5
                while time.monotonic() < deadline:
                    with socket.socket() as sock:
                        if sock.connect_ex(("127.0.0.1", redirect_port)) == 0:
                            break
                    time.sleep(0.05)
                client_hello = b"\x16\x03\x01\x00\x2a" + bytes(range(42))
                with socket.create_connection(("127.0.0.1", public_port), timeout=3) as client:
                    client.sendall(client_hello)
                    time.sleep(0.5)
                deadline = time.monotonic() + 5
                while not received and time.monotonic() < deadline:
                    time.sleep(0.05)
            finally:
                edge.terminate()
                edge.wait(timeout=5)
                sink.close()
        self.assertTrue(received, "the TLS stream never reached the Stalwart group port")
        data = received[0]
        self.assertEqual(data[:12], PROXY_V2_SIGNATURE)
        header_length = 16 + struct.unpack("!H", data[14:16])[0]
        self.assertEqual(data[13], 0x11)
        self.assertEqual(str(ipaddress.IPv4Address(data[16:20])), "127.0.0.1")
        self.assertEqual(data[header_length:], client_hello, "HAProxy must not terminate or alter TLS")


class VpsHttpsListenerPlanTests(unittest.TestCase):
    def setUp(self):
        plan = [json.loads(line) for line in (ROOT / "stalwart/plan/10-network.ndjson").read_text().splitlines()]
        self.listeners = {v["name"]: v for v in next(p for p in plan if p["object"] == "NetworkListener")["value"].values()}
        self.rule = next(p for p in plan if p["object"] == "Http")["value"]["allowedEndpoints"]

    def test_stalwart_terminates_the_passthrough_tls_itself(self):
        https = self.listeners["https"]
        self.assertEqual((https["protocol"], https["useTls"], https["implicitTls"], https["bind"]),
                         ("http", True, True, {"[::]:8443": True}))
        self.assertFalse(self.listeners["http"]["useTls"])

    def test_the_vps_listener_admits_only_public_paths(self):
        self.assertEqual(self.rule["else"], "200")
        (condition,) = self.rule["match"].values()
        self.assertEqual(condition["then"], "404")
        self.assertTrue(condition["if"].startswith("listener == 'https' && (!("), condition["if"])
        for public in ("'/jmap'", "'/jmap/'", "'/.well-known/'", "'/api/discover'", "'/mail/config-v1.1.xml'",
                       "'/autodiscover/autodiscover.xml'", "'/autodiscover/autodiscover.json'"):
            self.assertIn(public, condition["if"])
        for unsafe in ("'/../'", "'/./'", "'//'", "'%2e'", "'%2E'", "'%2f'", "'%2F'"):
            self.assertIn(f"contains(url, {unsafe})", condition["if"])
        for private in ("/admin", "/login", "/api/principal", "/auth", "/account", "/oauth", "/device"):
            self.assertNotIn(f"'{private}", condition["if"])

if __name__ == "__main__":
    unittest.main()
