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


class LoopbackDns:
    def __init__(self):
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
            answer = (b"\xc0\x0c" + struct.pack("!HHIH", 1, 1, 10, 4)
                      + socket.inet_aton("127.0.0.1")) if kind == 1 else b""
            response = packet[:2] + struct.pack("!HHHHH", 0x8180, 1, bool(answer), 0, 0)
            self.sock.sendto(response + question + answer, address)


class Authorizer(BaseHTTPRequestHandler):
    requests = []

    def do_GET(self):
        cookie = self.headers.get("Cookie", "")
        self.requests.append({"path": self.path, "cookie": cookie,
                              "authorization": self.headers.get("Authorization")})
        if "session_token=timeout" in cookie:
            time.sleep(3)
        code = 204 if "session_token=owner" in cookie else 404
        for value, status in [("expired", 401), ("stepup", 403), ("unavailable", 503),
                              ("redirect", 302), ("ok200", 200)]:
            if f"session_token={value}" in cookie:
                code = status
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
        cls.allow_file = os.path.join(cls.directory.name, "operators")
        with open(cls.allow_file, "w") as handle:
            handle.write("203.0.113.11/32\n")
        cls.env = {**os.environ, "STALWART_GATE_PORT": str(gate_tools.free_port()),
                   "STALWART_PUBLIC_PORT": str(gate_tools.free_port()),
                   "STALWART_GATE_LUA_PATH": str(gate_tools.ROOT / "admin-gate.lua"),
                   "STALWART_ADMIN_ALLOW_FILE": cls.allow_file,
                   "STALWART_HTTP_PORT": str(cls.upstream.port),
                   "STALWART_GATE_KEY_SHA256": hashlib.sha256(gate_tools.KEY.encode()).hexdigest(),
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
        headers = dict(headers or {})
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
        self.assertEqual(headers["Location"], "https://solace.onl/login?next=%2Fadmin")
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertEqual(len(self.upstream.requests), before)

    def test_only_exact_authorization_success_grants_ui_access(self):
        for value in ("other", "expired", "unavailable", "redirect", "ok200", "timeout"):
            with self.subTest(value=value):
                self.assertEqual(self.request("/login", f"__Secure-better-auth.session_token={value}")[0], 404)
        self.assertEqual(self.request("/login", "__Secure-better-auth.session_token=owner")[0], 200)

    def test_operator_ip_and_client_headers_do_not_bypass_solace_auth(self):
        for headers in ({"X-Real-IP": "203.0.113.11"}, {"X-Forwarded-For": "203.0.113.11"},
                        {"X-Solace-Admin": "allowed", "X-Solace-Gate": gate_tools.KEY}):
            self.assertEqual(self.request("/login", headers=headers)[0], 404)

    def test_duplicate_session_cookie_is_refused(self):
        cookie = "__Secure-better-auth.session_token=owner; __Secure-better-auth.session_token=other"
        self.assertEqual(self.request("/login", cookie)[0], 404)

    def test_private_authorizer_hostname_uses_the_configured_dns_resolver(self):
        dns = LoopbackDns()
        config = os.path.join(self.directory.name, "dns-gate.cfg")
        contents = (gate_tools.ROOT / "backend-gate.cfg").read_text()
        with open(config, "w") as handle:
            handle.write(contents.replace("parse-resolv-conf", f"nameserver test_dns 127.0.0.1:{dns.port}"))
        env = {**self.env,
               "SOLACE_ADMIN_AUTH_URL": f"http://solace-api.railway.internal:{self.authorizer.server_port}/api/internal/stalwart/admin-access",
               "STALWART_GATE_PORT": str(gate_tools.free_port()),
               "STALWART_PUBLIC_PORT": str(gate_tools.free_port())}
        process = self.start_gate(env, config)
        try:
            self.assertEqual(self.request("/admin/", "__Secure-better-auth.session_token=owner",
                                          port=env["STALWART_PUBLIC_PORT"])[0], 200)
            self.assertIn(1, dns.queries)
        finally:
            process.terminate()
            process.wait(timeout=5)
            dns.sock.close()

    def test_step_up_returns_to_solace_passkey_login(self):
        status, headers = self.request("/admin/", "__Secure-better-auth.session_token=stepup")
        self.assertEqual(status, 302)
        self.assertEqual(headers["Location"], "https://solace.onl/login?next=%2Fadmin&stepUp=1")

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

    def test_invalid_auth_origin_fails_closed_even_from_operator_network(self):
        env = {**self.env, "SOLACE_ADMIN_AUTH_URL": "http://attacker.invalid/admin-access",
               "STALWART_GATE_PORT": str(gate_tools.free_port()), "STALWART_PUBLIC_PORT": str(gate_tools.free_port())}
        process = self.start_gate(env)
        try:
            self.assertEqual(self.request("/login", "__Secure-better-auth.session_token=owner",
                                          {"X-Real-IP": "203.0.113.11"}, env["STALWART_PUBLIC_PORT"])[0], 404)
        finally:
            process.terminate()
            process.wait(timeout=5)
