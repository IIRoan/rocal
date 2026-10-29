const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Apple rejects uploads whose native code can request camera or microphone access without a purpose string, and we declare neither.
const CAPTURE_API = /AVCaptureDevice|requestRecordPermission/;
const root = path.join(__dirname, "../..");

function sourceFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.(swift|mm?|h)$/.test(entry.name) ? [file] : [];
  });
}

const dependencies = new Set(
  ["native-calendar", "native-mail"].flatMap((app) =>
    Object.keys(
      require(path.join(root, "apps", app, "package.json")).dependencies,
    ),
  ),
);
for (const name of dependencies) {
  const directory = path.join(root, "node_modules", name);
  for (const file of ["ios", "apple"].flatMap((platform) =>
    sourceFiles(path.join(directory, platform)),
  )) {
    assert.doesNotMatch(
      fs.readFileSync(file, "utf8"),
      CAPTURE_API,
      `${path.relative(root, file)} can request camera or microphone access`,
    );
  }
}
