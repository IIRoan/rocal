/** Publish an EAS Update with the matching eas.json build profile's env under app.config's runtimeVersion, the one every installed binary embeds. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readEasBuildProfile } from "./eas-build-profile";

type Target = {
  profile: string;
  branch: string;
  environment: string;
};

const TARGETS: Record<string, Target> = {
  development: {
    profile: "development",
    branch: "development",
    environment: "development",
  },
  preview: {
    profile: "preview",
    branch: "preview",
    environment: "preview",
  },
  testing: {
    profile: "preview",
    branch: "testing",
    environment: "preview",
  },
  production: {
    profile: "production",
    branch: "master",
    environment: "production",
  },
  master: {
    profile: "production",
    branch: "master",
    environment: "production",
  },
};

function usage(): never {
  console.error(
    "Usage: bun run ./scripts/publish-update.ts <development|preview|testing|production|master> [--message ...] [--non-interactive] [...eas update flags]",
  );
  process.exit(1);
}

export async function publishNativeUpdate(appDirectory: string) {
  const targetName = process.argv[2];
  if (!targetName) usage();
  const candidate = Object.hasOwn(TARGETS, targetName) ? TARGETS[targetName] : undefined;
  if (!candidate) usage();
  const target: Target = candidate;
  const passthrough = process.argv.slice(3);
  const hasMessage = passthrough.some(
    (arg) => arg === "--message" || arg.startsWith("--message="),
  );
  const hasNonInteractive = passthrough.includes("--non-interactive");

  const easPath = resolve(appDirectory, "eas.json");
  const eas: unknown = JSON.parse(readFileSync(easPath, "utf8"));
  const profile = readEasBuildProfile(eas, target.profile);
  if (!profile) {
    console.error(`eas.json has a missing or invalid build profile "${target.profile}"`);
    process.exit(1);
  }

  const profileEnv = profile.env ?? {};

  const baseEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...profileEnv,
  };

  for (const [key, value] of Object.entries(profileEnv)) {
    baseEnv[key] = value;
  }

  console.log(
    `[publish-update] profile=${target.profile} branch=${target.branch} environment=${target.environment}`,
  );
  console.log(
    `[publish-update] applying eas.json env: ${Object.keys(profileEnv).sort().join(", ") || "(none)"}`,
  );

  const args = [
    "update",
    "--branch",
    target.branch,
    "--environment",
    target.environment,
    ...passthrough,
  ];
  if (!hasMessage) {
    args.push("--message", `${target.branch}-update`);
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
