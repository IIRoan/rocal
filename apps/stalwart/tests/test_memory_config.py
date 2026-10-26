"""Verify allocator settings against the official Linux Stalwart binary."""

import os
from pathlib import Path
import shlex
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
BINARY = os.environ.get("STALWART_TEST_BINARY")


@unittest.skipUnless(BINARY, "Set STALWART_TEST_BINARY to the official Linux binary")
class MemoryConfigTests(unittest.TestCase):
    def test_allocator_enables_background_page_release(self):
        env = {key: value for key, value in os.environ.items() if not key.endswith("MALLOC_CONF")}
        for line in (ROOT / "Dockerfile").read_text().splitlines():
            if line.startswith("ENV "):
                for setting in shlex.split(line[4:]):
                    key, value = setting.split("=", 1)
                    if key.endswith("MALLOC_CONF"):
                        env[key] = value + ",stats_print:true"
        result = subprocess.run([BINARY, "--version"], env=env, capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 0)
        self.assertIn("opt.background_thread: true (background_thread: true)", result.stderr)


if __name__ == "__main__":
    unittest.main()
