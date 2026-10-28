import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const appDirectory = resolve(__dirname, "../..");
let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "solace-update-test-"));
  writeFileSync(
    join(directory, "eas"),
    `#!/usr/bin/env node
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
if (args[0] === "env:exec") {
  if (!["development", "preview", "production"].includes(args[1])) process.exit(3);
  if (args.at(-1) !== "bun ./scripts/publish-update.ts") process.exit(3);
  const env = { ...process.env };
  if (!env.SOLACE_TEST_MISSING) {
    env.SOLACE_API_URL = "https://api.example.test";
    env.SOLACE_APP_URL = "https://app.example.test";
  }
  const result = spawnSync("bun", ["./scripts/publish-update.ts"], { env, stdio: "inherit" });
  process.exit(result.status ?? 1);
}
if (args[0] !== "update") process.exit(4);
fs.writeFileSync(process.env.SOLACE_TEST_OUTPUT, JSON.stringify({ args, variant: process.env.APP_VARIANT, source: process.env.SOLACE_ENV_SOURCE }));
`,
    { mode: 0o755 },
  );
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function publish(target: string, message: string, missingEnvironment = false, extraArgs: string[] = []) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("SOLACE_") || key === "EXPO_TOKEN") delete env[key];
  }
  return spawnSync(
    "bun",
    ["./scripts/publish-update.ts", target, "--message", message, ...extraArgs],
    {
      cwd: appDirectory,
      encoding: "utf8",
      env: {
        ...env,
        PATH: `${directory}${delimiter}${env.PATH ?? ""}`,
        SOLACE_TEST_OUTPUT: join(directory, "update.json"),
        ...(missingEnvironment ? { SOLACE_TEST_MISSING: "1" } : {}),
      },
    },
  );
}

describe("native update publisher", () => {
  it.each([
    {
      target: "development",
      channel: "development",
      environment: "development",
      variant: "development",
    },
    {
      target: "preview",
      channel: "preview",
      environment: "preview",
      variant: "preview",
    },
    {
      target: "testing",
      channel: "testing",
      environment: "preview",
      variant: "preview",
    },
    {
      target: "master",
      channel: "master",
      environment: "production",
      variant: "production",
    },
  ])(
    "loads EAS variables before publishing $target with literal arguments",
    ({ target, channel, environment, variant }) => {
      const message = "literal $(touch should-never-run) `echo nope` 'quoted'";
      const result = publish(target, message);
      expect(result.stderr).not.toContain("error:");
      expect(result.status).toBe(0);
      const value: unknown = JSON.parse(
        readFileSync(join(directory, "update.json"), "utf8"),
      );
      expect(value).toEqual({
        args: [
          "update",
          "--channel",
          channel,
          "--environment",
          environment,
          "--message",
          message,
          "--non-interactive",
        ],
        variant,
        source: "eas",
      });
    },
    10_000,
  );

  it("refuses to publish when the selected EAS environment is missing its API URL", () => {
    const result = publish("preview", "missing environment", true);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("SOLACE_API_URL");
    expect(() => readFileSync(join(directory, "update.json"))).toThrow();
  }, 10_000);

  it.each(["--channel=master", "--branch=master", "--environment=production", "--auto"])("rejects a routing override: %s", (flag) => {
    const result = publish("development", "override", false, [flag]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Update routing comes from eas.json");
    expect(() => readFileSync(join(directory, "update.json"))).toThrow();
  });
});
