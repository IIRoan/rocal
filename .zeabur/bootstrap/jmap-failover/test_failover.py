import unittest
from unittest.mock import Mock, patch

from failover import Dns, PREVIOUS, PRIMARY, STANDBY, choose, probe


class FailoverTests(unittest.TestCase):
    def test_requires_two_failures_and_a_healthy_alternate(self):
        self.assertEqual(choose(PRIMARY, {PRIMARY: -1, STANDBY: 2}), PRIMARY)
        self.assertEqual(choose(PRIMARY, {PRIMARY: -2, STANDBY: 1}), PRIMARY)
        self.assertEqual(choose(PRIMARY, {PRIMARY: -2, STANDBY: 2}), STANDBY)

    def test_keeps_current_target_when_both_are_unhealthy(self):
        for origin in (PRIMARY, STANDBY):
            self.assertEqual(choose(origin, {PRIMARY: -10, STANDBY: -10}), origin)

    def test_steady_failback_and_fast_recovery_from_failed_standby(self):
        self.assertEqual(choose(STANDBY, {PRIMARY: 11, STANDBY: 9}), STANDBY)
        self.assertEqual(choose(STANDBY, {PRIMARY: 12, STANDBY: 9}), PRIMARY)
        self.assertEqual(choose(STANDBY, {PRIMARY: 2, STANDBY: -2}), PRIMARY)

    @patch("failover.subprocess.run")
    def test_probe_requires_the_canonical_jmap_url(self, run):
        reply = run.return_value
        reply.returncode = 0
        reply.stdout = (
            b'{"apiUrl":"https://mail.solace.onl/jmap/","capabilities":{"urn:ietf:params:jmap:core":{}}}'
        )
        self.assertTrue(probe(PRIMARY))
        reply.stdout = reply.stdout.replace(b"mail.solace.onl", b"other.example")
        self.assertFalse(probe(PRIMARY))

    def test_dns_rejects_concurrent_or_unexpected_target(self):
        dns = Dns.__new__(Dns)
        dns.current = Mock(return_value={"content": STANDBY})
        dns.request = Mock()
        with self.assertRaises(ValueError):
            dns.switch(PRIMARY, STANDBY)
        with self.assertRaises(ValueError):
            dns.switch(STANDBY, PREVIOUS)
        dns.request.assert_not_called()


if __name__ == "__main__":
    unittest.main()
