const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Apple rejects uploads whose native code can request camera or microphone access without a purpose string, and we declare neither.
const CAPTURE_API = /AVCaptureDevice|requestRecordPermission/;
const root = path.join(__dirname, "../..");

// Every installed module counts, since Expo autolinks modules the apps never list directly.
const files = fs.globSync(
  [
    "node_modules/**/{ios,apple}/**/*.{swift,m,mm,h}",
    "packages/native-core/plugins/**/*.{swift,m,mm,h}",
  ],
  { cwd: root },
);
assert.ok(files.length > 0, "no iOS sources found; run bun install first");
for (const file of files) {
  assert.doesNotMatch(
    fs.readFileSync(path.join(root, file), "utf8"),
    CAPTURE_API,
    `${file} can request camera or microphone access`,
  );
}
