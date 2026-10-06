/** Mechanical enforcement of the AGENTS.md rules (defined in scripts/repo-rules/), run by `bun run lint`. */
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

import { createContext, runRule, selfTest } from "./repo-rules/engine";
import { rules } from "./repo-rules";

const rootDir = path.join(__dirname, "..");
const args = process.argv.slice(2);
const onlyRules = new Set(args.filter((arg) => arg.startsWith("--rule=")).map((arg) => arg.slice("--rule=".length)));
const showCounts = args.includes("--counts");
const fileArgs = args.filter((arg) => !arg.startsWith("--"));

const readme = fs.readFileSync(path.join(__dirname, "repo-rules", "README.md"), "utf8");
const selfTestFailures = [
  ...selfTest(rules),
  ...rules.filter((rule) => !readme.includes(`| \`${rule.id}\` |`)).map((rule) => `${rule.id}: missing from scripts/repo-rules/README.md`),
];
if (selfTestFailures.length > 0) {
  console.error(`Repo rule self-test failed:\n${selfTestFailures.map((f) => `  - ${f}`).join("\n")}`);
  process.exit(1);
}

const activeRules = rules.filter((rule) => onlyRules.size === 0 || onlyRules.has(rule.id));
const unknown = [...onlyRules].filter((id) => !rules.some((rule) => rule.id === id));
if (unknown.length > 0) {
  console.error(`Unknown rule id(s): ${unknown.join(", ")}`);
  process.exit(1);
}

const files = (
  fileArgs.length > 0
    ? fileArgs.map((file) => path.relative(rootDir, path.resolve(file)))
    : execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: rootDir, encoding: "utf8" }).split("\0")
).filter((file) => file && fs.existsSync(path.join(rootDir, file)));

const failures: string[] = [];
const counts = new Map<string, number>();
for (const file of files) {
  const applicable = activeRules.filter((rule) => rule.files(file));
  if (applicable.length === 0) continue;
  const context = createContext(file, fs.readFileSync(path.join(rootDir, file), "utf8"));
  for (const rule of applicable) {
    for (const finding of runRule(rule, context)) {
      failures.push(`${file}:${finding.line} [${rule.id}] ${finding.message.replace(/\s+/g, " ")}`);
      counts.set(rule.id, (counts.get(rule.id) ?? 0) + 1);
    }
  }
}

if (showCounts) for (const [id, count] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`${String(count).padStart(5)}  ${id}`);
if (failures.length > 0) {
  if (!showCounts) console.error(`Repo rule violations (see scripts/repo-rules/README.md):\n${failures.map((f) => `  - ${f}`).join("\n")}`);
  console.error(`${failures.length} violation(s) across ${counts.size} rule(s).`);
  process.exit(1);
}
console.log(`Repo rules: OK (${activeRules.length} rules, ${files.length} files)`);
