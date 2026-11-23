import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, call, patch

import failover
from failover import Dns, HOST, PREVIOUS, PRIMARY, STANDBY, ZONE

ZONE_ID = "a" * 32
RECORD_ID = "b" * 32
RECORDS = f"/client/v4/zones/{ZONE_ID}/dns_records"
RECORD_QUERY = f"{RECORDS}?name={HOST}"
RECORD_PATH = f"{RECORDS}/{RECORD_ID}"
CORE = "urn:ietf:params:jmap:core"


def record(target=PRIMARY, **fields):
    return {
        "id": RECORD_ID, "name": HOST, "type": "CNAME", "proxied": False,
        "ttl": 60, "content": target, **fields,
    }


class ProbeTests(unittest.TestCase):
    @patch("failover.subprocess.run")
    def test_requires_http_200_and_a_valid_canonical_jmap_session(self, run):
        reply = run.return_value
        reply.returncode = 0
        valid = {"apiUrl": f"https://{HOST}/jmap/", "capabilities": {CORE: {}}}
        reply.stdout = json.dumps(valid).encode() + b"\n200"
        self.assertTrue(failover.probe(PRIMARY))
        argv = run.call_args.args[0]
        self.assertEqual(argv[:2], ["/usr/bin/curl", "--disable"])
        self.assertIn(f"{HOST}:443:{PRIMARY}:443", argv)

        for session, status in (
            (valid, b"\n302"),
            ({**valid, "apiUrl": "https://other.example/jmap/"}, b"\n200"),
            ({**valid, "apiUrl": f"https://{HOST}/jmap/?redirect=1"}, b"\n200"),
            ({**valid, "capabilities": CORE}, b"\n200"),
            ({**valid, "capabilities": {CORE: None}}, b"\n200"),
            ([], b"\n200"),
        ):
            with self.subTest(session=session, status=status):
                reply.stdout = json.dumps(session).encode() + status
                self.assertFalse(failover.probe(PRIMARY))
        reply.stdout = b"{broken json\n200"
        self.assertFalse(failover.probe(PRIMARY))

    @patch("failover.subprocess.run", side_effect=subprocess.TimeoutExpired("curl", 4))
    def test_treats_a_stuck_probe_as_unhealthy(self, _run):
        self.assertFalse(failover.probe(STANDBY))


@patch("builtins.print")
class DnsTests(unittest.TestCase):
    @patch("failover.HTTPSConnection")
    def test_redirect_or_malformed_api_response_is_a_retryable_error(self, connect, _print):
        response = connect.return_value.getresponse.return_value
        for status, body in ((302, b""), (200, b"[]"), (200, b"{broken"), (429, b"")):
            with self.subTest(status=status, body=body):
                response.status = status
                response.read.return_value = body
                with self.assertRaises(failover.DnsError):
                    Dns("test-credential").request("/client/v4/zones")
        self.assertEqual(connect.call_count, 4)
        self.assertEqual(connect.return_value.request.call_count, 4)
        self.assertEqual(connect.return_value.close.call_count, 4)

    def test_unexpected_dns_record_is_never_eligible_for_a_switch(self, _print):
        for result in (
            [record(PREVIOUS)], [record("elsewhere.example")], [record(ttl=300)],
            [record(proxied=True)], [record(type="A")], [record(id="../another")],
            [record(), record()], [], [None],
        ):
            with self.subTest(result=result):
                dns = Dns("test-credential")
                dns.request = Mock(side_effect=[[{"id": ZONE_ID, "name": ZONE}], result])
                monitor = failover.Monitor(dns)
                monitor.poll({PRIMARY: False, STANDBY: True}, 0)
                monitor.poll({PRIMARY: False, STANDBY: True}, 5)
                self.assertEqual(dns.request.call_args_list, [
                    call(f"/client/v4/zones?name={ZONE}"), call(RECORD_QUERY),
                ])

    def test_switch_only_edits_the_content_of_the_validated_cname(self, _print):
        dns = Dns("test-credential")
        dns.request = Mock(side_effect=[
            [{"id": ZONE_ID, "name": ZONE}], [record(PREVIOUS)], record(STANDBY),
        ])
        current = dns.current(allow_previous=True)
        dns.switch(current, STANDBY)
        self.assertEqual(dns.request.call_args_list[-1], call(RECORD_PATH, {"content": STANDBY}))
        with self.assertRaises(ValueError):
            dns.switch(current, PREVIOUS)
        self.assertEqual(dns.request.call_count, 3)

    def test_switch_requires_the_api_to_confirm_the_same_direct_record(self, _print):
        dns = Dns("test-credential")
        dns.request = Mock(side_effect=[
            [{"id": ZONE_ID, "name": ZONE}], [record()], record(STANDBY, id="c" * 32),
        ])
        with self.assertRaises(failover.DnsError):
            dns.switch(dns.current(), STANDBY)


class MonitorTests(unittest.TestCase):
    def setUp(self):
        self.dns = Mock(spec=Dns)
        self.current = record()
        self.dns.current.side_effect = lambda: self.current
        self.dns.switch.side_effect = self.switch
        self.monitor = failover.Monitor(self.dns)
        patcher = patch("builtins.print")
        patcher.start()
        self.addCleanup(patcher.stop)

    def switch(self, current, target):
        self.assertEqual(current, self.current)
        self.current = record(target)

    def poll(self, now, primary, standby):
        self.monitor.poll({PRIMARY: primary, STANDBY: standby}, now)

    def test_two_fresh_failures_and_two_healthy_alternate_probes(self):
        self.poll(0, False, False)
        self.poll(5, False, True)
        self.poll(10, True, True)
        self.poll(15, False, True)
        self.dns.switch.assert_not_called()
        self.poll(20, False, True)
        self.dns.switch.assert_called_once_with(record(), STANDBY)

    def test_keeps_the_current_target_when_both_fail_then_returns_after_twelve_checks(self):
        self.current = record(STANDBY)
        self.poll(0, False, False)
        self.poll(5, False, False)
        self.dns.switch.assert_not_called()
        for now in range(10, 65, 5):
            self.poll(now, True, True)
        self.dns.switch.assert_not_called()
        self.poll(65, True, True)
        self.dns.switch.assert_called_once_with(record(STANDBY), PRIMARY)

    def test_switches_back_quickly_if_the_standby_fails(self):
        self.current = record(STANDBY)
        self.poll(0, True, False)
        self.poll(5, True, False)
        self.dns.switch.assert_called_once_with(record(STANDBY), PRIMARY)

    def test_read_failure_backs_off_without_discarding_health_checks(self):
        self.dns.current.side_effect = [failover.DnsError("unavailable"), record()]
        self.poll(0, False, True)
        self.poll(5, False, True)
        self.dns.current.assert_called_once()
        self.dns.switch.assert_not_called()
        self.poll(failover.DNS_RETRY_SECONDS, False, True)
        self.dns.switch.assert_called_once_with(record(), STANDBY)

    def test_lost_switch_response_refreshes_dns_without_resending_the_write(self):
        def switch_then_timeout(current, target):
            self.switch(current, target)
            raise failover.DnsError("response timed out")

        self.dns.switch.side_effect = switch_then_timeout
        self.poll(0, False, True)
        self.poll(5, False, True)
        self.poll(10, True, True)
        self.assertEqual(self.dns.current.call_count, 2)
        self.poll(5 + failover.DNS_RETRY_SECONDS, True, True)
        self.assertEqual(self.dns.current.call_count, 3)
        self.dns.switch.assert_called_once_with(record(), STANDBY)

    def test_retries_an_unapplied_write_after_refreshing_dns(self):
        self.dns.switch.side_effect = [failover.DnsError("write timed out"), None]
        self.poll(0, False, True)
        self.poll(5, False, True)
        self.poll(10, False, True)
        self.dns.switch.assert_called_once()
        self.poll(5 + failover.DNS_RETRY_SECONDS, False, True)
        self.assertEqual(self.dns.current.call_count, 3)
        self.assertEqual(self.dns.switch.call_args_list, [call(record(), STANDBY)] * 2)

    def test_refreshes_the_record_periodically_even_when_healthy(self):
        self.poll(0, True, True)
        self.poll(5, True, True)
        self.dns.current.assert_called_once()
        self.poll(failover.DNS_CHECK_SECONDS, True, True)
        self.assertEqual(self.dns.current.call_count, 2)
        self.dns.switch.assert_not_called()

    def test_rechecks_the_actual_target_before_a_switch(self):
        self.poll(0, False, True)
        self.current = record(STANDBY)
        self.poll(5, False, True)
        self.assertEqual(self.dns.current.call_count, 2)
        self.dns.switch.assert_not_called()


@patch("builtins.print")
class CheckCommandsTests(unittest.TestCase):
    @patch("failover.Dns")
    @patch("failover.probe", return_value=True)
    def test_discovery_check_needs_no_cloudflare_credentials(self, probe, dns, _print):
        with patch("sys.argv", ["failover.py", "--check"]):
            self.assertEqual(failover.main(), 0)
        self.assertEqual(probe.call_args_list, [call(PRIMARY), call(STANDBY)])
        dns.assert_not_called()

    @patch("failover.Dns")
    def test_dns_check_only_reads_the_record(self, dns, _print):
        dns.return_value.current.return_value = record()
        with TemporaryDirectory() as directory:
            token = Path(directory) / "token"
            token.write_text("test-credential\n")
            with patch("sys.argv", ["failover.py", "--check-dns", "--token-file", str(token)]):
                self.assertEqual(failover.main(), 0)
        dns.assert_called_once_with("test-credential")
        self.assertEqual(dns.return_value.mock_calls, [call.current()])


if __name__ == "__main__":
    unittest.main()
