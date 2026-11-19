"""Optional loopback test of backend-gate.cfg with a real HAProxy; set HAPROXY_TEST_BINARY to run it."""

import hashlib
import ipaddress
import json
import os
import smtplib
import socket
import socketserver
import struct
import subprocess
import threading
import time
import unittest
import urllib.error
import urllib.request

from pathlib import Path

from test_mail_ha import ROOT

GATE_FIXTURE = os.environ.get("SOLACE_GATE_CONFIG_DIR")
PUBLIC_IP_HEADER = "CF-Connecting-IP" if GATE_FIXTURE else "X-Real-IP"
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
        self.rollout_status = 200
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
            if headers.get("user-agent") == "solace-rollout-check":
                conn.sendall(f"HTTP/1.1 {self.rollout_status} Test\r\nContent-Length: 0\r\n\r\n".encode())
                return
            self.requests.append({"source": str(source), "path": lines[0].split(" ")[1],
                                  "headers": headers})
            extra_headers = "".join(f"{name}: {value}\r\n" for name, value in self.response_headers)
            conn.sendall(("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n"
                          + extra_headers + "\r\nok").encode())


class SmtpHealthServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


class SmtpHealthUpstream(socketserver.StreamRequestHandler):
    def handle(self):
        self.connection.settimeout(5)
        header = self.rfile.read(16)
        if header[:14] != PROXY_V2_SIGNATURE + b"\x21\x11":
            return
        self.rfile.read(struct.unpack("!H", header[14:])[0])
        self.wfile.write(b"220 fixture ESMTP\r\n")
        if self.rfile.readline().upper().startswith(b"EHLO "):
            features = b"250-STARTTLS\r\n" if self.server.starttls else b""
            self.wfile.write(b"250-fixture\r\n" + features + b"250 HELP\r\n")
        if self.rfile.readline() == b"QUIT\r\n":
            self.wfile.write(b"221 closing\r\n")


def proxied_connection(port):
    conn = socket.create_connection(("127.0.0.1", port), timeout=3)
    caller = ipaddress.IPv4Address("192.0.2.123").packed
    receiver = ipaddress.IPv4Address("192.0.2.25").packed
    conn.sendall(PROXY_V2_SIGNATURE + struct.pack("!BBH", 0x21, 0x11, 12)
                 + caller + receiver + struct.pack("!HH", 49000, port))
    return conn


@unittest.skipUnless(os.environ.get("HAPROXY_TEST_BINARY"), "set HAPROXY_TEST_BINARY for the gate test")
class BackendGateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.upstream = ProxyV2Upstream()
        cls.gate_port = free_port()
        cls.public_port = free_port()
        gate_dir = Path(GATE_FIXTURE) if GATE_FIXTURE else ROOT
        config = gate_dir / ("haproxy.cfg" if GATE_FIXTURE else "backend-gate.cfg")
        env = {**os.environ, "SOLACE_ADMIN_AUTH_URL": "", "STALWART_GATE_PORT": str(cls.gate_port),
               "STALWART_GATE_LUA_PATH": str(gate_dir / "admin-gate.lua"),
               "STALWART_PUBLIC_PORT": str(cls.public_port),
               "STALWART_HTTP_PORT": str(cls.upstream.port),
               "STALWART_GATE_KEY_SHA256": hashlib.sha256(KEY.encode()).hexdigest()}
        cls.gate = subprocess.Popen([os.environ["HAPROXY_TEST_BINARY"], "-db", "-f",
                                     str(config)], env=env)
        cls.addClassCleanup(cls.stop_gate)
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            with socket.socket() as sock:
                if sock.connect_ex(("127.0.0.1", cls.gate_port)) == 0:
                    return
            time.sleep(0.1)
        raise RuntimeError("gate did not start")

    @classmethod
    def stop_gate(cls):
        cls.gate.terminate()
        cls.gate.wait(timeout=5)

    def request(self, path, method="GET", key=KEY, headers=None, public=False, port=None):
        all_headers = dict(headers or {})
        if key is not None:
            all_headers["X-Solace-Gate"] = key
        if port is None:
            port = self.public_port if public else self.gate_port
        req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", method=method,
                                     headers=all_headers, data=b"" if method == "POST" else None)
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status
        except urllib.error.HTTPError as error:
            with error:
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
        headers = {PUBLIC_IP_HEADER: "203.0.113.9", "Authorization": "Bearer mailbox-test-token"}
        self.assertEqual(self.request("/jmap/", method="POST", headers=headers, public=True), 200)
        forwarded = self.upstream.requests[before]
        self.assertEqual(forwarded["source"], "203.0.113.9")
        self.assertEqual(forwarded["headers"]["authorization"], "Bearer mailbox-test-token")
        self.assertNotIn("x-solace-gate", forwarded["headers"])
        self.assertEqual(self.request("/jmap/session", key=None), 404)

    def test_public_gateway_preserves_ipv6_client_addresses(self):
        before = len(self.upstream.requests)
        self.assertEqual(self.request("/jmap/session", headers={PUBLIC_IP_HEADER: "2001:db8::9"}, public=True), 200)
        self.assertEqual(self.upstream.requests[before]["source"], "2001:db8::9")

    @unittest.skipUnless(GATE_FIXTURE, "requires the deployed Zeabur gateway configuration")
    def test_direct_public_port_uses_traefik_client_ip(self):
        for client_ip in ("203.0.113.17", "2001:db8::17"):
            with self.subTest(client_ip=client_ip):
                headers = {"X-Forwarded-For": client_ip, "CF-Connecting-IP": "192.0.2.42",
                           "X-Real-IP": "192.0.2.43"}
                self.assertEqual(self.request("/jmap/session", key=None, headers=headers, port=8085), 200)
                forwarded = self.upstream.requests[-1]
                self.assertEqual(forwarded["source"], client_ip)
                self.assertNotIn("cf-connecting-ip", forwarded["headers"])

    @unittest.skipUnless(GATE_FIXTURE, "requires the deployed Zeabur gateway configuration")
    def test_tunnel_public_port_keeps_cloudflare_client_ip(self):
        headers = {"X-Forwarded-For": "192.0.2.44", "CF-Connecting-IP": "203.0.113.18"}
        self.assertEqual(self.request("/jmap/session", key=None, headers=headers, public=True), 200)
        self.assertEqual(self.upstream.requests[-1]["source"], "203.0.113.18")

    def test_unconfigured_session_gate_denies_direct_stalwart_login(self):
        for headers in ({}, {"X-Real-IP": "203.0.113.11"}, {"X-Real-IP": "2001:db8:1::9"},
                        {"X-Real-IP": "invalid"}, {"X-Forwarded-For": "203.0.113.11"}):
            for path in ("/login", "/admin", "/account", "/api/auth", "/auth/token"):
                before = len(self.upstream.requests)
                self.assertEqual(self.request(path, headers=headers, key=None, public=True), 404, path)
                self.assertEqual(len(self.upstream.requests), before, path)

    @unittest.skipUnless(GATE_FIXTURE, "requires the deployed Zeabur gateway configuration")
    def test_smtp_forwards_one_proxy_header_with_the_sender_address(self):
        with socket.create_server(("127.0.0.1", 25)) as listener:
            listener.settimeout(5)
            with socket.create_connection(("127.0.0.1", 22525), timeout=5) as edge:
                source = ipaddress.IPv4Address("192.0.2.123").packed
                dest = ipaddress.IPv4Address("192.0.2.25").packed
                edge.sendall(PROXY_V2_SIGNATURE + struct.pack("!BBH", 0x21, 0x11, 12)
                             + source + dest + struct.pack("!HH", 49000, 25) + b"EHLO test.example\r\n")
                conn, _ = listener.accept()
                with conn:
                    conn.settimeout(5)
                    header = read_exact(conn, 16)
                    self.assertEqual(header[:14], PROXY_V2_SIGNATURE + b"\x21\x11")
                    addresses = read_exact(conn, struct.unpack("!H", header[14:])[0])
                    self.assertEqual(addresses[:4], source)
                    self.assertEqual(read_exact(conn, 19), b"EHLO test.example\r\n")

    @unittest.skipUnless(GATE_FIXTURE, "requires the deployed Zeabur gateway configuration")
    def test_zeabur_rollout_checks_both_protocols_and_drains_mx_health(self):
        def readiness():
            try:
                with urllib.request.urlopen("http://127.0.0.1:8084/readyz", timeout=2) as response:
                    return response.status
            except urllib.error.HTTPError as error:
                with error:
                    return error.code

        def wait_for_status(expected):
            deadline = time.monotonic() + 9
            while time.monotonic() < deadline:
                status = readiness()
                if status == expected:
                    return
                time.sleep(0.2)
            self.fail(f"rollout readiness stayed {status}, expected {expected}")

        wait_for_status(503)
        with SmtpHealthServer(("127.0.0.1", 25), SmtpHealthUpstream) as upstream:
            upstream.starttls = False
            thread = threading.Thread(target=upstream.serve_forever, daemon=True)
            thread.start()
            self.addCleanup(thread.join, 5)
            self.addCleanup(upstream.shutdown)
            wait_for_status(503)
            upstream.starttls = True
            wait_for_status(200)
            upstream.starttls = False
            wait_for_status(503)
            upstream.starttls = True
            wait_for_status(200)
            self.upstream.rollout_status = 503
            self.addCleanup(setattr, self.upstream, "rollout_status", 200)
            wait_for_status(503)
            self.upstream.rollout_status = 200
            wait_for_status(200)

            with proxied_connection(18080) as health_check:
                health_check.sendall(b"GET /jmap/session HTTP/1.1\r\nHost: mail.solace.onl\r\n\r\n")
                self.assertEqual(health_check.makefile("rb").readline().split()[1], b"200")

            with proxied_connection(22525) as connection, smtplib.SMTP(timeout=3) as smtp:
                smtp.sock = connection
                self.assertEqual(smtp.getreply()[0], 220)
                result = subprocess.run(["socat", "-T", "2", "-", "UNIX-CONNECT:/tmp/solace-haproxy.sock"],
                                        input="shutdown frontend ft_rollout_ready; shutdown frontend ft_edge_admin\n",
                                        capture_output=True, text=True, check=True)
                self.assertFalse(result.stdout.strip(), result.stdout)
                with self.assertRaises(ConnectionRefusedError):
                    proxied_connection(18080)
                with self.assertRaises(ConnectionRefusedError):
                    socket.create_connection(("127.0.0.1", 8084), timeout=2)
                self.assertEqual(smtp.ehlo("fixture.example")[0], 250)
                self.assertTrue(smtp.has_extn("starttls"))
                self.assertEqual(self.request("/jmap/session", key=None, public=True), 200)


class RestrictedHttpsListenerPlanTests(unittest.TestCase):
    def setUp(self):
        plan = [json.loads(line) for line in (ROOT / "stalwart/plan/10-network.ndjson").read_text().splitlines()]
        self.listeners = {v["name"]: v for v in next(p for p in plan if p["object"] == "NetworkListener")["value"].values()}
        self.rule = next(p for p in plan if p["object"] == "Http")["value"]["allowedEndpoints"]

    def test_stalwart_terminates_the_passthrough_tls_itself(self):
        https = self.listeners["https"]
        self.assertEqual((https["protocol"], https["useTls"], https["implicitTls"], https["bind"]),
                         ("http", True, True, {"[::]:8443": True}))
        self.assertFalse(self.listeners["http"]["useTls"])

    def test_the_https_listener_admits_only_public_paths(self):
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
