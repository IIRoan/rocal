const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// EAS uploads by .easignore alone, so a pattern added only to a .gitignore (say, a new secret) would be uploaded.
const root = path.join(__dirname, "../..");
const patterns = (file) =>
  fs
    .readFileSync(path.join(root, file), "utf8")
    .split("\n")
    .map((line) => line.trim().replace(/\/$/, ""))
    .filter((line) => line && !line.startsWith("#"));

const easignore = new Set(patterns(".easignore"));
for (const [file, prefix] of [
  [".gitignore", ""],
  ["apps/native-calendar/.gitignore", "/apps/native-*/"],
  ["apps/native-mail/.gitignore", "/apps/native-*/"],
  ["packages/native-core/.gitignore", "/packages/native-core/"],
]) {
  for (const pattern of patterns(file)) {
    assert.ok(
      easignore.has(pattern) || easignore.has(prefix + pattern),
      `${file} ignores "${pattern}" but .easignore does not`,
    );
  }
}
