"""Verify allocator settings under the container's unprivileged service user."""

import os
import subprocess
import unittest

IMAGE = os.environ.get("STALWART_TEST_IMAGE")


@unittest.skipUnless(IMAGE, "Set STALWART_TEST_IMAGE to the built mail image")
class MemoryConfigTests(unittest.TestCase):
    def test_allocator_enables_background_page_release(self):
        script = 'options="$(readlink /etc/malloc.conf || true)"; ln -sfn "${options:+$options,}stats_print:true" /etc/malloc.conf; runuser -u stalwart -- /usr/local/bin/stalwart --version'
        result = subprocess.run(
            ["podman", "run", "--rm", "--network", "none", "--user", "root", "--entrypoint", "/bin/sh", IMAGE, "-ec", script],
            capture_output=True, text=True, timeout=30,
        )
        self.assertEqual(result.returncode, 0)
        self.assertIn("opt.background_thread: true (background_thread: true)", result.stderr)


if __name__ == "__main__":
    unittest.main()
