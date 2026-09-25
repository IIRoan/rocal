#!/usr/bin/env bun
/**
 * Publish an EAS Update using the same env as the matching eas.json build
 * profile, and pin runtimeVersion to the latest finished binary for that
 * profile so OTAs attach even when local fingerprints drift.
 *
 * Usage:
 *   bun run ./scripts/publish-update.ts preview
 *   bun run ./scripts/publish-update.ts production --message "fix login"
 *   bun run ./scripts/publish-update.ts development --non-interactive
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type EasJson = {
  build?: Record<
    string,
    {
      channel?: string;
      environment?: string;
      env?: Record<string, string>;
    }
  >;
};

type Target = {
  profile: string;
  branch: string;
  environment: string;
};

type EasBuild = {
  id: string;
  platform?: string;
  status?: string;
  runtimeVersion?: string | null;
  fingerprint?: { hash?: string | null } | null;
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

async function readCommandJson(command: string[]): Promise<unknown> {
  const child = Bun.spawn(command, {
    cwd: resolve(import.meta.dir, ".."),
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `${command.join(" ")} failed (${exitCode}): ${stderr || stdout}`,
    );
  }
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error(`${command.join(" ")} returned empty stdout`);
  }
  return JSON.parse(trimmed);
}

function runtimeFromBuild(build: EasBuild | null | undefined): string | null {
  const fingerprint = build?.fingerprint?.hash?.trim();
  if (fingerprint) return fingerprint;
  const runtime = build?.runtimeVersion?.trim();
  return runtime || null;
}

async function resolvePinnedRuntimes(
  profile: string,
): Promise<Array<{ platform: "ios" | "android"; runtimeVersion: string }>> {
  try {
    const builds = (await readCommandJson([
      "eas",
      "build:list",
      "--profile",
      profile,
      "--status",
      "finished",
      "--limit",
      "10",
      "--json",
      "--non-interactive",
    ])) as EasBuild[];

    const pinned: Array<{
      platform: "ios" | "android";
      runtimeVersion: string;
    }> = [];
    let sawIos = false;
    let sawAndroid = false;

    for (const build of builds) {
      const platform = build.platform?.toLowerCase();
      const runtimeVersion = runtimeFromBuild(build);
      if (!runtimeVersion) continue;
      if (platform === "ios" && !sawIos) {
        pinned.push({ platform: "ios", runtimeVersion });
        sawIos = true;
      } else if (platform === "android" && !sawAndroid) {
        pinned.push({ platform: "android", runtimeVersion });
        sawAndroid = true;
      }
      if (sawIos && sawAndroid) break;
    }
    return pinned;
  } catch (error) {
    console.warn(
      `[publish-update] could not resolve latest build runtime (${
        error instanceof Error ? error.message : String(error)
      }); falling back to app.config runtimeVersion`,
    );
    return [];
  }
}

const targetName = process.argv[2];
if (!targetName || !(targetName in TARGETS)) {
  usage();
}

const target = TARGETS[targetName]!;
const passthrough = process.argv.slice(3).filter((arg) => {
  // Platform is controlled per pinned runtime publish.
  return arg !== "-p" && arg !== "--platform" && !arg.startsWith("--platform=");
});
const hasMessage = passthrough.some(
  (arg) => arg === "--message" || arg.startsWith("--message="),
);
const hasNonInteractive = passthrough.includes("--non-interactive");

const easPath = resolve(import.meta.dir, "../eas.json");
const eas = JSON.parse(readFileSync(easPath, "utf8")) as EasJson;
const profile = eas.build?.[target.profile];
if (!profile) {
  console.error(`eas.json is missing build profile "${target.profile}"`);
  process.exit(1);
}

const profileEnv = profile.env ?? {};
const pinned = await resolvePinnedRuntimes(target.profile);

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

async function publishOnce(options: {
  platform?: "ios" | "android" | "all";
  runtimeVersion?: string;
}) {
  const env: NodeJS.ProcessEnv = { ...baseEnv };
  if (options.runtimeVersion) {
    env.EAS_UPDATE_RUNTIME_VERSION = options.runtimeVersion;
    console.log(
      `[publish-update] pinning ${options.platform ?? "all"} runtimeVersion=${options.runtimeVersion}`,
    );
  }

  const args = [
    "update",
    "--branch",
    target.branch,
    "--environment",
    target.environment,
    "--platform",
    options.platform ?? "all",
    ...passthrough,
  ];

  if (!hasMessage) {
    args.push("--message", `${target.branch}-update`);
  }
  if (!hasNonInteractive && !process.stdout.isTTY) {
    args.push("--non-interactive");
  }

  const child = Bun.spawn(["eas", ...args], {
    cwd: resolve(import.meta.dir, ".."),
    env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await child.exited;
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

if (pinned.length === 0) {
  await publishOnce({ platform: "all" });
} else {
  for (const entry of pinned) {
    await publishOnce({
      platform: entry.platform,
      runtimeVersion: entry.runtimeVersion,
    });
  }
}
