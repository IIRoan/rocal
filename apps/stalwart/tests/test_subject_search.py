import json
import subprocess
import unittest
from unittest.mock import patch

import probe_subject_search as probe


class SubjectProbeTargetTests(unittest.TestCase):
    def test_command_timeout_does_not_expose_arguments(self):
        command = ["podman", "run", "-e", "PASSWORD=must-stay-private"]
        with patch.object(probe.subprocess, "run", side_effect=subprocess.TimeoutExpired(command, 90)):
            with self.assertRaisesRegex(RuntimeError, "run command timed out") as raised:
                probe.podman(*command[1:])
        self.assertNotIn("must-stay-private", str(raised.exception))
        self.assertTrue(raised.exception.__suppress_context__)

    def test_transient_network_cleanup_is_retried(self):
        removals = []

        def podman(*args):
            if args[:2] == ("network", "rm"):
                removals.append(args)
                if len(removals) == 1:
                    raise RuntimeError("Synthetic network teardown is still busy")
            if args[0] == "inspect":
                return json.dumps([{"NetworkSettings": {"Ports": {"8080/tcp": [
                    {"HostIp": "127.0.0.1", "HostPort": "12345"},
                ]}}}])
            return ""

        with patch.object(probe, "podman", side_effect=podman), patch.object(probe.time, "sleep"):
            with probe.target("localhost/test-subject-image"):
                pass
        self.assertEqual(len(removals), 2)

    def test_permanent_container_cleanup_failure_still_removes_the_other_resources(self):
        calls = []

        def podman(*args):
            calls.append(args)
            if args[0] == "inspect":
                return json.dumps([{"NetworkSettings": {"Ports": {"8080/tcp": [
                    {"HostIp": "127.0.0.1", "HostPort": "12345"},
                ]}}}])
            if args[0] == "rm" and args[-1].endswith("-mail"):
                raise RuntimeError("Synthetic removal failure")
            return ""

        with patch.object(probe, "podman", side_effect=podman), patch.object(probe.time, "sleep"):
            with self.assertRaisesRegex(RuntimeError, "cleanup failed.*container"):
                with probe.target("localhost/test-subject-image"):
                    pass
        self.assertEqual(len([args for args in calls if args[0] == "rm" and args[-1].endswith("-mail")]), 3)
        self.assertTrue(any(args[0] == "rm" and args[-1].endswith("-pg") for args in calls))
        self.assertEqual(calls[-1][:2], ("network", "rm"))

    def test_mail_waits_for_postgres_tcp_instead_of_its_temporary_unix_server(self):
        tcp_checks = 0
        tcp_ready = False

        def podman(*args):
            nonlocal tcp_checks, tcp_ready
            if args[0] == "exec" and args[2] == "pg_isready":
                if "-h" in args:
                    tcp_checks += 1
                    if tcp_checks < 2:
                        raise RuntimeError("Postgres TCP is starting")
                    tcp_ready = True
                return ""
            if args[0] == "run" and args[-1] == "localhost/test-subject-image":
                self.assertTrue(tcp_ready, "Unix readiness must not start the mail server")
            if args[0] == "inspect":
                return json.dumps([{"NetworkSettings": {"Ports": {"8080/tcp": [
                    {"HostIp": "127.0.0.1", "HostPort": "12345"},
                ]}}}])
            return ""

        with patch.object(probe, "podman", side_effect=podman), patch.object(probe.time, "sleep"):
            with probe.target("localhost/test-subject-image"):
                self.assertTrue(tcp_ready)
        self.assertEqual(tcp_checks, 2)

    def test_partial_server_creation_is_cleaned_up(self):
        calls = []

        def podman(*args):
            calls.append(args)
            if args[0] == "run" and args[-1] == "localhost/test-subject-image":
                raise RuntimeError("Synthetic server creation failed")
            return ""

        with patch.object(probe, "podman", side_effect=podman):
            with self.assertRaisesRegex(RuntimeError, "Synthetic server creation failed"):
                with probe.target("localhost/test-subject-image"):
                    self.fail("A failed container must never be used")

        names = [args[args.index("--name") + 1] for args in calls if args[0] == "run"]
        removed = [args[-1] for args in calls if args[0] == "rm"]
        self.assertEqual(removed, list(reversed(names)))
        self.assertEqual(calls[-1][:2], ("network", "rm"))

    def test_non_loopback_binding_is_refused_and_cleaned_up(self):
        calls = []

        def podman(*args):
            calls.append(args)
            if args[0] == "inspect":
                return json.dumps([{"NetworkSettings": {"Ports": {"8080/tcp": [
                    {"HostIp": "0.0.0.0", "HostPort": "12345"},
                ]}}}])
            return ""

        with patch.object(probe, "podman", side_effect=podman):
            with self.assertRaisesRegex(RuntimeError, "exclusive loopback binding"):
                with probe.target():
                    self.fail("An externally bound target must never be used")

        self.assertEqual(len([args for args in calls if args[0] == "rm"]), 2)
        self.assertFalse(any(args[-1] == "/tmp/solace-test-ready" for args in calls))

    def test_setup_finishes_before_the_target_can_be_used(self):
        events = []

        def podman(*args):
            if args[0] == "inspect":
                return json.dumps([{"NetworkSettings": {"Ports": {"8080/tcp": [
                    {"HostIp": "127.0.0.1", "HostPort": "12345"},
                ]}}}])
            if args[-1] == "/tmp/solace-test-ready":
                events.append("ready")
            return ""

        with patch.object(probe, "podman", side_effect=podman):
            with probe.target() as (base, _, _):
                self.assertEqual(base, "http://127.0.0.1:12345")
                events.append("used")
        self.assertEqual(events, ["ready", "used"])


if __name__ == "__main__":
    unittest.main()
