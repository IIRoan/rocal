/** Publish an EAS Update with the matching eas.json build profile's env under app.config's runtimeVersion, the one every installed binary embeds. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readEasUpdateTarget } from "./eas-build-profile";
import { validateNativeBuildEnvironment } from "../packages/native-core/expo-config.cjs";

function usage(): never {
  console.error(
    "Usage: bun run ./scripts/publish-update.ts <development|preview|testing|production|master> [--message ...] [--non-interactive] [...eas update flags]",
  );
  process.exit(1);
}

export async function publishNativeUpdate(appDirectory: string) {
  const targetName = process.env.SOLACE_UPDATE_TARGET ?? process.argv[2];
  if (!targetName) usage();
  const suppliedArgs: unknown = process.env.SOLACE_UPDATE_ARGUMENTS
    ? JSON.parse(process.env.SOLACE_UPDATE_ARGUMENTS)
    : process.argv.slice(3);
  if (
    !Array.isArray(suppliedArgs) ||
    !suppliedArgs.every((arg): arg is string => typeof arg === "string")
  )
    usage();
  const passthrough: string[] = suppliedArgs;
  if (passthrough.some((arg) => ["--channel", "--branch", "--environment", "--auto"].some((flag) => arg === flag || arg.startsWith(`${flag}=`)))) {
    throw new Error("Update routing comes from eas.json; channel, branch and environment flags cannot override it");
  }
  const hasMessage = passthrough.some(
    (arg) => arg === "--message" || arg.startsWith("--message="),
  );
  const hasNonInteractive = passthrough.includes("--non-interactive");

  const easPath = resolve(appDirectory, "eas.json");
  const eas: unknown = JSON.parse(readFileSync(easPath, "utf8"));
  const target = readEasUpdateTarget(eas, targetName);
  if (!target) {
    console.error(
      `eas.json has a missing or invalid update target "${targetName}"`,
    );
    process.exit(1);
  }

  const profileEnv = target.env;

  const baseEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...profileEnv,
  };

  if (process.env.SOLACE_UPDATE_ENVIRONMENT !== target.environment) {
    const loader = Bun.spawn(
      [
        "eas",
        "env:exec",
        target.environment,
        "--non-interactive",
        "bun ./scripts/publish-update.ts",
      ],
      {
        cwd: appDirectory,
        env: {
          ...baseEnv,
          SOLACE_UPDATE_ENVIRONMENT: target.environment,
          SOLACE_UPDATE_TARGET: targetName,
          SOLACE_UPDATE_ARGUMENTS: JSON.stringify(passthrough),
        },
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      },
    );
    const exitCode = await loader.exited;
    if (exitCode !== 0) process.exit(exitCode);
    return;
  }
  validateNativeBuildEnvironment(baseEnv);

  console.log(
    `[publish-update] profile=${target.profile} channel=${target.channel} environment=${target.environment}`,
  );
  console.log(
    `[publish-update] applying eas.json env: ${Object.keys(profileEnv).sort().join(", ") || "(none)"}`,
  );

  const args = [
    "update",
    "--channel",
    target.channel,
    "--environment",
    target.environment,
    ...passthrough,
  ];
  if (!hasMessage) {
    args.push("--message", `${target.channel}-update`);
  }
  if (!hasNonInteractive && !process.stdout.isTTY) {
    args.push("--non-interactive");
  }

  const child = Bun.spawn(["eas", ...args], {
    cwd: appDirectory,
    env: baseEnv,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
