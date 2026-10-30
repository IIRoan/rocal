import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const redactor = resolve(__dirname, "../../../../scripts/eas-build-log.sed");

const fixtures = [
  {
    name: "distribution certificate holder and team",
    input:
      '[PREPARE_CREDENTIALS] Fingerprint = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", common name = iPhone Distribution: Jane Example (AB12CD34EF)',
    expected:
      '[PREPARE_CREDENTIALS] Fingerprint = "[redacted udid]", common name = [redacted]',
  },
  {
    name: "certificate holder with parentheses in its name",
    input:
      "[PREPARE_CREDENTIALS] common name = Apple Distribution: Example (EU), Inc. (AB12CD34EF)",
    expected: "[PREPARE_CREDENTIALS] common name = [redacted]",
  },
  {
    name: "certificate holder without a team suffix",
    input:
      "[PREPARE_CREDENTIALS] common name = iPhone Distribution: Jane Example",
    expected: "[PREPARE_CREDENTIALS] common name = [redacted]",
  },
  {
    name: "Apple team summary with an individual name",
    input: "Apple Team                AB12CD34EF (Jane Example (Individual))",
    expected: "Apple Team                [redacted]",
  },
  {
    name: "indented Apple team ID summary with an organization name",
    input: "  Apple Team ID: AB12CD34EF (Example (EU), Inc.)",
    expected: "  Apple Team ID: [redacted]",
  },
  {
    name: "inline Apple team ID without losing the target context",
    input:
      "[CONFIGURE_XCODE_PROJECT] Assigning provisioning profile 'Profile' (Apple Team ID: AB12CD34EF) to target: Solace",
    expected:
      "[CONFIGURE_XCODE_PROJECT] Assigning provisioning profile 'Profile' (Apple Team ID: [redacted]) to target: Solace",
  },
  {
    name: "certificate serial number",
    input: "Serial Number             0123456789ABCDEF",
    expected: "Serial Number             [redacted]",
  },
  {
    name: "developer portal ID",
    input: "  Developer Portal ID       ABC123DEF4",
    expected: "  Developer Portal ID       [redacted]",
  },
  {
    name: "legacy device UDID",
    input: "Device: 0123456789abcdef0123456789abcdef01234567",
    expected: "Device: [redacted udid]",
  },
  {
    name: "modern device UDID",
    input: "Device: 00008110-001A2B3C4D5E6001",
    expected: "Device: [redacted udid]",
  },
  {
    name: "provisioned device name",
    input: "  - Jane's iPhone (UDID: 0123456789abcdef0123456789abcdef01234567)",
    expected: "  - [redacted device]",
  },
  {
    name: "provisioned devices summary",
    input: "Provisioned devices       Jane's iPhone, Example iPad",
    expected: "Provisioned devices       [redacted]",
  },
  {
    name: "ordinary build output",
    input: "[RUN_FASTLANE] Successfully exported the archive",
    expected: "[RUN_FASTLANE] Successfully exported the archive",
  },
];

describe("public EAS build log redaction", () => {
  it.each(fixtures)("redacts $name", ({ input, expected }) => {
    const output = execFileSync("sed", ["-E", "-f", redactor], {
      input: input + "\n",
      encoding: "utf8",
    });
    expect(output).toBe(expected + "\n");
  });
});
