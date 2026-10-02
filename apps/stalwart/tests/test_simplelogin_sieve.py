"""Offline checks that the SimpleLogin DATA-stage script in the plan stays safe."""

import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SIEVE = ROOT / "stalwart/sieve/solace-simplelogin.sieve"
PLAN = ROOT / "stalwart/plan/30-mta.ndjson"


def plan_entry(object_name):
    for line in PLAN.read_text().splitlines():
        entry = json.loads(line)
        if entry.get("object") == object_name:
            return entry
    raise AssertionError(f"{object_name} missing from {PLAN.name}")


class SimpleLoginSieveTest(unittest.TestCase):
    def test_plan_contents_match_source(self):
        source = SIEVE.read_text()
        script = plan_entry("SieveSystemScript")["value"]["solace-simplelogin"]
        self.assertTrue(script["isActive"])
        self.assertEqual(
            script["contents"],
            source,
            "plan is stale, set contents to:\n" + json.dumps(source),
        )

    def test_markers_are_stripped_before_any_condition(self):
        source = SIEVE.read_text()
        first_if = source.index("\nif ")
        for header in ("X-Solace-SimpleLogin", "X-Solace-Original-From"):
            self.assertLess(source.index(f'deleteheader "{header}";'), first_if)

    def test_script_only_runs_for_inbound_smtp(self):
        stage = plan_entry("MtaStageData")
        self.assertEqual(stage["@type"], "update")
        self.assertEqual(
            stage["value"]["script"],
            {
                "else": "false",
                "match": {"0": {"if": "local_port == 25", "then": "'solace-simplelogin'"}},
            },
        )


if __name__ == "__main__":
    unittest.main()
