"""Check the configured conditions against scrapes produced by pinned Stalwart 1.1.0."""

import fnmatch
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).with_name("fixtures")


class StalwartMetricsTests(unittest.TestCase):
    def failures(self, body):
        config = (ROOT / "config.default.yaml").read_text().split("  - name: stalwart-metrics", 1)[1]
        conditions = re.findall(r'\[BODY\] (==|!=) pat\(([^)]+)\)', config)
        self.assertTrue(conditions)
        return [pattern for operator, pattern in conditions if fnmatch.fnmatchcase(body, pattern) != (operator == "==")]

    def test_healthy_target_scrape_satisfies_all_body_conditions(self):
        body = (FIXTURES / "stalwart-1.1.0-healthy.prom").read_text()
        self.assertEqual(self.failures(body), [])
        self.assertIn("# TYPE stalwart_http_request_time_seconds histogram", body)
        self.assertIn("stalwart_http_request_time_seconds_count", body)
        self.assertNotIn("http_request_time_count ", body)
        self.assertIn("# TYPE stalwart_users gauge", body)
        self.assertIn("# TYPE stalwart_domains gauge", body)

    def test_real_runtime_expiry_skip_trips_the_alert(self):
        body = (FIXTURES / "stalwart-1.1.0-encryption-skipped.prom").read_text()
        self.assertIn("stalwart_encryption_encryption_skipped_total 1", body)
        self.assertIn("*stalwart_encryption_encryption_skipped_total*", self.failures(body))

    def test_managed_alert_uses_the_actual_target_metric(self):
        plan = ROOT.parent / "stalwart/stalwart/plan/40-integrations.ndjson"
        rows = [json.loads(line) for line in plan.read_text().splitlines()]
        alert = next(row["value"]["alert-encryption-skipped"] for row in rows if row["object"] == "Alert")
        self.assertEqual(alert["condition"], {"else": '"encryption.encryption-skipped" > 0'})
        self.assertTrue(alert["enable"])
        self.assertIn("plaintext", alert["emailAlert"]["body"])

    def test_missing_exporter_families_never_passes(self):
        self.assertTrue(self.failures(""))
        body = (FIXTURES / "stalwart-1.1.0-healthy.prom").read_text()
        self.assertTrue(self.failures(body.replace("stalwart_http_request_time_seconds_count", "retired_http_request_time_count")))


if __name__ == "__main__":
    unittest.main()
