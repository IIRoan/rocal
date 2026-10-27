"""Regression coverage for the operator allowlist's validation boundary."""

import importlib.util
from pathlib import Path
import unittest


spec = importlib.util.spec_from_file_location("admin_allow", Path(__file__).resolve().parents[1] / "render-admin-allow.py")
admin_allow = importlib.util.module_from_spec(spec)
spec.loader.exec_module(admin_allow)


class AdminAllowTests(unittest.TestCase):
    def test_empty_value_grants_no_access(self):
        self.assertEqual(admin_allow.render(""), "")

    def test_accepts_only_valid_ipv4_and_ipv6_networks(self):
        self.assertEqual(admin_allow.render("203.0.113.11, 2001:db8:1::/64"),
                         "203.0.113.11/32\n2001:db8:1::/64\n")

    def test_rejects_internet_wide_access(self):
        for value in ("0.0.0.0/0", "::/0"):
            with self.assertRaisesRegex(ValueError, "entire internet"):
                admin_allow.render(value)

    def test_invalid_value_is_not_echoed_in_the_error(self):
        with self.assertRaisesRegex(ValueError, "^Invalid administrator network allowlist.$"):
            admin_allow.render("private-operator-address;$(false)")
