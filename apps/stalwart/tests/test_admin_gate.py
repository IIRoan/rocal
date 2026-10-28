"""The public UI uses the Solace authorization result; public JMAP never depends on that result."""

import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
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

import test_backend_gate as gate_tools


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, url):
        return None


class IPv6HTTPServer(ThreadingHTTPServer):
    address_family = socket.AF_INET6


class LoopbackDns:
    def __init__(self, families=(1, 28)):
        self.families = families
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.bind(("127.0.0.1", 0))
        self.port = self.sock.getsockname()[1]
        self.queries = []
        threading.Thread(target=self.serve, daemon=True).start()

    def serve(self):
        while True:
            try:
                packet, address = self.sock.recvfrom(4096)
            except OSError:
                return
            end = 12
            while packet[end]:
                end += packet[end] + 1
            end += 1
            question = packet[12:end + 4]
            kind = struct.unpack("!H", packet[end:end + 2])[0]
            self.queries.append(kind)
            answer = b""
            if kind in self.families:
                address_bytes = socket.inet_aton("127.0.0.1") if kind == 1 else socket.inet_pton(socket.AF_INET6, "::1")
                answer = b"\xc0\x0c" + struct.pack("!HHIH", kind, 1, 10, len(address_bytes)) + address_bytes
            response = packet[:2] + struct.pack("!HHHHH", 0x8180, 1, bool(answer), 0, 0)
            self.sock.sendto(response + question + answer, address)


class Authorizer(BaseHTTPRequestHandler):
    requests = []
    slow_started = threading.Event()

    def do_GET(self):
        cookie = self.headers.get("Cookie", "")
        self.requests.append({"path": self.path, "cookie": cookie,
                              "authorization": self.headers.get("Authorization"),
                              "gate": self.headers.get("X-Solace-Admin-Gate"),
                              "client_ip": self.headers.get("X-Real-IP")})
        if "session_token=timeout" in cookie or "session_token=slow-owner" in cookie:
            self.slow_started.set()
            time.sleep(3)
        code = 204 if "session_token=owner" in cookie or "session_token=slow-owner" in cookie else 404
        for value, status in [("expired", 401), ("stepup", 403), ("unavailable", 503),
                              ("redirect", 302), ("ok200", 200)]:
            if f"session_token={value}" in cookie:
                code = status
        if self.headers.get("X-Solace-Admin-Gate") != gate_tools.KEY:
            code = 404
        self.send_response(code)
        if code == 204:
            self.send_header("Set-Cookie", "__Secure-better-auth.session_token=renewed; HttpOnly; Secure")
            self.send_header("Set-Cookie", "__Secure-better-auth.session_data=renewed-data; HttpOnly; Secure")
        self.send_header("Content-Length", "0")
        try:
            self.end_headers()
        except (BrokenPipeError, ConnectionResetError):
            pass

    def log_message(self, format, *args):
        pass


@unittest.skipUnless(os.environ.get("HAPROXY_TEST_BINARY"), "set HAPROXY_TEST_BINARY")
class SolaceAdminGateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.upstream = gate_tools.ProxyV2Upstream()
        cls.authorizer = ThreadingHTTPServer(("127.0.0.1", 0), Authorizer)
        threading.Thread(target=cls.authorizer.serve_forever, daemon=True).start()
        cls.directory = tempfile.TemporaryDirectory(prefix="solace-admin-session-")
        cls.env = {**os.environ, "STALWART_GATE_PORT": str(gate_tools.free_port()),
                   "STALWART_PUBLIC_PORT": str(gate_tools.free_port()),
                   "STALWART_GATE_LUA_PATH": str(gate_tools.ROOT / "admin-gate.lua"),
                   "STALWART_HTTP_PORT": str(cls.upstream.port),
                   "STALWART_GATE_KEY_SHA256": hashlib.sha256(gate_tools.KEY.encode()).hexdigest(),
                   "STALWART_ADMIN_GATE_KEY": gate_tools.KEY,
                   "SOLACE_ADMIN_LOGIN_URL": "https://app.solace.test/login",
                   "SOLACE_ADMIN_AUTH_URL": f"http://127.0.0.1:{cls.authorizer.server_port}/api/internal/stalwart/admin-access"}
        cls.gate = cls.start_gate(cls.env)

    @classmethod
    def start_gate(cls, env, config=None):
        process = subprocess.Popen([os.environ["HAPROXY_TEST_BINARY"], "-db", "-f",
                                    str(config or gate_tools.ROOT / "backend-gate.cfg")], env=env)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            with socket.socket() as sock:
                if sock.connect_ex(("127.0.0.1", int(env["STALWART_PUBLIC_PORT"]))) == 0:
                    return process
            if process.poll() is not None:
                raise RuntimeError("gate configuration failed")
            time.sleep(0.05)
        process.terminate()
        process.wait(timeout=5)
        raise RuntimeError("gate did not start")

    @classmethod
    def tearDownClass(cls):
        cls.gate.terminate()
        cls.gate.wait(timeout=5)
        cls.authorizer.shutdown()
        cls.authorizer.server_close()
        cls.directory.cleanup()

    def request(self, path, cookie=None, headers=None, port=None):
        headers = {"X-Real-IP": "203.0.113.11", **(headers or {})}
        headers = {key: value for key, value in headers.items() if value is not None}
        if cookie:
            headers["Cookie"] = cookie
        url = f'http://127.0.0.1:{port or self.env["STALWART_PUBLIC_PORT"]}{path}'
        opener = urllib.request.build_opener(NoRedirect())
        try:
            response = opener.open(urllib.request.Request(url, headers=headers), timeout=7)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, response.headers

    def test_signed_out_entry_redirects_to_solace_without_contacting_stalwart(self):
        before = len(self.upstream.requests)
        status, headers = self.request("/admin/")
        self.assertEqual(status, 302)
        self.assertEqual(headers["Location"], "https://app.solace.test/login?next=%2Fadmin")
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertEqual(len(self.upstream.requests), before)

    def test_only_exact_authorization_success_grants_ui_access(self):
        for value in ("other", "expired", "unavailable", "redirect", "ok200", "timeout"):
            with self.subTest(value=value):
                self.assertEqual(self.request("/login", f"__Secure-better-auth.session_token={value}")[0], 404)
        self.assertEqual(self.request("/login", "__Secure-better-auth.session_token=owner")[0], 200)

    def test_authorization_deadline_refuses_a_late_success(self):
        before = len(self.upstream.requests)
        start = time.monotonic()
        status, _ = self.request("/login", "__Secure-better-auth.session_token=slow-owner")
        self.assertEqual(status, 404)
        self.assertLess(time.monotonic() - start, 1.8)
        self.assertEqual(len(self.upstream.requests), before)

    def test_public_jmap_is_responsive_during_slow_admin_authorization(self):
        Authorizer.slow_started.clear()
        worker = threading.Thread(target=lambda: self.request("/login", "__Secure-better-auth.session_token=slow-owner"))
        worker.start()
        try:
            self.assertTrue(Authorizer.slow_started.wait(timeout=2))
            start = time.monotonic()
            self.assertEqual(self.request("/jmap/session")[0], 200)
            self.assertLess(time.monotonic() - start, 0.8)
        finally:
            worker.join(timeout=7)
        self.assertFalse(worker.is_alive())

    def test_http_timeout_does_not_depend_on_the_lua_execution_budget(self):
        config = os.path.join(self.directory.name, "timeout-gate.cfg")
        contents = (gate_tools.ROOT / "backend-gate.cfg").read_text()
        with open(config, "w") as handle:
            handle.write(contents.replace("tune.lua.session-timeout 1s", "tune.lua.session-timeout 10s"))
        env = {**self.env, "STALWART_GATE_PORT": str(gate_tools.free_port()),
               "STALWART_PUBLIC_PORT": str(gate_tools.free_port())}
        process = self.start_gate(env, config)
        try:
            start = time.monotonic()
            status, _ = self.request("/login", "__Secure-better-auth.session_token=slow-owner",
                                     port=env["STALWART_PUBLIC_PORT"])
            self.assertEqual(status, 404)
            self.assertLess(time.monotonic() - start, 1.8)
        finally:
            process.terminate()
            process.wait(timeout=5)

    def test_operator_ip_and_client_headers_do_not_bypass_solace_auth(self):
        for headers in ({"X-Real-IP": "203.0.113.11"}, {"X-Forwarded-For": "203.0.113.11"},
                        {"X-Solace-Admin": "allowed", "X-Solace-Gate": gate_tools.KEY}):
            self.assertEqual(self.request("/login", headers=headers)[0], 404)

    def test_duplicate_session_cookie_is_refused(self):
        cookie = "__Secure-better-auth.session_token=owner; __Secure-better-auth.session_token=other"
        self.assertEqual(self.request("/login", cookie)[0], 404)

    def test_admin_ui_requires_a_valid_client_address_but_no_operator_network(self):
        before = len(Authorizer.requests)
        for value in (None, "", "invalid"):
            with self.subTest(value=value):
                self.assertEqual(self.request("/login", "__Secure-better-auth.session_token=owner",
                                              {"X-Real-IP": value})[0], 404)
        self.assertEqual(len(Authorizer.requests), before)
        for value in ("198.51.100.1", "203.0.113.11", "2001:db8:1::7"):
            self.assertEqual(self.request("/login", "__Secure-better-auth.session_token=owner",
                                          {"X-Real-IP": value})[0], 200)
            self.assertEqual(self.upstream.requests[-1]["source"], value)
            self.assertEqual(Authorizer.requests[-1]["client_ip"], value)

    def test_private_authorizer_hostname_uses_the_configured_dns_resolver(self):
        ipv6_authorizer = IPv6HTTPServer(("::1", 0), Authorizer)
        threading.Thread(target=ipv6_authorizer.serve_forever, daemon=True).start()
        # Railway environments created before 2025-10-16, like production, resolve private names to IPv6 only.
        for families, port, query in (((1, 28), self.authorizer.server_port, 1),
                                      ((28,), ipv6_authorizer.server_port, 28)):
            with self.subTest(families=families):
                dns = LoopbackDns(families)
                config = os.path.join(self.directory.name, "dns-gate.cfg")
                contents = (gate_tools.ROOT / "backend-gate.cfg").read_text()
                with open(config, "w") as handle:
                    handle.write(contents.replace("parse-resolv-conf", f"nameserver test_dns 127.0.0.1:{dns.port}"))
                env = {**self.env,
                       "SOLACE_ADMIN_AUTH_URL": f"http://solace-api.railway.internal:{port}/api/internal/stalwart/admin-access",
                       "STALWART_GATE_PORT": str(gate_tools.free_port()),
                       "STALWART_PUBLIC_PORT": str(gate_tools.free_port())}
                process = self.start_gate(env, config)
                try:
                    self.assertEqual(self.request("/admin/", "__Secure-better-auth.session_token=owner",
                                                  port=env["STALWART_PUBLIC_PORT"])[0], 200)
                    self.assertIn(query, dns.queries)
                finally:
                    process.terminate()
                    process.wait(timeout=5)
                    dns.sock.close()
        ipv6_authorizer.shutdown()
        ipv6_authorizer.server_close()

    def test_step_up_returns_to_solace_passkey_login(self):
        status, headers = self.request("/admin/", "__Secure-better-auth.session_token=stepup")
        self.assertEqual(status, 302)
        self.assertEqual(headers["Location"], "https://app.solace.test/login?next=%2Fadmin&stepUp=1")

    def test_application_cookies_and_stalwart_credentials_stay_separate(self):
        before = len(self.upstream.requests)
        cookie = ("__Secure-better-auth.session_token=owner; solace-passkey-step-up=verified; "
                  "__Secure-better-auth.session_data=private; solace_enc_pw=encrypted; stalwart-login=preserved")
        status, headers = self.request("/login", cookie, {"Authorization": "Bearer stalwart-token"})
        self.assertEqual(status, 200)
        authorized = Authorizer.requests[-1]
        self.assertEqual(authorized["path"], "/api/internal/stalwart/admin-access")
        self.assertEqual(authorized["cookie"], "__Secure-better-auth.session_token=owner; solace-passkey-step-up=verified")
        self.assertIsNone(authorized["authorization"])
        self.assertEqual(authorized["gate"], gate_tools.KEY)
        forwarded = self.upstream.requests[before]["headers"]
        self.assertEqual(forwarded["cookie"], "stalwart-login=preserved")
        self.assertEqual(forwarded["authorization"], "Bearer stalwart-token")
        self.assertEqual(len(headers.get_all("Set-Cookie")), 2)

    def test_no_remember_preference_reaches_the_authorizer(self):
        cookie = "__Secure-better-auth.session_token=owner; __Secure-better-auth.dont_remember=signed-preference"
        status, _ = self.request("/admin/", cookie)
        self.assertEqual(status, 200)
        self.assertEqual(Authorizer.requests[-1]["cookie"], cookie)

    def test_public_jmap_survives_admin_auth_failure_and_strips_app_cookies(self):
        before = len(Authorizer.requests)
        self.assertEqual(self.request("/jmap/session", "__Secure-better-auth.session_token=unavailable")[0], 200)
        self.assertEqual(len(Authorizer.requests), before)
        self.assertNotIn("cookie", self.upstream.requests[-1]["headers"])

    def test_stalwart_cannot_replace_application_cookies(self):
        self.upstream.response_headers = [
            ("Set-Cookie", "__Secure-better-auth.session_token =forged; Domain=solace.onl"),
            ("Set-Cookie", "solace-passkey-step-up=forged; Domain=solace.onl"),
            ("Set-Cookie", "solace_enc_pw=forged; Domain=solace.onl"),
            ("Set-Cookie", "stalwart-login=preserved; Secure"),
        ]
        try:
            status, headers = self.request("/jmap/session")
            self.assertEqual(status, 200)
            self.assertEqual(headers.get_all("Set-Cookie"), ["stalwart-login=preserved; Secure"])
        finally:
            self.upstream.response_headers = []

    def test_invalid_auth_origin_fails_closed(self):
        env = {**self.env, "SOLACE_ADMIN_AUTH_URL": "http://attacker.invalid/admin-access",
               "STALWART_GATE_PORT": str(gate_tools.free_port()), "STALWART_PUBLIC_PORT": str(gate_tools.free_port())}
        process = self.start_gate(env)
        try:
            self.assertEqual(self.request("/login", "__Secure-better-auth.session_token=owner",
                                          {"X-Real-IP": "203.0.113.11"}, env["STALWART_PUBLIC_PORT"])[0], 404)
        finally:
            process.terminate()
            process.wait(timeout=5)

    def test_missing_gateway_key_or_unsafe_login_target_never_calls_the_api(self):
        for overrides in ({"STALWART_ADMIN_GATE_KEY": ""},
                          {"SOLACE_ADMIN_LOGIN_URL": "javascript:alert(1)"},
                          {"SOLACE_ADMIN_LOGIN_URL": "https://user:secret@app.solace.test/login"}):
            env = {**self.env, **overrides, "STALWART_GATE_PORT": str(gate_tools.free_port()),
                   "STALWART_PUBLIC_PORT": str(gate_tools.free_port())}
            process = self.start_gate(env)
            before = len(Authorizer.requests)
            try:
                self.assertEqual(self.request("/admin/", "__Secure-better-auth.session_token=owner",
                                              port=env["STALWART_PUBLIC_PORT"])[0], 404)
                self.assertEqual(len(Authorizer.requests), before)
            finally:
                process.terminate()
                process.wait(timeout=5)
