/** Loads .env/.env.local (bun run skips env-file autoload for package scripts) and runs jevlint. */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

for (const file of [".env", ".env.local"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const name = match[1];
    const value = match[2] ?? "";
    if (name && process.env[name] === undefined) {
      process.env[name] = value.replace(/^["']|["']$/g, "");
    }
  }
}

const result = spawnSync("jevlint", process.argv.slice(2), { stdio: "inherit" });
if (result.error) {
  console.error("jevlint not found on PATH; install with: go install github.com/codegirl-007/jevlint/cmd/jevlint@v0.1.0");
  process.exit(2);
}
process.exit(result.status ?? 2);
