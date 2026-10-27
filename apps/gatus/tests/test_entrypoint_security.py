"""Exercise credential preparation in the actual entrypoint without starting services."""

import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ENTRYPOINT = Path(__file__).resolve().parents[1] / "entrypoint.sh"


class EntrypointSecurityTests(unittest.TestCase):
    def prepare(self, directory, config, pin="mail.test ssh-ed25519 test-pin"):
        data = Path(directory, "data")
        source = ENTRYPOINT.read_text().split("\nwrite_base_config\n", 1)[0]
        script = Path(directory, "entrypoint-functions.sh")
        script.write_text(source.replace("/data", str(data)) + '\nwrite_base_config\nappend_vps_ssh_endpoints\nprintf "%s" "$GATUS_SSH_KNOWN_HOSTS"\n')
        env = {"PATH": os.environ["PATH"], "PORT": "8080", "GATUS_CONFIG_YAML": config, "VPS_MONITOR_SSH_USERNAME": "monitor", "VPS_MONITOR_SSH_PRIVATE_KEY": "test-private-key"}
        if pin is not None:
            env["VPS_MONITOR_SSH_KNOWN_HOSTS"] = pin
        return data, subprocess.run(["sh", str(script)], env=env, capture_output=True, text=True, timeout=5)

    def test_existing_custom_endpoint_still_prepares_private_host_pins(self):
        with tempfile.TemporaryDirectory() as directory:
            data, result = self.prepare(directory, "endpoints:\n  - name: vps-health\n")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, str(data / "vps_monitor_known_hosts"))
            self.assertEqual((data / "config.yaml").read_text().count("name: vps-health"), 1)
            for name in ("config.yaml", "vps_monitor_key", "vps_monitor_known_hosts"):
                self.assertEqual((data / name).stat().st_mode & 0o777, 0o600)
            self.assertNotIn("test-private-key", result.stdout + result.stderr)

    def test_existing_custom_endpoint_cannot_skip_missing_pin_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            data, result = self.prepare(directory, "endpoints:\n  - name: vps-health\n", pin=None)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((data / "vps_monitor_key").exists())
            self.assertNotIn("test-private-key", result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
